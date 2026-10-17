const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createServer}=require('node:http');
const {createHmac}=require('node:crypto');
const {spawn}=require('node:child_process');
const {mkdtemp,rm}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const directory=await mkdtemp(path.join(require('node:os').tmpdir(),'hydrus-auto-browser-'));
 const key='browser-fixture-shared-hydrus-key',first='11111111-1111-4111-8111-111111111111';
 let galleryConfigured=false,identity=first,child,browser,logs='';
 const gallery=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');let value={};
  if(url.pathname==='/Gallery/instance')value={instanceId:identity,mediaRootMatches:true};
  else if(url.pathname==='/Gallery/handshake'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
   if(!galleryConfigured){res.writeHead(409,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Save the Hydrus connection in Gallery first.'}));return;}
   const proof=role=>createHmac('sha256',key).update(`hydrus-web-handshake-v1\n${role}\n${identity}\n${body.nonce}`).digest('hex');
   assert.equal(body.proof,proof('client'));value={instanceId:identity,proof:proof('server')};
  }
  else if(url.pathname==='/Gallery/images')value={folders:{output:{}}};
  else if(url.pathname==='/get_services')value={services:{}};
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(value));
 });
 try{
  await new Promise(resolve=>gallery.listen(0,'127.0.0.1',resolve));const galleryURL='http://127.0.0.1:'+gallery.address().port;
  const env={...process.env,HYDRUS_WEB_BRIDGE_DATA:directory,HYDRUS_WEB_PORT:'8194',HYDRUS_WEB_HOST:'127.0.0.1'};
  delete env.HYDRUS_WEB_BRIDGE_TOKEN;delete env.HYDRUS_WEB_BRIDGE_PORT;
  const external=process.env.AUTO_INTEGRATION_URL;
  if(!external){
   child=spawn(process.execPath,[path.join(__dirname,'serve-mobile.mjs')],{env,stdio:['ignore','pipe','pipe']});
   child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
  }
  const base=external||'http://127.0.0.1:8194';
  for(let i=0;i<100;i++){
   try{if((await fetch(base+'/__integration/api/health')).ok)break;}catch{}
   if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error(logs);
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const page=await browser.newPage({serviceWorkers:'block'});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({key,url})=>{
   localStorage.setItem('hydrus-web-1_hydrusApiKey',key);localStorage.setItem('hydrus-web-1_hydrusApiUrl',url);
  },{key,url:galleryURL});
  await page.goto(base+'/integration');
  await page.getByLabel('ComfyUI address',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Bridge token',{exact:true}).count(),0);
  await page.getByLabel('ComfyUI address',{exact:true}).fill(galleryURL);
  await page.getByRole('button',{name:'Save integration settings',exact:true}).click();
  await page.getByText('Save the Hydrus connection in Gallery first.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Pair this Gallery instance for transfers',exact:true}).count(),0);
  galleryConfigured=true; // The Gallery settings have now been saved; do not press any Hydrus Web buttons.
  await page.getByText('Gallery connected automatically using the saved Hydrus connection.',{exact:true}).waitFor({timeout:25000});
  const config=await (await fetch(base+'/__integration/api/config')).json();assert.equal(config.comfyInstanceId,first);assert(!('hydrusApiKey' in config));
  identity='22222222-2222-4222-8222-222222222222';
  const switched=await fetch(base+'/__integration/api/handshake',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(switched.status,400);assert.match((await switched.json()).error,/instance changed/);
  assert.deepEqual(errors,[]);
  console.log('PASS automatic '+(external?'dev':'production')+' bridge without token, automatic Hydrus settings reuse, delayed Gallery handshake and instance-switch rejection');
 }finally{
  await browser?.close();if(child){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}
  await new Promise(resolve=>gallery.close(resolve));await rm(directory,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
