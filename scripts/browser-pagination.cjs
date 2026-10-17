const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const poster=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT0kAAAAASUVORK5CYII=','base64');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const context=await browser.newContext({viewport:{width:1100,height:850},serviceWorkers:'block'});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[],requests=[],tickets=[],sessions=new Map();let generation=0,failNext=false,holdNext=false,releasePage;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('hydrus-web-integration-enabled','true');
    localStorage.setItem('hydrus-web-integration-url','http://127.0.0.1:47838');
    localStorage.setItem('hydrus-web-integration-token','fixture-only-token-24characters');
    localStorage.setItem('hydrus-web-1_appSettings',JSON.stringify({version:1,mediaAutoplay:false,mediaLoop:false}));
  });
  await page.route('http://127.0.0.1:47838/**',async route=>{
    const endpoint=new URL(route.request().url()).pathname,body=route.request().postData()?route.request().postDataJSON():{};
    if(endpoint.startsWith('/media/'))return route.fulfill({body:poster,contentType:'image/png'});
    let value={};
    if(endpoint==='/health')value={ok:true};
    if(endpoint==='/config')value={comfyUrl:'http://comfy.test',hydrusUrl:'http://hydrus.test',folders:[],hasHydrusKey:false};
    if(endpoint==='/tags')value={services:{}};
    if(endpoint==='/ticket'){tickets.push(body);value={ticket:'fixture-ticket'};}
    if(endpoint==='/search'||endpoint==='/local') {
      requests.push({endpoint,body});let session,offset;
      if(body.cursor){const [id,at]=body.cursor.split(':');session=sessions.get(id);offset=Number(at);}
      else {
        const id=String(++generation),fresh=body.tags?.includes('fresh'),source=endpoint==='/local'?'folder':body.source;
        session={id,source,rows:Array.from({length:fresh?3:260},(_,at)=>({id:id+'-'+at,source:source==='both'?(at%2?'hydrus':'comfy'):source,name:(fresh?'fresh-':'file-')+String(at).padStart(3,'0')+'.png',mime:'image/png',timestamp:1000-at,metadata:{}}))};
        sessions.set(id,session);offset=0;
      }
      if(body.cursor&&holdNext){holdNext=false;await new Promise(resolve=>{releasePage=resolve;});}
      if(body.cursor&&failNext){failNext=false;return route.fulfill({status:503,json:{error:'Temporary page failure'}});}
      const end=Math.min(offset+48,session.rows.length);
      value={entries:session.rows.slice(offset,end),nextCursor:end<session.rows.length?session.id+':'+end:null,prefixes:[],warnings:[]};
    }
    await route.fulfill({json:value});
  });
  const cards=page.locator('.media-grid article');
  async function waitCount(n){await page.waitForFunction(n=>document.querySelectorAll('.media-grid article').length===n,n);}
  async function scrollPage(){const before=await cards.count();await page.locator('.load-more').scrollIntoViewIfNeeded();await page.waitForFunction(n=>document.querySelectorAll('.media-grid article').length>n,before);}
  try {
    await page.goto('http://127.0.0.1:8192/comfyui');await waitCount(48);
    await page.getByLabel('Select file-000.png',{exact:true}).check();
    await page.waitForFunction(()=>!!document.querySelector('.preview img'));
    assert(tickets.filter(ticket=>ticket.thumbnail).length<48,'offscreen thumbnails must not all request tickets');
    while(await cards.count()<260)await scrollPage();
    assert.equal(await cards.locator('input:checked').count(),1);
    assert.equal(new Set(await cards.locator('.preview').allTextContents()).size,260);
    await page.getByText('All matching media loaded.',{exact:true}).waitFor();
    const completed=requests.length;await page.waitForTimeout(150);assert.equal(requests.length,completed);
    console.log('PASS ComfyUI scroll beyond 200, lazy thumbnails, retained selection and end of results');
    await page.goto('http://127.0.0.1:8192/integration');await page.getByRole('button',{name:'Connect',exact:true}).click();
    await page.getByRole('button',{name:'Search / refresh metadata',exact:true}).click();await waitCount(48);
    failNext=true;await page.locator('.load-more').scrollIntoViewIfNeeded();
    await page.getByRole('button',{name:'Retry loading more',exact:true}).waitFor();assert.equal(await cards.count(),48);
    const failedCursor=requests.at(-1).body.cursor;
    await page.getByRole('button',{name:'Retry loading more',exact:true}).click();await waitCount(96);
    assert.equal(requests.at(-1).body.cursor,failedCursor);
    const sources=await cards.locator('.pick').allTextContents();assert(sources.some(text=>text.includes('hydrus'))&&sources.some(text=>text.includes('comfy')));
    await page.getByLabel('Order',{exact:true}).selectOption('name');await waitCount(48);assert.equal(requests.at(-1).body.order,'name');
    await page.getByLabel('Source',{exact:true}).selectOption('folder');await waitCount(48);assert.equal(requests.at(-1).endpoint,'/local');
    await scrollPage();assert((await cards.locator('.pick').allTextContents()).every(text=>text.includes('folder')));
    console.log('PASS mixed/local paging, same-cursor retry and sort/source reset');
    await page.goto('http://127.0.0.1:8192/comfyui');await waitCount(48);
    await page.getByRole('button',{name:'View file-000.png',exact:true}).click();
    const viewer=page.getByRole('dialog',{name:'Integration gallery viewer'});
    for(let at=1;at<=48;at++) {
      await viewer.getByRole('button',{name:'Next',exact:true}).click();
      await viewer.getByAltText('file-'+String(at).padStart(3,'0')+'.png',{exact:true}).waitFor();
    }
    await waitCount(96);await viewer.getByRole('button',{name:'Close',exact:true}).click();
    console.log('PASS viewer Next loads the next page at the loaded boundary');
    await page.getByRole('button',{name:'Search / refresh metadata',exact:true}).click();await waitCount(48);
    holdNext=true;await page.locator('.load-more').scrollIntoViewIfNeeded();await page.getByText('Loading more media…',{exact:true}).waitFor();
    await page.getByLabel('Tags',{exact:true}).fill('fresh');await page.getByRole('button',{name:'Search / refresh metadata',exact:true}).click();await waitCount(3);
    assert(releasePage);releasePage();await page.waitForTimeout(200);assert.equal(await cards.count(),3);
    assert((await cards.locator('.preview').allTextContents()).every(text=>text.includes('fresh-')));
    await page.screenshot({path:process.env.PAGINATION_SCREENSHOT||'/private/tmp/hydrus-pagination.png',fullPage:false});
    assert.deepEqual(errors,[]);console.log('PASS stale pages are discarded after a replacement search; no browser errors');
  }finally{releasePage?.();await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
