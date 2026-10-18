// Real built Hydrus Web + Gallery Python fixture on 8191; no Node bridge.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 let child,browser,logs='';
 const configureGallery=async body=>{const response=await fetch('http://127.0.0.1:8191/Gallery/hydrus/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert(response.ok,await response.text());};
 const base=process.env.DIRECT_WEB_URL||'http://127.0.0.1:8194',gallery='http://127.0.0.1:8191';
 try{
  if(!process.env.DIRECT_WEB_URL){
   child=spawn(process.execPath,[path.join(__dirname,'serve-mobile.mjs')],{env:{...process.env,HYDRUS_WEB_HOST:'127.0.0.1',HYDRUS_WEB_PORT:'8194'},stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  }
  for(let i=0;i<100;i++){
   try{if((await fetch(base+'/')).ok)break;}catch{}
   if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error(logs);
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:900}});const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(()=>{
   if(!localStorage.getItem('hydrus-web-1_hydrusApiKey')){
    localStorage.setItem('hydrus-web-1_hydrusApiKey','a'.repeat(64));
    localStorage.setItem('hydrus-web-1_hydrusApiUrl','http://127.0.0.1:45870');
   }
  });
  await page.goto(base+'/settings/comfyui');
  assert.equal(await page.getByLabel('Bridge address',{exact:true}).count(),0);
  assert.equal(await page.getByLabel('Bridge token',{exact:true}).count(),0);
  await page.getByLabel('ComfyUI address',{exact:true}).fill(gallery);
  await configureGallery({clear_access_key:true});
  await page.getByRole('button',{name:'Save & connect',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Save the Hydrus connection in Gallery first'}).waitFor();
  await configureGallery({access_key:'a'.repeat(64)});
  await page.getByText('Connected directly to ComfyUI Gallery',{exact:true}).waitFor({timeout:25000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('hydrus-web-comfy-instance')),'11111111-1111-4111-8111-111111111111');
  let expired=false;
  await page.route('**/Gallery/hydrus-web/output',async route=>{if(!expired&&route.request().method()==='POST'){expired=true;await route.fulfill({status:401,json:{error:'fixture expired session'},headers:{'Access-Control-Allow-Origin':new URL(base).origin}});}else await route.continue();});
  await page.goto(base+'/comfyui');await page.getByRole('button',{name:'View study-1.png',exact:true}).waitFor();
  assert.equal(await page.getByLabel('ComfyUI address',{exact:true}).count(),0);
  const thumbnail=page.locator('.media-grid article').first().locator('img');await thumbnail.waitFor();
  await page.waitForFunction(()=>document.querySelector('.media-grid img')?.naturalWidth>0);
  await page.getByRole('button',{name:'View study-1.png',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.integration-viewer img')?.naturalWidth>0);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  if(process.env.DIRECT_PAGING==='1'){
   await page.getByLabel('Order',{exact:true}).selectOption('name');
   await page.getByRole('button',{name:'View study-1.png',exact:true}).waitFor();
   await page.getByRole('button',{name:'Open folder direct-paging',exact:true}).click();
   await page.getByRole('button',{name:'View page-000.png',exact:true}).waitFor();
   for(let i=0;i<30&&await page.locator('.media-grid article').count()<120;i++){await page.locator('.load-more').scrollIntoViewIfNeeded();await page.waitForTimeout(150);}
   assert.equal(await page.locator('.media-grid article').count(),120);
   await page.getByRole('button',{name:'Up one folder',exact:true}).click();await page.getByRole('button',{name:'View study-1.png',exact:true}).waitFor();
  }
  await configureGallery({access_key:'b'.repeat(64)});
  await page.goto(base+'/settings/comfyui');await page.getByRole('alert').filter({hasText:'Hydrus API keys differ'}).waitFor();
  await configureGallery({access_key:'a'.repeat(64)});
  await configureGallery({hydrus_web_enabled:false});
  await page.goto(base+'/settings/comfyui');await page.getByRole('alert').filter({hasText:'connection is disabled in Gallery'}).waitFor();
  await configureGallery({hydrus_web_enabled:true});
  await page.evaluate(()=>localStorage.setItem('hydrus-web-comfy-instance','different-installation'));
  await page.goto(base+'/settings/comfyui');
  await page.getByRole('button',{name:'Confirm replacement Gallery instance',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('hydrus-web-comfy-instance')),'different-installation');
  await page.getByRole('button',{name:'Confirm replacement Gallery instance',exact:true}).click();
  await page.getByText('Connected directly to ComfyUI Gallery',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
  assert(requests.some(url=>url.startsWith(gallery+'/Gallery/hydrus-web/handshake')));
  assert(!requests.some(url=>url.includes('/__integration/')||url.includes(':47838')),'no bridge discovery or requests');
  assert(expired,'expired session triggered automatic re-handshake');
  assert(!logs.includes('Local integration is managed'),'launcher did not start bridge');
  assert.deepEqual(errors,[]);
  console.log('PASS real cross-origin handshake, automatic reconnect, image previews/originals, replacement confirmation, mobile layout and no Node bridge');
 }finally{
  await configureGallery({access_key:'a'.repeat(64),hydrus_web_enabled:true}).catch(()=>{});
  await browser?.close();
  if(child&&child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
