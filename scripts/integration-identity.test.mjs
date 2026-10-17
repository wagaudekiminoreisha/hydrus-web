import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {IntegrationStore} from './integration-core.mjs';
import {startManagedBridge} from './managed-bridge.mjs';
import {createHmac} from 'node:crypto';
import {createServer,request} from 'node:http';
import localProxy from './local-integration-proxy.cjs';
import {createIntegrationServer} from './integration-server.mjs';

const first='11111111-1111-4111-8111-111111111111', second='22222222-2222-4222-8222-222222222222';
test('background handshake completes after Gallery is configured without an open UI',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-background-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  let configured=false;
  const key='background-fixture-hydrus-key';
  const {server,store}=await createIntegrationServer({directory,token:'background-test-bridge-credential',pollIntervalMs:20,fetcher:async(url,options)=>{
    if(String(url).endsWith('/Gallery/instance'))return Response.json({instanceId:first});
    if(!configured)return Response.json({error:'Gallery is not configured yet.'},{status:409});
    const body=JSON.parse(options.body);
    const proof=role=>createHmac('sha256',key).update(`hydrus-web-handshake-v1\n${role}\n${first}\n${body.nonce}`).digest('hex');
    assert.equal(body.proof,proof('client'));
    return Response.json({instanceId:first,proof:proof('server')});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  await store.configure({comfyUrl:'http://gallery.test',hydrusApiKey:key});
  await new Promise(resolve=>setTimeout(resolve,60));assert(!store.config.comfyInstanceId);
  configured=true;
  for(let at=0;at<100&&!store.config.comfyInstanceId;at++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(store.config.comfyInstanceId,first);
});
test('automatic handshake waits for Gallery configuration and verifies both proofs before pinning',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-handshake-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  let savedKey='',identity=first,tamper=false;const key='fixture-hydrus-api-key';
  const store=new IntegrationStore(directory,{fetcher:async(url,options)=>{
    if(String(url).endsWith('/Gallery/instance'))return Response.json({instanceId:identity});
    assert(String(url).endsWith('/Gallery/handshake'));
    assert.equal(options.redirect,'error');
    assert(!options.body.includes(key),'the Hydrus key must not be sent to Gallery');
    const body=JSON.parse(options.body);
    const proof=role=>createHmac('sha256',savedKey).update(`hydrus-web-handshake-v1\n${role}\n${identity}\n${body.nonce}`).digest('hex');
    if(!savedKey)return Response.json({error:'Save the Hydrus connection in Gallery first.'},{status:409});
    if(body.proof!==proof('client'))return Response.json({error:'Hydrus API keys differ.'},{status:403});
    return Response.json({instanceId:identity,proof:tamper?'invalid':proof('server')});
  }});
  await store.load();await store.configure({comfyUrl:'http://comfy.test',hydrusApiKey:key});
  await assert.rejects(store.handshake(),/Save the Hydrus connection/);assert(!store.config.comfyInstanceId);
  savedKey='other-key';await assert.rejects(store.handshake(),/keys differ/);assert(!store.config.comfyInstanceId);
  savedKey=key;tamper=true;await assert.rejects(store.handshake(),/did not prove/);assert(!store.config.comfyInstanceId);
  tamper=false;await store.handshake();assert.equal(store.config.comfyInstanceId,first);
  const reloaded=new IntegrationStore(directory);await reloaded.load();assert.equal(reloaded.config.comfyInstanceId,first);
  identity=second;await assert.rejects(store.handshake(),/instance changed/);
  await store.configure({comfyUrl:'http://changed-address.test'});await assert.rejects(store.handshake(),/instance changed/);
});

test('local app proxy authenticates internally and rejects hostile origins and hosts',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-proxy-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const bridge=await startManagedBridge({HYDRUS_WEB_BRIDGE_DATA:directory});
  t.after(()=>new Promise(resolve=>bridge.close(resolve)));
  const app=createServer((req,res)=>localProxy.proxyLocalIntegration(req,res,bridge));
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.close(resolve)));
  const base='http://127.0.0.1:'+app.address().port;
  assert.equal((await fetch(base+'/__integration/api/health')).status,200);
  assert.equal((await fetch(bridge.integrationTarget+'/health')).status,401);
  assert.equal((await fetch(base+'/__integration/api/config',{headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await fetch(base+'/__integration/api/config',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  const status=await new Promise((resolve,reject)=>{const req=request(base+'/__integration/api/config',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(status,403);
  assert(!localProxy.allowed({socket:{remoteAddress:'192.168.1.2'},headers:{host:'localhost'}}));
});
test('transfers require pairing and block a reverse proxy switching instances',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-identity-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  let identity=first,uploads=0,uploadHeader;
  const store=new IntegrationStore(directory,{fetcher:async(url,options)=>{
    if(String(url).endsWith('/Gallery/instance'))return Response.json({instanceId:identity});
    if(String(url).includes('/get_files/file'))return new Response('image',{headers:{'content-type':'image/png'}});
    if(String(url).endsWith('/upload/image')){uploads++;uploadHeader=options.headers['X-Gallery-Instance'];assert.equal(options.redirect,'error');return Response.json({name:'test.png'});}
    return Response.json({});
  }});
  await store.load();await store.configure({comfyUrl:'http://comfy.test',hydrusApiKey:'fixture'});
  const asset={id:'h',source:'hydrus',hash:'a'.repeat(64)};
  store.registerAsset(asset);
  await assert.rejects(store.importToComfy('h'),/pair its instance/);
  await store.configure({comfyInstanceId:first});store.registerAsset(asset);
  await store.importToComfy('h');assert.equal(uploads,1);assert.equal(uploadHeader,first);
  identity=second;
  await assert.rejects(store.importToComfy('h'),/instance changed/);assert.equal(uploads,1);
  await assert.rejects(store.configure({comfyInstanceId:'33333333-3333-4333-8333-333333333333'}),/changed during pairing/);
  await store.configure({comfyInstanceId:second});assert.equal(store.assets.size,0);
  await store.configure({comfyUrl:'http://other.test'});assert.equal(store.config.comfyInstanceId,second);
});

test('managed bridge generates private credentials and does not adopt an occupied port',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-managed-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const env={HYDRUS_WEB_BRIDGE_DATA:directory,HYDRUS_WEB_BRIDGE_PORT:'0'};
  const server=await startManagedBridge(env);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(startManagedBridge({...env,HYDRUS_WEB_BRIDGE_PORT:String(server.address().port)}),/EADDRINUSE/);
  assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/health')).status,401);
});
