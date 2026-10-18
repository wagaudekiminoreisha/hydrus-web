/** Shared identity and provenance filtering for local files and Hydrus notes. */
export interface MediaRecord {id:string;source:string;name:string;hash?:string;metadata?:any;tags?:string[];timestamp?:number;[key:string]:any;}
export const objectValue=(value:any):any=>{try{if(typeof value==='string')value=JSON.parse(value);}catch{return {};}return value&&typeof value==='object'?value:{};};
export function metadataOf(value:any):any {
  const raw=objectValue(value), notes=objectValue((raw.hydrus||raw).notes);
  return Object.assign({},...Object.entries(notes).filter(([name])=>name.startsWith('ComfyUI Gallery generation metadata')).map(([,note])=>objectValue(note)),raw);
}
export const normalizeTag=(value:string)=>value.trim().toLowerCase().replace(/_/g,' ').replace(/^\((.*):[-+]?\d+(?:\.\d+)?\)$/,'$1').replace(/^[([](.*)[)\]]$/,'$1').trim();
export function promptTags(text:string):string[] {
  let depth=0,plain='';
  for(const char of text){if(char==='{'){depth++;continue;}if(char==='}'&&depth){depth--;continue;}if(!depth)plain+=char;}
  return plain.split(/[,\n]/).map(normalizeTag).filter(Boolean);
}
export function actualTags(asset:MediaRecord):string[] {
  const meta=metadataOf(asset.metadata),records=objectValue(meta.gallery_prompts),graph=objectValue(meta.prompt),positive:string[]=[];
  const visit=(id:string,seen=new Set<string>(),socket=0):string[]=>{
    if(seen.has(id))return [];seen.add(id);
    const node=graph[id],inputs=node?.inputs||{};
    const collect=(value:any):string[]=>Array.isArray(value)&&value.length===2&&graph[value[0]]?visit(String(value[0]),seen,Number(value[1])):typeof value==='string'?[value]:[];
    if(node?.class_type==='GalleryPromptEncode'&&typeof records[id]?.resolved==='string')return [records[id].resolved];
    if(node?.class_type==='GalleryPromptEncode')return inputs.source_mode==='replace'?collect(inputs.source_text):[...collect(inputs.text),...collect(inputs.source_text)];
    if(node?.class_type==='GalleryImageSource'&&(socket===4||socket===5)){
      const manifest=objectValue(inputs.sources),images=manifest.images||[],used=(manifest.layout||'single')==='single'?images.slice(manifest.active_index||0,(manifest.active_index||0)+1):images;
      return used.flatMap((image:any)=>collect(objectValue(image.prompt)[socket===4?'positive':'negative']));
    }
    return Object.entries(inputs).flatMap(([key,value])=>/^(text(?:_\w+)?|source_text|conditioning(?:_\w+)?|conditioning\d*|clip_l|clip_g|t5xxl)$/.test(key)?collect(value):[]);
  };
  for(const node of Object.values(graph) as any[])for(const [key,value] of Object.entries(node.inputs||{}))if(/^(positive|positive_prompt|positive_conditioning|pos)$/.test(key)) {
    if(Array.isArray(value))positive.push(...visit(String(value[0]),new Set<string>(),Number(value[1])));else if(typeof value==='string')positive.push(value);
  }
  if(!positive.length){
    if(meta.positive_prompt||meta.positive)positive.push(meta.positive_prompt||meta.positive);
    else if(!Object.keys(graph).length)for(const row of Object.values(records) as any[])if(typeof row.resolved==='string')positive.push(row.resolved);
  }
  return [...new Set([...(asset.tags||[]).map(normalizeTag),...positive.flatMap(text=>promptTags(String(text)))])];
}
export function links(asset:MediaRecord,library:any={}) {
  const meta=metadataOf(asset.metadata), parents=new Set<string>(),prefixes=new Set<string>(),snapshots=new Set<string>();
  const addRef=(ref:any)=>{if(ref?.prefix_id)prefixes.add(ref.prefix_id);if(ref?.snapshot_id)snapshots.add(ref.snapshot_id);};
  for(const ref of meta.gallery_associations||[])addRef(ref);
  for(const row of Object.values(objectValue(meta.gallery_prompts)) as any[])for(const ref of row.prefix_snapshots||[])addRef(ref);
  const manifests:any[]=[];
  for(const node of Object.values(objectValue(meta.prompt)) as any[])if(node.class_type==='GalleryImageSource')manifests.push(objectValue(node.inputs?.sources));
  if(!manifests.length)for(const node of objectValue(meta.workflow).nodes||[])if(node.type==='GalleryImageSource')manifests.push(objectValue(node.widgets_values?.[0]));
  for(const manifest of manifests){const images=manifest.images||[],used=manifest.layout==='single'?images.slice(manifest.active_index||0,(manifest.active_index||0)+1):images;
    for(const image of used){const hash=/[a-f0-9]{64}/i.exec(image.input_name||'')?.[0]||image.metadata?.hydrus?.hash;if(hash)parents.add(hash.toLowerCase());if(image.metadata?.gallery_prefix?.id)prefixes.add(image.metadata.gallery_prefix.id);}}
  const keys=new Set([asset.hash?'sha256:'+asset.hash:'',asset.source==='comfy'?'local:./:/static_gallery/'+asset.id:'']);
  const matches=(key:string,ref:any)=>keys.has(key)||!!asset.hash&&ref?.hash===asset.hash||asset.source==='comfy'&&ref?.local_url==='/static_gallery/'+asset.id;
  for(const [key,ref] of Object.entries(library.associations||{}) as [string,any][])if(matches(key,ref.image))addRef(ref);
  for(const snapshot of Object.values(library.snapshots||{}) as any[])if(Object.entries(snapshot.members||{}).some(([key,ref])=>matches(key,ref)))addRef({prefix_id:snapshot.prefix_id,snapshot_id:snapshot.id});
  return {parents,prefixes,snapshots};
}
export function relationIndex(assets:MediaRecord[],library:any) {
  const index=new Map(assets.map(asset=>[asset.id,links(asset,library)]));
  // Prefix identity follows generations without requiring prompt words to match.
  for(let pass=0;pass<assets.length;pass++) {let changed=false;
    const byHash=new Map(assets.filter(row=>row.hash).map(row=>[row.hash,index.get(row.id)!]));
    const seed=(hash:string,prefix:string)=>{if(!hash)return;let relation=byHash.get(hash);if(!relation){relation={parents:new Set<string>(),prefixes:new Set<string>(),snapshots:new Set<string>()};byHash.set(hash,relation);}relation.prefixes.add(prefix);};
    for(const [key,ref] of Object.entries(library.associations||{}) as [string,any][])seed(ref.image?.hash||(key.startsWith('sha256:')?key.slice(7):''),ref.prefix_id);
    for(const snapshot of Object.values(library.snapshots||{}) as any[])for(const [key,ref] of Object.entries(snapshot.members||{}) as [string,any][])seed(ref.hash||(key.startsWith('sha256:')?key.slice(7):''),snapshot.prefix_id);
    for(const relation of index.values())for(const parent of relation.parents)for(const prefix of byHash.get(parent)?.prefixes||[])if(!relation.prefixes.has(prefix)){relation.prefixes.add(prefix);changed=true;}
    if(!changed)break;
  }
  return index;
}
export function relatedSets(assets:MediaRecord[],seed:MediaRecord,library:any) {
  seed=assets.find(row=>seed.hash&&row.hash===seed.hash)||seed;
  const rows=[...assets,seed],index=relationIndex(rows,library),seedLinks=index.get(seed.id)!;
  const ancestors=new Set<string>(seed.hash?[seed.hash]:[]);seedLinks.parents.forEach(hash=>ancestors.add(hash));
  let changed=true;
  while(changed){changed=false;for(const row of rows)if(row.hash&&ancestors.has(row.hash))for(const parent of index.get(row.id)!.parents)if(!ancestors.has(parent)){ancestors.add(parent);changed=true;}}
  const family=new Set(ancestors);
  changed=true;while(changed){changed=false;for(const row of rows)if(row.hash&&!family.has(row.hash)&&[...index.get(row.id)!.parents].some(hash=>family.has(hash))){family.add(row.hash);changed=true;}}
  const lineage=new Set<string>(),snapshots=new Set<string>(),prefixes=new Set<string>();
  for(const row of assets){const rel=index.get(row.id)!;const same=row.id===seed.id||!!row.hash&&family.has(row.hash);if(same)lineage.add(row.id);
    if([...rel.snapshots].some(id=>seedLinks.snapshots.has(id)))snapshots.add(row.id);
    if(!same&&[...rel.prefixes].some(id=>seedLinks.prefixes.has(id)))prefixes.add(row.id);}
  return {lineage,snapshots,prefixes};
}
export function mergeCopies(rows:MediaRecord[]):MediaRecord[] {
  const result=new Map<string,MediaRecord>();
  for(const row of rows){const key=row.hash||row.source+':'+row.id,previous=result.get(key);
    if(!previous){result.set(key,{...row,locations:[row.source]});continue;}
    const local=previous.source==='comfy'?previous:row;
    result.set(key,{...local,metadata:{...metadataOf(previous.metadata),...metadataOf(row.metadata)},tags:[...new Set([...(previous.tags||[]),...(row.tags||[])])],locations:[...new Set([...(previous.locations||[]),row.source])]});}
  return [...result.values()];
}
