const {test}=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');const fs=require('node:fs');const Module=require('node:module');
const filename=require('node:path').resolve(__dirname,'../src/app/integration/media-relations.ts');
const compiled=new Module(filename,module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {links,relatedSets,actualTags,mergeCopies,relationIndex}=compiled.exports;
const hash=letter=>letter.repeat(64);
const row=(letter,parents=[],metadata={})=>({id:letter+'.png',source:'comfy',hash:hash(letter),name:letter,metadata:{prompt:{'1':{class_type:'GalleryImageSource',inputs:{sources:JSON.stringify({layout:'batch',images:parents.map(parent=>({input_name:hash(parent)+'.png'}))})}}},...metadata}});
const library={prefixes:[{id:'p',name:'Portrait'}],associations:{['sha256:'+hash('a')]:{prefix_id:'p'},['sha256:'+hash('e')]:{prefix_id:'p'}},snapshots:{s:{id:'s',prefix_id:'p',members:{['sha256:'+hash('c')]:{hash:hash('c')},['sha256:'+hash('e')]:{hash:hash('e')}}}}};
test('other prefix associations subtract ancestors, descendants and siblings',()=>{
  const rows=[row('a'),row('b',['a']),row('c',['b']),row('d',['a']),row('e')];
  const result=relatedSets(rows,rows[2],library);
  assert.deepEqual([...result.lineage].sort(),['a.png','b.png','c.png','d.png']);
  assert.deepEqual([...result.prefixes],['e.png']);
  assert.deepEqual([...result.snapshots].sort(),['c.png','e.png']);
});
test('a dropped generated file resolves its loaded source history by hash',()=>{
  const rows=[row('a'),row('b',['a']),row('c',['b']),row('d',['a']),row('e')];
  const result=relatedSets(rows,{id:'external',source:'external',name:'test.png',hash:hash('c')},library);
  assert.deepEqual([...result.lineage].sort(),['a.png','b.png','c.png','d.png']);
  assert.deepEqual([...result.prefixes],['e.png']);
});
test('portable Hydrus notes retain prefix and snapshot identity',()=>{
  const asset={id:'hydrus:x',source:'hydrus',name:'x',metadata:{notes:{'ComfyUI Gallery generation metadata':JSON.stringify({gallery_associations:[{prefix_id:'p',snapshot_id:'s'}]})}}};
  assert(links(asset).prefixes.has('p'));assert(links(asset).snapshots.has('s'));
});
test('prefix inheritance works before a paired source is loaded',()=>{
  assert(relationIndex([row('b',['a'])],library).get('b.png').prefixes.has('p'));
});
test('actual positive choices override templates and exclude the negative encoder',()=>{
  const asset=row('a',[],{gallery_prompts:{'2':{resolved:'(long_hair:1.2), blue eyes',text:'{long hair|short hair}'},'3':{resolved:'bad anatomy'}},prompt:{'1':{class_type:'KSampler',inputs:{positive:['2',0],negative:['3',0]}},'2':{class_type:'GalleryPromptEncode'},'3':{class_type:'GalleryPromptEncode'}}});
  assert.deepEqual(actualTags(asset),['long hair','blue eyes']);assert(!actualTags(asset).includes('hair'));
});
test('unresolved choices do not become search tags',()=>{
  assert.deepEqual(actualTags(row('a',[],{positive_prompt:'{red hair|blue hair}, smile'})),['smile']);
});
test('hash merge keeps local playback and Hydrus tags without duplicate cards',()=>{
  const local=row('a'),remote={...local,id:'hydrus:'+hash('a'),source:'hydrus',tags:['eye_color:blue'],metadata:{gallery_associations:[{prefix_id:'p'}]}};
  const merged=mergeCopies([local,remote]);assert.equal(merged.length,1);assert.equal(merged[0].source,'comfy');assert.deepEqual(merged[0].locations,['comfy','hydrus']);assert(actualTags(merged[0]).includes('eye color:blue'));assert(links(merged[0]).prefixes.has('p'));
});

test('older image-source text and replacement mode retain only supplied positive text',()=>{
  const metadata={prompt:{'1':{class_type:'GalleryImageSource',inputs:{sources:JSON.stringify({layout:'single',active_index:0,images:[{prompt:{positive:'blue eyes',negative:'blur'}}]})}},'2':{class_type:'GalleryPromptEncode',inputs:{source_mode:'replace',text:'unused hair',source_text:['1',4]}},'3':{class_type:'KSampler',inputs:{positive:['2',0]}}}};
  assert.deepEqual(actualTags({id:'old',source:'comfy',name:'old',metadata}),['blue eyes']);
});

const {comfyCapabilities}=compiled.exports;
test('ordinary Hydrus tags and unrelated notes do not enable ComfyUI actions',()=>{
 assert.equal(comfyCapabilities({id:'h',source:'hydrus',name:'h',tags:['blue hair'],metadata:{notes:{other:'hello'}}}).available,false);
});
test('local media exposes lineage without claiming workflow or prefix metadata',()=>{
 const c=comfyCapabilities({id:'local.png',source:'comfy',name:'local',metadata:{}},true);
 assert(c.available);assert(!c.generation);assert(!c.workflow);assert.equal(c.prefixes.size,0);assert.equal(c.snapshots.size,0);
});
test('portable Hydrus generation data enables only supported actions',()=>{
 const c=comfyCapabilities({id:'h',source:'hydrus',name:'h',metadata:{notes:{'ComfyUI Gallery generation metadata':JSON.stringify({positive_prompt:'blue eyes',workflow:{nodes:[]},gallery_associations:[{prefix_id:'p',snapshot_id:'s'}]})}}});
 assert(c.available);assert(c.generation);assert(c.workflow);assert(c.prefixes.has('p'));assert(c.snapshots.has('s'));assert.deepEqual(c.tags,['blue eyes']);
});
test('malformed association data neither breaks menus nor enables unrelated actions',()=>{
 assert.equal(comfyCapabilities({id:'h',source:'hydrus',name:'h',metadata:{gallery_associations:{invalid:true},workflow:{nodes:'broken'}}}).prefixes.size,0);
 assert.equal(comfyCapabilities({id:'h',source:'hydrus',name:'h',metadata:{notes:{'ComfyUI Gallery generation metadata':'{broken'}}}).available,false);
});

test('Hydrus seed provenance is retained when the local copy has older metadata',()=>{
 const rows=[row('a'),row('b'),row('e')];
 const seed={...row('b',['a']),id:'hydrus:b',source:'hydrus'};
 const result=relatedSets(rows,seed,library);
 assert.deepEqual([...result.lineage].sort(),['a.png','b.png']);
 assert.deepEqual([...result.prefixes],['e.png']);
});
