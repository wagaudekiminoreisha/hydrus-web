import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {IntegrationStore,pngMetadata,inheritedTags,prefixMembers} from './integration-core.mjs';
import {createIntegrationServer} from './integration-server.mjs';

function png(metadata) {const chunks=Object.entries(metadata).map(([key,value])=>{const data=Buffer.from(key+'\0'+JSON.stringify(value)),chunk=Buffer.alloc(data.length+12);chunk.writeUInt32BE(data.length);chunk.write('tEXt',4);data.copy(chunk,8);return chunk;});return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),...chunks]);}
async function fixture(t,fetcher) {const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-integration-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new IntegrationStore(path.join(directory,'state'),{fetcher});await store.load();await store.configure({hydrusApiKey:'fixture-only-key',hydrusUrl:'http://hydrus.test',tagServiceKey:'abcd',comfyUrl:'http://comfy.test'});return {directory,store};}
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
test('PNG prompts become inherited tags and preserve negative conditioning',()=>{
  const metadata={prompt:{1:{class_type:'CLIPTextEncode',inputs:{text:'red, blue'}},2:{class_type:'CLIPTextEncode',inputs:{text:'blur'}},3:{class_type:'KSampler',inputs:{positive:['1',0],negative:['2',0]}}}};
  assert.deepEqual(pngMetadata(png(metadata)),metadata);
  assert.deepEqual(inheritedTags(metadata),['comfyui outputs','positive_prompt:red','positive_prompt:blue','negative_prompt:blur']);
});
test('recorded prompt resolutions replace templates and include source-prefix terms',()=>{
  const metadata={prompt:{1:{class_type:'GalleryPromptEncode',inputs:{text:'{red|blue}, ⟦source⟧',source_text:['s',4]}},s:{class_type:'GalleryImageSource',inputs:{sources:JSON.stringify({layout:'single',images:[{prompt:{positive:'source tag'}}]})}},2:{class_type:'KSampler',inputs:{positive:['1',0]}}},gallery_prompts:{1:{resolved:'red, source tag'}}};
  assert.deepEqual(inheritedTags(metadata),['comfyui outputs','positive_prompt:red','positive_prompt:source tag']);
  delete metadata.gallery_prompts;metadata.prompt[1].inputs.text='red, ⟦source⟧';
  assert.deepEqual(inheritedTags(metadata),['comfyui outputs','positive_prompt:red','positive_prompt:source tag']);
});
test('watchers require two stable scans, retain originals and persist deduplication',async t=>{
  const calls=[];const {directory,store}=await fixture(t,async(url,options)=>{calls.push({url:String(url),body:options.body});return String(url).includes('/add_files/add_file')?json({status:1,hash:'a'.repeat(64)}):json({});});
  const folder=path.join(directory,'media');await fs.mkdir(folder);const file=path.join(folder,'output.png');await fs.writeFile(file,png({prompt:{1:{class_type:'CLIPTextEncode',inputs:{text:'blue sky'}}}}));
  const rule=await store.addFolder({path:folder,tags:['source:folder'],inheritPrompts:true,archive:true});
  await store.scan(true);assert.equal(calls.length,0);await store.scan(true);assert.equal(calls.filter(call=>call.url.includes('/add_files/add_file')).length,1);
  const tagBody=JSON.parse(calls.find(call=>call.url.includes('/add_tags/add_tags')).body);assert.deepEqual(tagBody.service_keys_to_tags.abcd,['source:folder','comfyui outputs','positive_prompt:blue sky']);
  assert(await fs.stat(file));assert.equal(rule.imported,1);await store.scan(true);assert.equal(calls.filter(call=>call.url.includes('/add_files/add_file')).length,1);
  const reloaded=new IntegrationStore(store.directory,{fetcher:store.fetcher});await reloaded.load();await reloaded.scan(true);assert.equal(calls.filter(call=>call.url.includes('/add_files/add_file')).length,1);
  await store.setFolderEnabled(rule.id,false);await fs.writeFile(path.join(folder,'new.png'),png({}));await store.scan(true);assert.equal(rule.imported,1);
});
test('failed tagging is retried before an import is marked complete',async t=>{
  let failures=1,imports=0;const {directory,store}=await fixture(t,async(url)=>{if(String(url).includes('/add_tags/')&&failures-- >0)return new Response('No',{status:503});if(String(url).includes('/add_files/add_file')){imports++;return json({status:imports===1?1:2,hash:'b'.repeat(64)});}return json({});});
  const folder=path.join(directory,'media');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'one.png'),png({}));const rule=await store.addFolder({path:folder,tags:['test']});
  await store.scan(true);await store.scan(true);assert.equal(rule.imported,0);assert.match(rule.lastError,/503/);await store.scan(true);assert.equal(rule.imported,1);assert.equal(imports,2);
});
test('prefix lineage uses associations and source hashes when prompt words do not match',async t=>{
  const parent='c'.repeat(64),child='d'.repeat(64),library={prefixes:[{id:'p',name:'Pose',tags:['unrelated prompt']}],associations:{['sha256:'+parent]:{prefix_id:'p',image:{hash:parent}}}};
  const files=[{url:'/static_gallery/child.png',type:'image',hash:child,metadata:{prompt:{1:{class_type:'GalleryImageSource',inputs:{sources:JSON.stringify({layout:'single',images:[{input_name:'hydrus/'+parent+'.png'}]})}}}}}];
  assert(prefixMembers(files,library,'p').hashes.has(child));
  const requests=[];const {store}=await fixture(t,async(url)=>{const parsed=new URL(url);requests.push(parsed);if(parsed.pathname==='/Gallery/settings')return json({relativePath:'./'});if(parsed.pathname==='/Gallery/images')return json({folders:{output:files}});if(parsed.pathname==='/Gallery/prefixes')return json({library});if(parsed.pathname==='/Gallery/source/hashes')return json({hashes:{[files[0].url]:child}});if(parsed.pathname==='/get_files/file_metadata')return json({metadata:[{hash:parent,mime:'image/png',tags:{}},{hash:child,mime:'image/png',tags:{}}]});throw new Error('Unexpected '+parsed.pathname);});
  const results=await store.search({prefixId:'p'});assert.equal(results.entries.length,3);assert(!requests.some(url=>url.pathname==='/get_files/search_files'));assert.deepEqual(JSON.parse(requests.find(url=>url.pathname==='/get_files/file_metadata').searchParams.get('hashes')),[parent,child]);
});
test('remote imports use ComfyUI upload and preserve Hydrus provenance',async t=>{
  const calls=[];const {store}=await fixture(t,async(url,options)=>{const endpoint=new URL(url).pathname;calls.push({endpoint,body:options.body});if(endpoint==='/get_files/file')return new Response(png({}),{headers:{'content-type':'image/png'}});if(endpoint==='/upload/image')return json({name:'a.png',subfolder:'hydrus'});if(endpoint==='/Gallery/source/input')return json({input_name:'hydrus/a.png'});throw new Error(endpoint);});
  store.registerAsset({id:'h',source:'hydrus',hash:'a'.repeat(64),metadata:{test:1},remote:{hash:'a'.repeat(64)}});
  await store.importToComfy('h');const imported=JSON.parse(calls.find(call=>call.endpoint==='/Gallery/source/input').body);assert.equal(imported.metadata.gallery_origin,'hydrus');assert.equal(imported.metadata.hydrus.hash,'a'.repeat(64));assert.equal(imported.name,'hydrus/a.png');
});
test('bridge authenticates requests, limits origins and keeps the Hydrus key out of config responses',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-bridge-http-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const token='test-only-bridge-token-24characters';const {server,store}=await createIntegrationServer({directory,token,origins:['http://allowed.test']});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/config')).status,401);assert.equal((await fetch(base+'/health',{headers:{Authorization:'Bearer '+token,Origin:'http://evil.test'}})).status,403);
  await store.configure({hydrusApiKey:'do-not-expose-this'});const config=await(await fetch(base+'/config',{headers:{Authorization:'Bearer '+token,Origin:'http://allowed.test'}})).text();assert(!config.includes('do-not-expose-this'));assert.equal(JSON.parse(config).hasHydrusKey,true);
  const preflight=await fetch(base+'/config',{method:'OPTIONS',headers:{Origin:'http://allowed.test','Access-Control-Request-Headers':'authorization,ngsw-bypass'}});assert.match(preflight.headers.get('access-control-allow-headers'),/ngsw-bypass/i);
});
test('media tickets permit only their asset and preserve byte-range streaming',async t=>{
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-ticket-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const token='test-only-token-with-24-characters';let range;
  const {server,store}=await createIntegrationServer({directory,token,fetcher:async(url,options)=>{range=options.headers.Range;return new Response('bcd',{status:206,headers:{'content-type':'video/webm','content-range':'bytes 1-3/5'}});}});
  await store.configure({hydrusApiKey:'fixture'});store.registerAsset({id:'video',source:'hydrus',hash:'a'.repeat(64)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
  const {ticket}=await(await fetch(base+'/ticket',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:'video'})})).json();
  const media=await fetch(base+'/media/video?ticket='+ticket,{headers:{Range:'bytes=1-3'}});assert.equal(media.status,206);assert.equal(await media.text(),'bcd');assert.equal(range,'bytes=1-3');assert.equal(media.headers.get('content-range'),'bytes 1-3/5');
  assert.equal((await fetch(base+'/media/another?ticket='+ticket)).status,401);assert.equal((await fetch(base+'/config?ticket='+ticket)).status,401);
});
test('metadata sync updates an existing Hydrus file without importing it again',async t=>{
  const calls=[],hash='a'.repeat(64),metadata={prompt:{1:{class_type:'CLIPTextEncode',inputs:{text:'red'}}}};
  const {store}=await fixture(t,async(url,options)=>{const endpoint=new URL(url).pathname;calls.push({endpoint,body:options.body});if(endpoint==='/Gallery/source/hashes')return json({hashes:{'/static_gallery/a.png':hash}});if(endpoint==='/get_files/file_metadata')return json({metadata:[{hash,is_local:true}]});return json({});});
  store.registerAsset({id:'local',source:'comfy',url:'/static_gallery/a.png',metadata});store.registerAsset({id:'remote',source:'hydrus',hash});
  const result=await store.syncMetadata('remote',true);assert.deepEqual(result.tags,['comfyui outputs','positive_prompt:red']);assert(!calls.some(call=>call.endpoint==='/add_files/add_file'));assert(calls.some(call=>call.endpoint==='/add_notes/set_notes'));
});

test('inherited prompt tags drop weights and emphasis without guessing unresolved alternatives',()=>{
  const metadata={prompt:{1:{class_type:'CLIPTextEncode',inputs:{text:'(blue sky:1.3), [smile], (red, green:1.2), {unknown|choice}'}}}};
  assert.deepEqual(inheritedTags(metadata),['comfyui outputs','positive_prompt:blue sky','positive_prompt:smile','positive_prompt:red','positive_prompt:green']);
});
