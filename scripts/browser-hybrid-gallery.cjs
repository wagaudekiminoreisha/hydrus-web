// Built Angular app against the real authenticated Gallery QA fixture.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');const assert=require('node:assert/strict');const path=require('node:path');
(async()=>{
 let child,browser,logs='';const base='http://127.0.0.1:8196',gallery='http://127.0.0.1:8191',key='a'.repeat(64);
 const json=async(url,body,headers={})=>{const response=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});assert(response.ok,await response.clone().text());return response.json();};
 try{
  const catalogue=await json(gallery+'/Gallery/source/hashes',{urls:['/static_gallery/study-1.png','/static_gallery/study-2.png','/static_gallery/study-3.png']});
  const h1=catalogue.hashes['/static_gallery/study-1.png'],h2=catalogue.hashes['/static_gallery/study-2.png'];
  let prefix=await json(gallery+'/Gallery/prefixes');
  prefix=await json(gallery+'/Gallery/prefixes',{action:'save',revision:prefix.revision,name:'Hybrid QA',terms:['azure sky']});
  const p=prefix.library.prefixes.find(row=>row.name==='Hybrid QA');
  await json(gallery+'/Gallery/prefixes',{action:'associate',revision:prefix.revision,prefix_id:p.id,image_keys:['sha256:'+h1],image_refs:{['sha256:'+h1]:{hash:h1}}});
  await json('http://127.0.0.1:45870/add_notes/set_notes',{hash:h2,notes:{'ComfyUI Gallery generation metadata':JSON.stringify({prompt:{'92':{class_type:'KSampler',inputs:{positive:['17',0]}},'17':{class_type:'CLIPTextEncode',inputs:{text:'autumn forest'}},'source':{class_type:'GalleryImageSource',inputs:{sources:JSON.stringify({layout:'single',active_index:0,images:[{input_name:h1+'.png'}]})}}}})}},{'Hydrus-Client-API-Access-Key':key});
  child=spawn(process.execPath,[path.join(__dirname,'serve-mobile.mjs')],{env:{...process.env,HYDRUS_WEB_HOST:'127.0.0.1',HYDRUS_WEB_PORT:'8196',HYDRUS_API_PROXY:'http://127.0.0.1:45870/'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:900}}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(({base,gallery,key})=>{localStorage.setItem('hydrus-web-1_hydrusApiKey',key);localStorage.setItem('hydrus-web-1_hydrusApiUrl',base+'/hydrus-api/');localStorage.setItem('hydrus-web-comfy-url',gallery);},{base,gallery,key});
  await page.goto(base+'/comfyui');await page.getByRole('button',{name:'View study-1.png',exact:true}).waitFor();
  await page.getByRole('button',{name:'Hybrid',exact:true}).click();
  await page.getByText('4 matches · 4 unique files loaded',{exact:true}).waitFor();
  assert.equal(await page.locator('.media-grid article').count(),4);
  assert.equal(await page.locator('.source-badge').filter({hasText:'comfy + hydrus'}).count(),4);
  await page.getByLabel('Tags or @prefix').fill('azure');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('0 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByLabel('Tags or @prefix').fill('azure sky');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('1 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByLabel('Tags or @prefix').fill('');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('4 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.media-grid article img')].filter(img=>img.naturalWidth>0).length===4);
  await page.getByLabel('Select study-3.png',{exact:true}).check();
  await page.locator('summary').filter({hasText:'Prefix associations · 1 selected'}).click();
  await page.getByLabel('Associate with prefix',{exact:true}).selectOption(p.id);await page.getByRole('button',{name:'Save pairing',exact:true}).click();
  await page.getByText('Prefix pairing saved.',{exact:false}).waitFor();
  assert.equal(await page.locator('.media-grid img').evaluateAll(images=>images.filter(image=>image.naturalWidth>0).length),4,'filter and pairing changes retain loaded thumbnails');
  const first=page.locator('.media-grid article').filter({has:page.getByRole('button',{name:'View study-1.png',exact:true})});
  await first.getByRole('button',{name:'Related images',exact:true}).click();
  await page.getByText('2 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByLabel('Lineage · same source / generated from').uncheck();
  await page.getByLabel('Other prefix associations').check();
  await page.getByText('1 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByRole('button',{name:'View study-3.png',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'View study-1.png',exact:true}).count(),0);
  await page.getByRole('button',{name:'Clear related search'}).click();
  await page.getByLabel('Tags or @prefix').fill('@Hybrid QA');await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('3 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByRole('button',{name:'View study-1.png',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.integration-viewer img')?.naturalWidth>0);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const imageResponse=await fetch(gallery+'/static_gallery/study-1.png');
  await page.locator('input[type=file]').setInputFiles({name:'dropped-source.png',mimeType:'image/png',buffer:Buffer.from(await imageResponse.arrayBuffer())});
  await page.getByText('2 matches · 4 unique files loaded',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear related search'}).click();
  await page.getByLabel('Tags or @prefix').fill('');
  await page.getByRole('button',{name:'Hydrus',exact:true}).click();await page.getByText('4 matches · 4 unique files loaded',{exact:true}).waitFor();
  assert.equal(await page.getByRole('checkbox',{checked:true}).count(),0);
  await page.setViewportSize({width:390,height:844});assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(__dirname,'../.work/qa-hybrid-browser.png'),fullPage:true});
  const batches=[];
  await page.route('**/hydrus-api/get_files/search_files?**',route=>route.fulfill({json:{file_ids:Array.from({length:235},(_,i)=>i+1)}}));
  await page.route('**/hydrus-api/get_files/file_metadata?**',async route=>{
    const ids=JSON.parse(new URL(route.request().url()).searchParams.get('file_ids')||'[]');batches.push(ids);
    const actual=await (await route.fetch()).json();const byId=new Map(actual.metadata.map(row=>[row.file_id,row]));
    await route.fulfill({json:{metadata:ids.map(id=>byId.get(id)||{file_id:id,hash:id.toString(16).padStart(64,'0'),mime:'image/png',tags:{},notes:{}})}});
  });
  const poster=Buffer.from(await (await fetch(gallery+'/static_gallery/study-1.png')).arrayBuffer());
  await page.route('**/hydrus-api/get_files/thumbnail?**',route=>route.fulfill({body:poster,contentType:'image/png'}));
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await page.getByText('100 matches · 100 unique files loaded · more results load as you scroll',{exact:true}).waitFor();
  for(let i=0;i<30&&await page.locator('.media-grid article').count()<235;i++){await page.locator('.load-more').scrollIntoViewIfNeeded();await page.waitForTimeout(150);}
  assert.equal(await page.locator('.media-grid article').count(),235);
  assert.deepEqual(batches.map(ids=>ids.length),[100,100,35]);assert.equal(new Set(batches.flat()).size,235);
  assert.deepEqual(errors,[]);assert(!requests.some(url=>url.includes(':47838')));
  console.log('PASS hybrid hash deduplication, exact tags, pairing, prefix inheritance, lineage exclusions, image-file matching, viewer, source changes, 235-item paging, mobile and no companion bridge');
 }finally{await browser?.close();if(child&&child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}}
})().catch(error=>{console.error(error);process.exitCode=1;});
