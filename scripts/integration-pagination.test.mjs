import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {IntegrationStore} from './integration-core.mjs';

const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const hash=id=>id.toString(16).padStart(64,'0');
async function fixture(t,fetcher) {
  const directory=await fs.mkdtemp(path.join(tmpdir(),'hydrus-pages-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const store=new IntegrationStore(path.join(directory,'state'),{fetcher});await store.load();
  await store.configure({hydrusApiKey:'fixture-only-key',hydrusUrl:'http://hydrus.test',comfyUrl:'http://comfy.test'});
  return {store,directory};
}
function catalogue(count) {
  return Array.from({length:count},(_,id)=>({name:`image-${String(id).padStart(4,'0')}.png`,url:`/static_gallery/${id}.png`,timestamp:10000-id,type:'image',metadata:{}}));
}
function upstream(local,remote,calls) {
  return async(url)=>{
    const parsed=new URL(url);calls.push(parsed);
    if(parsed.pathname==='/Gallery/settings')return json({relativePath:'./'});
    if(parsed.pathname==='/Gallery/prefixes')return json({library:{prefixes:[],associations:{}}});
    if(parsed.pathname==='/Gallery/images')return json({folders:{output:local}});
    if(parsed.pathname==='/get_files/search_files')return json({file_ids:remote.map(row=>row.file_id)});
    if(parsed.pathname==='/get_files/file_metadata') {
      const ids=JSON.parse(parsed.searchParams.get('file_ids'));
      assert(ids.length<=200,'Hydrus metadata batches must stay bounded');
      return json({metadata:remote.filter(row=>ids.includes(row.file_id)).reverse()});
    }
    throw new Error('Unexpected request: '+parsed.pathname);
  };
}

test('ComfyUI pagination exhausts over 200 files without rescanning or duplicate pages',async t=>{
  const calls=[],files=catalogue(257);const {store}=await fixture(t,upstream(files,[],calls));
  let page=await store.search({source:'comfy',limit:48});const ids=page.entries.map(row=>row.id);
  assert.equal(page.entries.length,48);assert.equal(store.assets.size,48);
  const cursor=page.nextCursor;
  const [next,retry]=await Promise.all([store.search({cursor}),store.search({cursor})]);
  assert.deepEqual(next,retry);assert.equal(next.entries.length,48);ids.push(...next.entries.map(row=>row.id));page=next;
  while(page.nextCursor){page=await store.search({cursor:page.nextCursor});ids.push(...page.entries.map(row=>row.id));}
  assert.equal(ids.length,257);assert.equal(new Set(ids).size,257);assert.equal(page.hasMore,false);
  assert.equal(calls.filter(url=>url.pathname==='/Gallery/images').length,1);
  assert(!calls.some(url=>url.hostname==='hydrus.test'));
});

test('Hydrus browsing snapshots IDs but defers metadata and continues past 200 results',async t=>{
  const calls=[],remote=Array.from({length:451},(_,id)=>({file_id:id,hash:hash(id),mime:'image/png',time_imported:1000-id,is_local:true}));
  const {store}=await fixture(t,upstream([],remote,calls));
  let page=await store.search({source:'hydrus',limit:48});const ids=page.entries.map(row=>row.id);
  const batches=()=>calls.filter(url=>url.pathname==='/get_files/file_metadata').map(url=>JSON.parse(url.searchParams.get('file_ids')));
  assert.equal(batches().flat().length,48);
  const search=calls.find(url=>url.pathname==='/get_files/search_files');
  assert.deepEqual(JSON.parse(search.searchParams.get('tags')),[]);
  assert.equal(search.searchParams.get('file_sort_asc'),'false');
  while(page.nextCursor){page=await store.search({cursor:page.nextCursor});ids.push(...page.entries.map(row=>row.id));}
  assert.equal(ids.length,451);assert.equal(new Set(ids).size,451);assert.equal(batches().flat().length,451);
  assert.deepEqual(ids,remote.map(row=>'hydrus:'+row.hash),'API response order must not reorder the search');
  assert.equal(calls.filter(url=>url.pathname==='/get_files/search_files').length,1);
  assert(!calls.some(url=>url.hostname==='comfy.test'));
});

test('mixed pages merge both sources in date order without losing the remainder',async t=>{
  const calls=[],local=catalogue(153),remote=Array.from({length:267},(_,id)=>({file_id:id,hash:hash(id),mime:'image/png',time_imported:9999.5-id,is_local:true}));
  const {store}=await fixture(t,upstream(local,remote,calls));
  let page=await store.search({source:'both',limit:48});const entries=[...page.entries];
  assert(page.entries.some(row=>row.source==='hydrus'));assert(page.entries.some(row=>row.source==='comfy'));
  assert.equal(calls.filter(url=>url.pathname==='/get_files/file_metadata').length,1);
  while(page.nextCursor){page=await store.search({cursor:page.nextCursor});entries.push(...page.entries);}
  assert.equal(entries.length,420);assert.equal(new Set(entries.map(row=>row.id)).size,420);
  assert(entries.every((row,at)=>!at||entries[at-1].timestamp>=row.timestamp));
});

test('a failed later metadata batch retries the same page without dropping files',async t=>{
  const calls=[],remote=Array.from({length:120},(_,id)=>({file_id:id,hash:hash(id),mime:'image/png',time_imported:1000-id}));
  const base=upstream([],remote,calls);let fail=false;
  const {store}=await fixture(t,async(url,options)=>{
    if(fail&&new URL(url).pathname==='/get_files/file_metadata'){fail=false;throw new Error('Temporary Hydrus outage');}
    return base(url,options);
  });
  const first=await store.search({source:'hydrus',limit:48});fail=true;
  await assert.rejects(store.search({cursor:first.nextCursor}),/Temporary Hydrus outage/);
  const second=await store.search({cursor:first.nextCursor});
  assert.equal(second.entries.length,48);assert.equal(second.entries[0].hash,hash(48));
  assert.deepEqual(await store.search({cursor:first.nextCursor}),second);
});

test('local folders paginate, deduplicate overlapping rules and hide filesystem paths',async t=>{
  const {store,directory}=await fixture(t,async()=>{throw new Error('Local browsing must not call upstream services');});
  const folder=path.join(directory,'media');await fs.mkdir(folder);
  await Promise.all(Array.from({length:225},(_,id)=>fs.writeFile(path.join(folder,`file-${String(id).padStart(3,'0')}.png`),Buffer.from('not a PNG'))));
  await store.addFolder({path:folder,enabled:false});await store.addFolder({path:folder,enabled:false});
  let page=await store.localMedia({limit:48,order:'name'});const entries=[...page.entries];
  assert.equal(page.entries.length,48);assert.equal(store.assets.size,48);
  assert(!JSON.stringify(page).includes(folder));
  // Files added after this snapshot appear only after a refresh.
  await fs.writeFile(path.join(folder,'new.png'),'new');
  while(page.nextCursor){page=await store.localMedia({cursor:page.nextCursor});entries.push(...page.entries);}
  assert.equal(entries.length,225);assert.equal(new Set(entries.map(row=>row.id)).size,225);
  assert.equal((await store.localMedia({limit:200})).entries.length,200);
});

test('name and random order remain stable between pages; sessions expire explicitly',async t=>{
  const calls=[],files=catalogue(250);const {store}=await fixture(t,upstream(files,[],calls));
  const first=await store.search({source:'comfy',order:'name',limit:200});
  const last=await store.search({cursor:first.nextCursor});
  const names=[...first.entries,...last.entries].map(row=>row.name);
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)));
  let page=await store.search({source:'comfy',order:'random',limit:80}),ids=page.entries.map(row=>row.id);
  while(page.nextCursor){page=await store.search({cursor:page.nextCursor});ids.push(...page.entries.map(row=>row.id));}
  assert.equal(new Set(ids).size,250);
  await assert.rejects(store.search({cursor:'not-a-search:1'}),/expired/);
  const cursor=first.nextCursor;store.searches.get(cursor.split(':')[0]).expires=0;
  await assert.rejects(store.search({cursor}),/expired/);
});
