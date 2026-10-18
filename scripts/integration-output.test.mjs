import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {IntegrationStore} from './integration-core.mjs';
const identity='11111111-1111-4111-8111-111111111111';

test('output browsing is folder-local, read-only, and independent of Hydrus and metadata scans',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-output-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const calls=[];
 const store=new IntegrationStore(directory,{fetcher:async(url,options)=>{
  const parsed=new URL(url);calls.push(parsed.pathname);
  if(parsed.pathname==='/Gallery/instance')return Response.json({instanceId:identity});
  assert.equal(options.headers['X-Gallery-Instance'],identity);
  if(parsed.pathname==='/Gallery/output-directory'){
   assert.equal(parsed.searchParams.get('path'),'nested');assert.equal(parsed.searchParams.get('offset'),'48');
   return Response.json({items:[{kind:'folder',name:'child',path:'nested/child'},{kind:'file',path:'nested/a.png',name:'a.png',url:'/Gallery/output-file?path=nested%2Fa.png',thumbnailUrl:'/Gallery/output-thumbnail?url=a',mime:'image/png'}],total:50,nextOffset:null});
  }
  if(parsed.pathname==='/Gallery/output-file')return new Response('image');
  throw new Error('Unexpected endpoint '+parsed.pathname);
 }});
 await store.load();await store.configure({comfyUrl:'http://comfy.test'});
 const page=await store.outputDirectory({folder:'nested',offset:48});assert.equal(page.folders[0].path,'nested/child');assert.equal(page.entries.length,1);assert.equal(page.entries[0].metadata,undefined);
 assert.equal(await(await store.media(page.entries[0].id)).text(),'image');
 assert(!calls.includes('/Gallery/images'));assert(!calls.includes('/get_services'));
 await assert.rejects(store.outputDirectory({folder:'../outside'}),/Invalid output folder/);
 store.config.comfyInstanceId='22222222-2222-4222-8222-222222222222';await assert.rejects(store.outputDirectory(),/instance changed/);
});

test('unavailable output browser explains which remote component needs updating',async t=>{
 const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-output-old-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const store=new IntegrationStore(directory,{fetcher:async url=>new URL(url).pathname==='/Gallery/instance'?Response.json({instanceId:identity}):new Response('',{status:404})});
 await store.load();await store.configure({comfyUrl:'http://old-gallery.test'});
 await assert.rejects(store.outputDirectory(),/Update ComfyUI-Gallery on the remote/);
});

test('diagnostics stop after an unreachable identity rather than scanning a catalogue',async()=>{
 const calls=[];const store=new IntegrationStore('unused',{fetcher:async url=>{calls.push(url);throw new Error('unreachable');}});
 store.config.comfyUrl='http://offline.test';const result=await store.diagnostics();assert.equal(calls.length,1);assert.equal(result.checks[0].ok,false);
});
