const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROME_PATH, headless: true});
  try {
    const context = await browser.newContext({viewport: {width: 1100, height: 850}, serviceWorkers: 'block', acceptDownloads: true});
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const poster = fs.readFileSync(path.join(__dirname, '../src/assets/maskable-512x512.png'));
    const records = [1, 2, 3].map(id => ({file_id: id, hash: String(id).repeat(64), size: 1000, mime: 'image/png', filetype_enum: 2,
      width: 512, height: 512, has_audio: false, is_local: true, known_urls: [], file_services: {current: {}}, tags: {}, notes: {}}));
    await page.addInitScript(() => {
      window.showDirectoryPicker = undefined;
      localStorage.setItem('hydrus-web-1_hydrusApiUrl', 'http://hydrus.test');
      localStorage.setItem('hydrus-web-1_hydrusApiKey', 'fixture-key');
      localStorage.setItem('hydrus-web-1_appSettings', JSON.stringify({version: 1, mediaPlayNext: true, slideshowIntervalSeconds: 60, sendViews: false,
        viewerShowSelect: false, viewerShowSlideshow: false, viewerShowKeyboardHelp: false}));
    });
    await page.route('http://hydrus.test/**', async route => {
      const url = new URL(route.request().url()), endpoint = url.pathname;
      let value = {};
      if(endpoint === '/api_version') value = {version: 89, hydrus_version: 641};
      if(endpoint === '/get_services') value = {services: {tag: {service_key: 'tag', name: 'my tags', type: 5}}};
      if(endpoint === '/get_files/search_files') value = {file_ids: [1, 2, 3]};
      if(endpoint === '/get_files/file_metadata') value = {metadata: records, hydrus_version: 641};
      if(endpoint === '/get_files/thumbnail' || endpoint === '/get_files/file') {
        await route.fulfill({body: poster, contentType: 'image/png', headers: {
          'Access-Control-Allow-Origin': '*',
          ...(url.searchParams.get('download') ? {'Content-Disposition': `attachment; filename="${url.searchParams.get('hash')}.png"`} : {})
        }}); return;
      }
      await route.fulfill({json: value, headers: {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}});
    });
    await page.goto('http://127.0.0.1:8192/');
    await page.getByRole('button', {name: 'Search', exact: true}).click();
    await page.locator('.image-list-link').first().click();
    await page.locator('.pswp').waitFor();
    const selected = () => page.locator('.pswp__button--select-current').getAttribute('aria-pressed');
    const index = () => page.locator('.pswp__counter').innerText();
    await page.keyboard.press('s');
    assert.equal(await selected(), 'true', 'S works during a slideshow with its toolbar button hidden');
    await page.locator('.pswp').dispatchEvent('keydown', {key: 's', repeat: true, bubbles: true});
    assert.equal(await selected(), 'true', 'Key repeats must not repeatedly toggle selection');
    await page.keyboard.press('s');
    assert.equal(await selected(), 'false');
    await page.keyboard.press('Shift+s');
    await page.waitForFunction(() => document.querySelector('.pswp__counter').textContent.includes('2'));
    assert.equal(await selected(), 'false');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.pswp__counter').textContent.includes('1'));
    assert.equal(await selected(), 'true', 'Shift+S selects without deselecting an already selected file');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.pswp__button--slideshow').getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('p');
    assert.equal(await page.locator('.pswp__button--slideshow').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', {name: 'Viewer keyboard shortcuts'});
    await help.waitFor();
    const before = await index();
    await page.keyboard.press('s');
    await page.keyboard.press('ArrowRight');
    assert.equal(await selected(), 'true');
    assert.equal(await index(), before);
    await page.keyboard.press('Escape');
    await help.waitFor({state: 'detached'});
    assert.equal(await page.locator('.pswp').count(), 1, 'Escape closes help without closing the viewer');
    await page.keyboard.press('i');
    await page.locator('mat-bottom-sheet-container').waitFor();
    await page.keyboard.press('ArrowRight');
    assert.equal(await index(), before);
    await page.keyboard.press('Escape');
    await page.locator('mat-bottom-sheet-container').waitFor({state: 'detached'});
    await page.keyboard.press('a');
    await page.getByRole('menu').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({state: 'detached'});
    assert.equal(await page.locator('.pswp').count(), 1);
    await page.locator('.pswp').evaluate(root => {
      const input = document.createElement('input'); input.className = 'keyboard-fixture'; root.append(input); input.focus();
    });
    await page.keyboard.type('spaid');
    await page.keyboard.press('ArrowRight');
    assert.equal(await selected(), 'true');
    assert.equal(await index(), before);
    assert.equal(await page.locator('.keyboard-fixture').inputValue(), 'spaid');
    await page.locator('.pswp').evaluate(root => {root.querySelector('.keyboard-fixture').remove(); root.focus();});
    const download = page.waitForEvent('download');
    await page.keyboard.press('d');
    assert((await download).suggestedFilename().includes(records[0].hash));
    await page.keyboard.press('Escape');
    await page.locator('.pswp').waitFor({state: 'detached'});
    assert.deepEqual(errors, []);
    console.log('PASS viewer keyboard selection, select-and-next, slideshow, help, info, selection actions, download, overlay and typing isolation, key repeats, and hidden toolbar controls');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exit(1);});
