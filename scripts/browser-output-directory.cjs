const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {spawn}=require('node:child_process');
const {mkdtemp,rm,readFile}=require('node:fs/promises');
const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const directory=await mkdtemp(path.join(require('node:os').tmpdir(),'hydrus-output-ui-'));
 const identity='11111111-1111-4111-8111-111111111111';
 let browser,child,logs='',services=0,metadataScans=0;
 const poster=await readFile(path.join(__dirname,'../src/assets/maskable-512x512.png'));
 const media=(name,folder='')=>({kind:'file',name,path:folder+name,url:'/Gallery/output-file?path='+encodeURIComponent(folder+name),thumbnailUrl:'/Gallery/output-thumbnail?url='+encodeURIComponent(folder+name),mime:'image/png',timestamp:1});
 const remote=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');let value={};
  if(url.pathname==='/Gallery/instance')value={instanceId:identity};
  else if(url.pathname==='/Gallery/output-directory'){
   const folder=url.searchParams.get('path')||'',offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||48);
   const rows=folder==='nested'?Array.from({length:120},(_,i)=>media('nested-'+i+'.png','nested/')):[{kind:'folder',name:'nested',path:'nested'},media('root.png')];
   value={items:rows.slice(offset,offset+limit),folder,total:rows.length,nextOffset:offset+limit<rows.length?offset+limit:null};
  } else if(url.pathname==='/get_services'){services++;return;} // Reproduce an unreachable/stalled Hydrus endpoint.
  else if(url.pathname==='/Gallery/images'){metadataScans++;res.writeHead(500).end();return;}
  else if(['/Gallery/output-file','/Gallery/output-thumbnail'].includes(url.pathname)){
   assert.equal(req.headers['x-gallery-instance'],identity);res.writeHead(200,{'Content-Type':'image/png'}).end(poster);return;
  }
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(value));
 });
 try{
  await new Promise(resolve=>remote.listen(0,'127.0.0.1',resolve));const remoteUrl='http://127.0.0.1:'+remote.address().port;
  const env={...process.env,HYDRUS_WEB_BRIDGE_DATA:directory,HYDRUS_WEB_HOST:'127.0.0.1',HYDRUS_WEB_PORT:'8195'};delete env.HYDRUS_WEB_BRIDGE_TOKEN;delete env.HYDRUS_WEB_BRIDGE_PORT;
  child=spawn(process.execPath,[path.join(__dirname,'serve-mobile.mjs')],{env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',chunk=>logs+=chunk);child.stderr.on('data',chunk=>logs+=chunk);
  const base='http://127.0.0.1:8195';for(let i=0;i<100;i++){try{if((await fetch(base+'/__integration/api/health')).ok)break;}catch{}if(child.exitCode!==null)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,150));}
  await fetch(base+'/__integration/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({comfyUrl:remoteUrl,hydrusUrl:remoteUrl,hydrusApiKey:'fixture-only-key',comfyInstanceId:identity})});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Keep every diagnostics response pending; it must not lock the settings form.
  await page.route('**/__integration/api/diagnostics',()=>{});
  await page.goto(base+'/settings/comfyui');const save=page.getByRole('button',{name:'Save integration settings',exact:true});await save.waitFor();await page.waitForFunction(()=>!document.querySelector('app-integration button')?.disabled);
  assert(await save.isEnabled());assert.equal(services,0);
  await save.click();await page.getByRole('status').filter({hasText:'Settings saved.'}).waitFor();assert(await save.isEnabled());
  await page.getByRole('button',{name:'Refresh tag services',exact:true}).click();assert(await save.isEnabled());
  await page.getByText('The request timed out. Check the server address and try again.',{exact:true}).first().waitFor({timeout:25000});
  await page.getByRole('button',{name:'Check connection',exact:true}).waitFor({timeout:25000});assert(await save.isEnabled());assert.equal(services,1);
  await page.goto(base+'/comfyui');await page.getByRole('heading',{name:'Output directory',exact:true}).waitFor();await page.getByRole('button',{name:'View root.png',exact:true}).waitFor();
  for(const name of ['Source','Tags','Prefix / lineage','Additional tags','ComfyUI address'])assert.equal(await page.getByLabel(name,{exact:true}).count(),0,name);
  assert.equal(await page.getByText('Manage selected Hydrus tags, parents & aliases',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Export selection to Hydrus',exact:true}).count(),0);
  await page.getByRole('button',{name:'Open folder nested',exact:true}).click();await page.getByRole('button',{name:'View nested-0.png',exact:true}).waitFor();
  for(let attempt=0;attempt<30&&await page.locator('.media-grid article').count()<120;attempt++){
   await page.locator('.load-more').scrollIntoViewIfNeeded();await page.waitForTimeout(200);
  }
  assert.equal(await page.locator('.media-grid article').count(),120);
  await page.getByRole('button',{name:'View nested-0.png',exact:true}).click();const viewer=page.getByRole('dialog',{name:'Integration gallery viewer'});await viewer.getByAltText('nested-0.png',{exact:true}).waitFor();await viewer.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Up one folder',exact:true}).click();await page.getByRole('button',{name:'View root.png',exact:true}).waitFor();
  if(process.env.OUTPUT_BROWSER_SCREENSHOT)await page.screenshot({path:process.env.OUTPUT_BROWSER_SCREENSHOT});
  await page.setViewportSize({width:390,height:844});assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));
  assert.equal(metadataScans,0);assert.deepEqual(errors,[]);console.log('PASS editable Settings during stalled diagnostics/Hydrus, bounded timeouts, output-only folders, 120-file paging, previews and mobile layout; no metadata scans or Hydrus browser tools');
 }finally{
  await browser?.close();if(child){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
  remote.closeAllConnections();await new Promise(resolve=>remote.close(resolve));await rm(directory,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
