import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {IntegrationStore} from './integration-core.mjs';
import {startManagedBridge} from './managed-bridge.mjs';

const first='11111111-1111-4111-8111-111111111111', second='22222222-2222-4222-8222-222222222222';
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
  await store.configure({comfyUrl:'http://other.test'});assert.equal(store.config.comfyInstanceId,'');
});

test('managed bridge is opt-in and does not adopt an occupied port',async t=>{
  assert.equal(await startManagedBridge({}),undefined);
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-managed-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const env={HYDRUS_WEB_BRIDGE_TOKEN:'fixture-token-with-at-least-24-characters',HYDRUS_WEB_BRIDGE_DATA:directory,HYDRUS_WEB_BRIDGE_PORT:'0'};
  const server=await startManagedBridge(env);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(startManagedBridge({...env,HYDRUS_WEB_BRIDGE_PORT:String(server.address().port)}),/EADDRINUSE/);
  assert.equal((await fetch('http://127.0.0.1:'+server.address().port+'/health')).status,401);
});
