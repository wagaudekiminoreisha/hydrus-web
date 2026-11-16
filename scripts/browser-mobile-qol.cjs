const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true});
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hydrus-mobile-qol-'));
  try {
    for (const width of [320, 390, 768]) {
      const context = await browser.newContext({viewport: {width, height: 844}, isMobile: true, hasTouch: true, serviceWorkers: 'block'});
      const page = await context.newPage();
      page.setDefaultTimeout(12000);
      const errors = [], queries = [];
      page.on('pageerror', error => console.error('PAGE ERROR', error.message));
      page.on('pageerror', error => errors.push(error.message));
      const poster = fs.readFileSync(path.join(__dirname, '../src/assets/maskable-512x512.png'));
      const records = [1, 2, 3].map(id => ({file_id: id, hash: String(id).repeat(64), size: 1000, mime: 'image/png', filetype_enum: 2,
        width: 512, height: 512, has_audio: false, is_local: true, known_urls: ['https://danbooru.donmai.us/posts/1'],
        file_services: {current: {'616c6c206c6f63616c206d65646961': {time_imported: 1700000000 + id * 86400}}},
        tags: {tag: {display_tags: {0: ['artist:alice', 'batch:patreon']}, storage_tags: {0: ['artist:alice', 'batch:patreon']}}}, notes: {}}));
      await page.addInitScript(() => {
        if (localStorage.getItem('hydrus-web-1_hydrusApiUrl')) return;
        localStorage.setItem('hydrus-web-1_hydrusApiUrl', 'http://hydrus.test');
        localStorage.setItem('hydrus-web-1_hydrusApiKey', 'fixture-key');
        localStorage.setItem('hydrus-web-1_appSettings', JSON.stringify({version: 1, mediaAutoplay: false, sendViews: false}));
      });
      await page.route('http://hydrus.test/**', async route => {
        const url = new URL(route.request().url()), endpoint = url.pathname;
        let value = {};
        if (endpoint === '/api_version') value = {version: 89, hydrus_version: 641};
        if (endpoint === '/get_services') value = {services: {tag: {service_key: 'tag', name: 'my tags', type: 5}}};
        if (endpoint === '/get_files/search_files') { queries.push(JSON.parse(url.searchParams.get('tags'))); value = {file_ids: [1, 2, 3]}; }
        if (endpoint === '/get_files/file_metadata') {
          const ids = JSON.parse(url.searchParams.get('file_ids') || 'null');
          const hashes = JSON.parse(url.searchParams.get('hashes') || 'null');
          value = {metadata: records.filter(file => ids ? ids.includes(file.file_id) : hashes ? hashes.includes(file.hash) : true), hydrus_version: 641};
        }
        if (endpoint === '/add_tags/search_tags') value = {tags: [{value: 'artist:alice', count: 3}]};
        if (endpoint === '/manage_file_relationships/get_file_relationships') value = {file_relationships: {[records[0].hash]: {'8': [records[1].hash]}}};
        if (endpoint === '/get_files/thumbnail' || endpoint === '/get_files/file') { await route.fulfill({body: poster, contentType: 'image/png'}); return; }
        await route.fulfill({json: value, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}});
      });
      await page.goto('http://127.0.0.1:8192/');
      await page.getByRole('button', {name: 'Search', exact: true}).click();
      const thumbnails = page.locator('.image-list-link');
      await thumbnails.first().waitFor();
      await thumbnails.first().tap();
      await page.locator('.pswp').waitFor();
      await page.locator('.pswp__button--select-current').click();
      await page.locator('.pswp__button--select-current').click();
      assert.equal(await page.locator('.pswp__selection-status').isVisible(), false);
      assert.equal(await page.locator('.pswp__group-selection-status').isVisible(), false);
      assert.equal(await page.locator('.pswp__button--selection-actions').isVisible(), false);
      const bounds = await page.locator('.pswp__top-bar').evaluate(bar => [...bar.children].filter(el => getComputedStyle(el).display !== 'none').map(el => ({left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right})));
      assert(bounds.every(box => box.left >= 0 && box.right <= width + 1), 'Viewer controls must fit the viewport');
      await page.screenshot({path: path.join(output, `viewer-${width}.png`)});
      await page.locator('.pswp__button--custom-close').click();
      await page.waitForFunction(() => !document.querySelector('.virtual-scroll.selection-mode'));
      await thumbnails.first().tap();
      await page.locator('.pswp').waitFor();
      await page.locator('.pswp__button--info').click();
      const sheet = page.locator('mat-bottom-sheet-container');
      await sheet.getByRole('button', {name: 'More options', exact: true}).click();
      await page.getByRole('menuitem', {name: /Search from this file/}).click();
      const dialog = page.getByRole('dialog', {name: 'Search from this file', exact: true});
      await dialog.getByRole('button', {name: 'Load known duplicates', exact: true}).waitFor();
      await page.waitForFunction(() => !document.querySelector('app-image-search-dialog mat-progress-bar'));
      await dialog.getByRole('button', {name: 'Load known duplicates', exact: true}).click();
      await page.waitForFunction(() => !document.querySelector('app-image-search-dialog mat-progress-bar'));
      await dialog.getByRole('combobox', {name: /Import time/}).click();
      await page.getByRole('option', {name: 'Same calendar day as any reference', exact: true}).click();
      await page.locator('.mat-mdc-select-panel').waitFor({state: 'detached'});
      await dialog.getByRole('checkbox', {name: 'Same width and height', exact: true}).check();
      await dialog.locator('mat-dialog-content').evaluate(content => content.scrollTop = 0);
      await page.screenshot({path: path.join(output, `search-${width}.png`)});
      await dialog.getByRole('button', {name: 'Search', exact: true}).click();
      await dialog.waitFor({state: 'detached'});
      assert(queries.at(-1).flat().some(tag => tag.startsWith('system:import time = ')));
      assert(queries.at(-1).includes('system:width = 512'));
      assert(queries.at(-1).includes('system:height = 512'));

      // Touch-edit an OR chip, add a suggestion, and ensure its incomplete query is cleared.
      await page.goto('http://127.0.0.1:8192/?tags=' + encodeURIComponent(JSON.stringify([['artist:old', 'batch:old']])));
      await page.locator('app-browse app-tag-input mat-chip-row .tag-chip-text').first().click();
      await page.screenshot({path: path.join(output, `or-${width}.png`)});
      const orDialog = page.getByRole('dialog');
      await orDialog.getByRole('heading', {name: 'Edit OR Search'}).waitFor();
      const input = orDialog.locator('app-tag-input input');
      await input.fill('art');
      await page.getByRole('option', {name: /artist:alice/}).click();
      assert.equal(await input.inputValue(), '');
      await orDialog.getByRole('button', {name: 'Save', exact: true}).click();
      await orDialog.waitFor({state: 'detached'});
      assert((await page.locator('app-browse app-tag-input mat-chip-row').first().innerText()).includes('artist:alice'));
      const shelf = page.locator('.selection-shelf');
      const shelfBounds = await shelf.boundingBox();
      assert(shelfBounds.x >= 0 && shelfBounds.x + shelfBounds.width <= width + 1);
      await page.screenshot({path: path.join(output, `shelf-${width}.png`)});
      if (width === 390) {
        await page.goto('http://127.0.0.1:8192/settings');
        await page.getByRole('tab', {name: 'App Settings', exact: true}).click();
        const toggles = ['Selection groups shelf', 'Floating selection button', 'Thumbnail selection checkmarks', 'Thumbnail group badges',
          'Viewer file counter', 'Viewer zoom percentage', 'Viewer slideshow button', 'Viewer selection checkbox', 'Viewer selection actions',
          'Viewer download button', 'Viewer share button', 'Viewer file info button', 'Viewer Selected badge', 'Viewer group membership overlay'];
        for (const name of toggles) await page.getByRole('switch', {name, exact: true}).uncheck();
        await page.getByRole('button', {name: 'Save', exact: true}).click();
        await page.getByText('Settings saved', {exact: true}).waitFor();
        await page.goto('http://127.0.0.1:8192/');
        await thumbnails.first().waitFor();
        assert.equal(await page.locator('.selection-shelf').count(), 0);
        assert.equal(await page.locator('.select-fab').isVisible(), false);
        await thumbnails.first().tap();
        await page.locator('.pswp').waitFor();
        for (const selector of ['.pswp__counter', '.pswp__zoom-level', '.pswp__button--slideshow', '.pswp__button--select-current', '.pswp__button--download', '.pswp__button--info', '.pswp__button--share']) {
          assert.equal(await page.locator(selector).isVisible(), false, `${selector} setting must persist after reload`);
        }
        await page.locator('.pswp__button--custom-close').click();
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log(`PASS mobile toolbar bounds, hidden badges, empty-selection exit, reference search, touch OR editing and autocomplete clearing at 320/390/768px. Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
