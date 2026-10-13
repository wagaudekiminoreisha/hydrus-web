import {promises as fs, createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {inflateSync} from 'node:zlib';

const mimeTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska','.mp3':'audio/mpeg','.flac':'audio/flac','.wav':'audio/wav'};
const extensions = new Set(['.png','.jpg','.jpeg','.webp','.gif','.avif','.mp4','.webm','.mov','.mkv','.mp3','.flac','.wav']);
export const cleanTags = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
export function validateURL(value) {
  const url = new URL(value);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) server address without credentials or query parameters.');
  return url.href.replace(/\/$/, '');
}
export function pngMetadata(bytes) {
  const metadata = {};
  if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') return metadata;
  for (let at=8; at+12<=bytes.length;) {
    const size=bytes.readUInt32BE(at), type=bytes.toString('ascii',at+4,at+8);
    if (size > 16*1024*1024 || at+12+size>bytes.length) break;
    const data=bytes.subarray(at+8,at+8+size), split=data.indexOf(0);
    if (split>0 && ['tEXt','zTXt','iTXt'].includes(type)) {
      const name=data.toString('utf8',0,split); let text;
      try {
        if (type==='tEXt') text=data.subarray(split+1).toString('utf8');
        if (type==='zTXt') text=inflateSync(data.subarray(split+2),{maxOutputLength:16*1024*1024}).toString('utf8');
        if (type==='iTXt') {let start=split+3;start=data.indexOf(0,start)+1;start=data.indexOf(0,start)+1;text=(data[split+1] ? inflateSync(data.subarray(start),{maxOutputLength:16*1024*1024}) : data.subarray(start)).toString('utf8');}
        if (text) {try {metadata[name]=JSON.parse(text);} catch {metadata[name]=text;}}
      } catch { /* A malformed ancillary chunk must not prevent importing the media. */ }
    }
    at+=12+size;
  }
  return metadata;
}
const object = value => {try {return typeof value === 'string' ? JSON.parse(value) : value || {};} catch {return {};}};
export function promptsAndLinks(metadata) {
  metadata=object(metadata);
  const prompt=object(metadata.prompt || metadata.gallery?.prompt);
  const collect=(reference,seen=new Set()) => {
    if (typeof reference==='string') return [reference.replace(/⟦source(?: -\[[^⟧]*\])?⟧/g,'')];
    if (!Array.isArray(reference) || seen.has(String(reference[0]))) return [];
    const id=String(reference[0]);seen.add(id);const node=prompt[id],inputs=node?.inputs || {};
    const recorded=object(object(metadata.gallery_prompts)[id]);if(typeof recorded.resolved==='string')return [recorded.resolved];
    if(node?.class_type==='GalleryImageSource'&&[4,5].includes(Number(reference[1]))){const source=object(inputs.sources),images=Array.isArray(source.images)?source.images:[],used=source.layout==='single'?images.slice(source.active_index||0,(source.active_index||0)+1):images;const side=Number(reference[1])===4?'positive':'negative';return used.map(image=>image.prompt?.[side]).filter(value=>typeof value==='string');}
    return Object.entries(inputs).flatMap(([name,value]) => ['text','text_g','text_l','prefix','source_text','conditioning','conditioning_1','conditioning_2'].includes(name) ? collect(value,new Set(seen)) : []);
  };
  const positive=[],negative=[],hashes=new Set(),prefixIds=new Set();
  for (const node of Object.values(prompt)) {
    const inputs=node?.inputs || {};
    if ('positive' in inputs) positive.push(...collect(inputs.positive));
    if ('negative' in inputs) negative.push(...collect(inputs.negative));
    if (node?.class_type==='GalleryImageSource') {
      const source=object(inputs.sources),images=Array.isArray(source.images)?source.images:[];
      const used=source.layout==='single'?images.slice(source.active_index||0,(source.active_index||0)+1):images;
      for (const image of used) {const hash=image.metadata?.hydrus?.hash || /[a-f0-9]{64}/i.exec(image.input_name||'')?.[0];if(hash)hashes.add(hash.toLowerCase());if(image.metadata?.gallery_prefix?.id)prefixIds.add(image.metadata.gallery_prefix.id);}
    }
  }
  if (!positive.length) positive.push(...Object.values(prompt).filter(node=>node?.class_type?.includes('TextEncode') || node?.class_type==='GalleryPromptEncode').flatMap(node=>typeof node.inputs?.text==='string'?[node.inputs.text]:[]));
  return {positive:cleanTags(positive),negative:cleanTags(negative),parents:[...hashes],prefixIds:[...prefixIds]};
}
export function plainPromptTags(text,depth=0) {
  if(depth>32)return [];
  let start=0,round=0,square=0,braces=0;const parts=[];
  for(let at=0;at<text.length;at++){const char=text[at];if(char==='\\'){at++;continue;}if(char==='(')round++;else if(char===')')round=Math.max(0,round-1);else if(char==='[')square++;else if(char===']')square=Math.max(0,square-1);else if(char==='{')braces++;else if(char==='}')braces=Math.max(0,braces-1);else if((char===','||char==='\n')&&!round&&!square&&!braces){parts.push(text.slice(start,at));start=at+1;}}
  parts.push(text.slice(start));
  return parts.flatMap(part=>{let tag=part.trim();if(!tag)return [];const weighted=/^\((.*):[-+]?\d+(?:\.\d+)?\)$/s.exec(tag);if(weighted)return plainPromptTags(weighted[1],depth+1);if((tag.startsWith('(')&&tag.endsWith(')'))||(tag.startsWith('[')&&tag.endsWith(']')))return plainPromptTags(tag.slice(1,-1),depth+1);if(tag.includes('{')||tag.includes('}'))return [];return [tag.replace(/\\([()])/g,'$1')];});
}
export function inheritedTags(metadata, prefix='') {
  const prompts=promptsAndLinks(metadata), tags=['comfyui outputs'];
  for (const [side,values] of [['positive_prompt',prompts.positive],['negative_prompt',prompts.negative]]) for (const text of values) for (const tag of plainPromptTags(text)) tags.push(prefix+side+':'+tag);
  return cleanTags(tags);
}
export function prefixMembers(files,library,prefixId) {
  const urls=new Set(),hashes=new Set();
  for (const [key,association] of Object.entries(library.associations||{})) if(association.prefix_id===prefixId) {
    if(key.startsWith('sha256:'))hashes.add(key.slice(7).toLowerCase());
    if(association.image?.hash)hashes.add(association.image.hash.toLowerCase());
    if(association.image?.local_url)urls.add(association.image.local_url);
    const match=key.match(/:(\/static_gallery\/.*)$/);if(match)urls.add(match[1]);
  }
  const depths=new Map();
  for (let pass=0;pass<20;pass++) {let changed=false;for(const file of files) {
    if(depths.has(file.url))continue;
    const links=promptsAndLinks(file.metadata),paired=urls.has(file.url)||(file.hash&&hashes.has(file.hash));
    if(paired||links.prefixIds.includes(prefixId)||links.parents.some(hash=>hashes.has(hash))) {depths.set(file.url,paired?0:pass+1);urls.add(file.url);if(file.hash)hashes.add(file.hash);changed=true;}
  }if(!changed)break;}
  return {urls,hashes,depths};
}
export class IntegrationStore {
  constructor(directory,{fetcher=fetch}={}) {this.directory=directory;this.fetcher=fetcher;this.config={comfyUrl:'',hydrusUrl:'http://127.0.0.1:45869',hydrusApiKey:'',tagServiceKey:'',folders:[]};this.ledger={};this.stability=new Map();this.assets=new Map();this.scanning=false;this.saveQueue=Promise.resolve();}
  async load() {await fs.mkdir(this.directory,{recursive:true});for(const [file,key] of [['config.json','config'],['imports.json','ledger']]) {try {this[key]={...this[key],...JSON.parse(await fs.readFile(path.join(this.directory,file),'utf8'))};} catch(error) {if(error.code!=='ENOENT')throw error;}}}
  async save(file,value) {const text=JSON.stringify(value,null,2);const task=this.saveQueue.catch(()=>{}).then(async()=>{const target=path.join(this.directory,file);await fs.writeFile(target+'.tmp',text,{mode:0o600});await fs.rename(target+'.tmp',target);});this.saveQueue=task;await task;}
  publicConfig() {const {hydrusApiKey,...config}=this.config;return {...config,hasHydrusKey:!!hydrusApiKey};}
  async configure(input) {
    if(this.scanning)throw new Error('Wait for the current import-folder scan before changing server connections.');
    const next={...this.config};
    for(const key of ['comfyUrl','hydrusUrl']) if(key in input)next[key]=input[key]?validateURL(input[key]):'';
    for(const key of ['hydrusApiKey','tagServiceKey']) if(typeof input[key]==='string' && (key!=='hydrusApiKey'||input[key]))next[key]=input[key].trim();
    await this.save('config.json',next);this.config=next;return this.publicConfig();
  }
  async hydrus(endpoint,body,params={},options={}) {
    if(!this.config.hydrusApiKey)throw new Error('Configure a Hydrus API access key on the bridge.');
    const url=new URL(this.config.hydrusUrl+endpoint);for(const [key,value] of Object.entries(params))url.searchParams.set(key,typeof value==='string'?value:JSON.stringify(value));
    const response=await this.fetcher(url,{method:body===undefined?'GET':'POST',headers:{'Hydrus-Client-API-Access-Key':this.config.hydrusApiKey,...options.headers,...(body instanceof Uint8Array?{'Content-Type':'application/octet-stream'}:body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:body instanceof Uint8Array?body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw new Error(`Hydrus ${endpoint}: HTTP ${response.status}`);return response;
  }
  async comfy(endpoint,body,options={}) {if(!this.config.comfyUrl)throw new Error('Configure the ComfyUI address.');const response=await this.fetcher(this.config.comfyUrl+endpoint,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...options.headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`ComfyUI ${endpoint}: HTTP ${response.status}`);return response;}
  async addFolder(input) {
    if(typeof input.path!=='string'||!path.isAbsolute(input.path))throw new Error('Choose an absolute folder path on the bridge computer.');
    const folder=await fs.realpath(input.path);if(!(await fs.stat(folder)).isDirectory())throw new Error('The import path is not a directory.');
    const rule={id:randomUUID(),path:folder,enabled:input.enabled!==false,recursive:input.recursive===true,tags:cleanTags(input.tags),tagPrefix:String(input.tagPrefix||'').slice(0,100),prefixId:String(input.prefixId||''),inheritPrompts:input.inheritPrompts===true,archive:input.archive===true,intervalSeconds:Math.max(10,Math.min(86400,Number(input.intervalSeconds)||60)),lastScan:0,lastError:'',imported:0};
    this.config.folders.push(rule);await this.save('config.json',this.config);return rule;
  }
  async removeFolder(id) {this.config.folders=this.config.folders.filter(rule=>rule.id!==id);await this.save('config.json',this.config);}
  async setFolderEnabled(id,enabled) {const rule=this.config.folders.find(rule=>rule.id===id);if(!rule)throw new Error('Import folder no longer exists.');rule.enabled=!!enabled;await this.save('config.json',this.config);}
  async filesIn(folder,recursive,root=folder) {
    if(await fs.realpath(root)!==root)throw new Error('Configured directory path changed; choose the folder again.');
    const result=[];
    for(const entry of await fs.readdir(folder,{withFileTypes:true})) {const file=path.join(folder,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory()&&recursive)result.push(...await this.filesIn(file,true,root));else if(entry.isFile()&&extensions.has(path.extname(file).toLowerCase()))result.push(file);}
    return result;
  }
  async importBytes(bytes,metadata={},tags=[],prefixId='',archive=false) {
    if(cleanTags(tags).length&&!this.config.tagServiceKey)throw new Error('Choose a Hydrus tag service before importing with tags.');
    const result=await(await this.hydrus('/add_files/add_file',bytes)).json();
    if(![1,2].includes(result.status)||!result.hash)throw new Error(result.note||'Hydrus rejected the import.');
    tags=cleanTags(tags);if(tags.length) {if(!this.config.tagServiceKey)throw new Error('Choose a Hydrus tag service before importing with tags.');await this.hydrus('/add_tags/add_tags',{hash:result.hash,service_keys_to_tags:{[this.config.tagServiceKey]:tags}});}
    if(Object.keys(metadata).length)await this.hydrus('/add_notes/set_notes',{hash:result.hash,notes:{'ComfyUI Gallery generation metadata':JSON.stringify(metadata)}});
    if(archive)await this.hydrus('/add_files/archive_files',{hashes:[result.hash]});
    if(prefixId) {const library=await(await this.comfy('/Gallery/prefixes')).json();await this.comfy('/Gallery/prefixes',{action:'associate',prefix_id:prefixId,image_keys:['sha256:'+result.hash],image_refs:{['sha256:'+result.hash]:{hash:result.hash}},revision:library.revision});}
    return result;
  }
  async scan(force=false) {
    if(this.scanning)return;this.scanning=true;
    try {for(const rule of this.config.folders) {
      if(!rule.enabled||(!force&&Date.now()-rule.lastScan<rule.intervalSeconds*1000))continue;
      rule.lastScan=Date.now();rule.lastError='';
      try {for(const file of await this.filesIn(rule.path,rule.recursive)) {
        const stat=await fs.stat(file),signature=`${stat.size}:${stat.mtimeMs}`,scope=createHash('sha256').update(this.config.hydrusUrl+'|'+this.config.hydrusApiKey).digest('hex'),id=rule.id+':'+scope+':'+file;
        if(this.ledger[id]===signature)continue;
        if(this.stability.get(id)!==signature){this.stability.set(id,signature);continue;}
        if(stat.size>512*1024*1024)throw new Error('A media file exceeds the 512 MB import limit.');
        const bytes=await fs.readFile(file),after=await fs.stat(file);if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)continue;
        const metadata=pngMetadata(bytes),tags=[...rule.tags,...(rule.inheritPrompts?inheritedTags(metadata,rule.tagPrefix):[])];
        await this.importBytes(bytes,metadata,tags,rule.prefixId,rule.archive);this.ledger[id]=signature;rule.imported++;
        await this.save('imports.json',this.ledger);
      }}catch(error){rule.lastError=error.message;}
    }await this.save('config.json',this.config);}finally{this.scanning=false;}
  }
  registerAsset(entry,internal) {const id=entry.id||randomUUID();this.assets.set(id,{...entry,...internal});return {...entry,id,prompts:promptsAndLinks(entry.metadata)};}
  async search({source='both',tags=[],prefixId='',limit=100}={}) {
    limit=Math.max(1,Math.min(200,Number(limit)||100));const entries=[],warnings=[];let comfyOnline=false;let library={prefixes:[],associations:{}},local=[];
    if(this.config.comfyUrl) {try {const settings=await(await this.comfy('/Gallery/settings')).json();this.comfyRoot=settings.relativePath||'./';const [data,prefixes]=await Promise.all([this.comfy('/Gallery/images?relative_path='+encodeURIComponent(this.comfyRoot)).then(r=>r.json()),this.comfy('/Gallery/prefixes').then(r=>r.json())]);comfyOnline=true;library=prefixes.library||prefixes;local=Object.values(data.folders||{}).flatMap(folder=>Object.values(folder)).filter(file=>['image','media'].includes(file.type));if(prefixId&&local.length){const hashes={};for(let at=0;at<local.length;at+=2000)Object.assign(hashes,(await(await this.comfy('/Gallery/source/hashes',{urls:local.slice(at,at+2000).map(file=>file.url)})).json()).hashes);local=local.map(file=>({...file,hash:hashes[file.url]}));}}
      catch(error){warnings.push(error.message);}
    }
    const membership=prefixId?prefixMembers(local,library,prefixId):undefined;
    if(source!=='hydrus')for(const file of local) {if(membership&&!membership.urls.has(file.url))continue;if(tags.length&&!tags.every(tag=>JSON.stringify(file.metadata||{}).toLowerCase().includes(tag.toLowerCase())))continue;entries.push({id:'comfy:'+file.url,source:'comfy',name:file.name,url:file.url,hash:file.hash,mime:file.mime||'',timestamp:file.timestamp||0,metadata:file.metadata||{},depth:membership?.depths.get(file.url)});}
    if(source!=='comfy')try {
      let records=[];
      if(membership) {const hashes=[...membership.hashes];for(let at=0;at<hashes.length;at+=200)records.push(...(await(await this.hydrus('/get_files/file_metadata',undefined,{hashes:hashes.slice(at,at+200),include_notes:true})).json()).metadata);}
      else {const found=await(await this.hydrus('/get_files/search_files',undefined,{tags:[...cleanTags(tags),'system:limit='+limit],return_file_ids:true})).json();if(found.file_ids?.length)records=(await(await this.hydrus('/get_files/file_metadata',undefined,{file_ids:found.file_ids.slice(0,limit),include_notes:true})).json()).metadata;}
      for(const file of records.filter(file=>file.hash && !file.is_deleted && !file.is_in_trash && !file.is_trashed)) {const metadata=object(file.notes?.['ComfyUI Gallery generation metadata']);entries.push({id:'hydrus:'+file.hash,source:'hydrus',name:file.hash.slice(0,12),hash:file.hash,mime:file.mime,width:file.width,height:file.height,timestamp:file.time_imported||file.import_time||Math.max(0,...Object.values(file.file_services?.current||{}).map(service=>Number(service.time_imported)||0))||file.time_modified||0,metadata,tags:Object.values(file.tags||{}).flatMap(service=>service.display_tags?.['0']||service.storage_tags?.['0']||[]),remote:file});}
    }catch(error){warnings.push(error.message);}
    const ordered=entries.sort((a,b)=>(b.timestamp||0)-(a.timestamp||0));
    let selected=ordered.slice(0,limit);
    if(source==='both'){const localEntries=ordered.filter(item=>item.source==='comfy'),remoteEntries=ordered.filter(item=>item.source==='hydrus');const remoteCount=Math.min(remoteEntries.length,Math.floor(limit/2));const localCount=Math.min(localEntries.length,limit-remoteCount);selected=[...localEntries.slice(0,localCount),...remoteEntries.slice(0,limit-localCount)];}
    return {entries:selected.map(entry=>this.registerAsset(entry,{})),prefixes:library.prefixes,warnings,comfyOnline};
  }
  async media(id,thumbnail=false,range) {
    const asset=this.assets.get(id);if(!asset)throw new Error('Search again to load this media.');
    if(asset.source==='hydrus')return this.hydrus(thumbnail?'/get_files/thumbnail':'/get_files/file',undefined,{hash:asset.hash},{headers:range?{Range:range}:{}});
    if(asset.source==='comfy')return this.comfy(thumbnail?'/Gallery/thumbnail?url='+encodeURIComponent(asset.url)+'&root='+encodeURIComponent(this.comfyRoot||'./'):asset.url,undefined,{headers:range?{Range:range}:{}});
    if(asset.source==='folder') {
      const current=await fs.realpath(asset.path);if(current!==asset.path)throw new Error('Local media path changed.');
      const stat=await fs.stat(current),headers={'content-type':mimeTypes[path.extname(current).toLowerCase()]||'application/octet-stream','accept-ranges':'bytes'};
      const match=range&&/^bytes=(\d*)-(\d*)$/.exec(range);let start=0,end=stat.size-1,status=200;
      if(match){start=match[1]?Number(match[1]):Math.max(0,stat.size-Number(match[2]));end=match[1]&&match[2]?Math.min(end,Number(match[2])):end;if(start>end||start>=stat.size)return new Response(null,{status:416,headers:{'content-range':'bytes */'+stat.size}});status=206;headers['content-range']=`bytes ${start}-${end}/${stat.size}`;}
      headers['content-length']=String(end-start+1);
      return new Response(Readable.toWeb(createReadStream(current,{start,end})),{status,headers});
    }
    throw new Error('Unknown media source.');
  }
  async localMedia() {const entries=[];for(const rule of this.config.folders)for(const file of (await this.filesIn(rule.path,rule.recursive)).slice(0,200)) {const stat=await fs.stat(file);const id='folder:'+createHash('sha256').update(file).digest('hex');entries.push(this.registerAsset({id,source:'folder',name:path.basename(file),timestamp:stat.mtimeMs/1000,mime:mimeTypes[path.extname(file).toLowerCase()]||'',metadata:path.extname(file).toLowerCase()==='.png'&&stat.size<16*1024*1024?pngMetadata(await fs.readFile(file)):{}},{path:file}));}return {entries};}
  async exportMedia(id,inherit=false,tags=[]) {const asset=this.assets.get(id);if(!asset||asset.source==='hydrus')throw new Error('Choose a ComfyUI or local-folder file.');const response=await this.media(id);const bytes=Buffer.from(await response.arrayBuffer());const metadata=asset.source==='folder'?pngMetadata(bytes):asset.metadata;return this.importBytes(bytes,metadata,[...cleanTags(tags),...(inherit?inheritedTags(metadata):[])]);}
  async syncMetadata(id,inherit=false,tags=[]) {
    const asset=this.assets.get(id);if(!asset)throw new Error('Search again to load this media.');
    let hash=asset.hash,metadata=asset.metadata||{};
    if(asset.source==='comfy'&&!hash)hash=(await(await this.comfy('/Gallery/source/hashes',{urls:[asset.url]})).json()).hashes[asset.url];
    if(asset.source==='folder'){const bytes=Buffer.from(await(await this.media(id)).arrayBuffer());hash=createHash('sha256').update(bytes).digest('hex');metadata=pngMetadata(bytes);}
    if(asset.source==='hydrus') {
      const locals=[...this.assets.values()].filter(item=>item.source==='comfy');
      if(locals.length) {const found=(await(await this.comfy('/Gallery/source/hashes',{urls:locals.map(item=>item.url)})).json()).hashes;const original=locals.find(item=>found[item.url]===hash);if(original)metadata=original.metadata||{};}
    }
    if(!hash)throw new Error('Could not identify the media hash.');
    const records=(await(await this.hydrus('/get_files/file_metadata',undefined,{hashes:[hash]})).json()).metadata;
    if(!records?.some(item=>item.hash===hash&&item.is_local!==false&&!item.is_trashed))throw new Error('Export this file to Hydrus before syncing.');
    if(Object.keys(metadata).length)await this.hydrus('/add_notes/set_notes',{hash,notes:{'ComfyUI Gallery generation metadata':JSON.stringify(metadata)}});
    const values=cleanTags([...tags,...(inherit?inheritedTags(metadata):[])]);
    if(values.length){if(!this.config.tagServiceKey)throw new Error('Choose a tag service.');await this.hydrus('/add_tags/add_tags',{hash,service_keys_to_tags:{[this.config.tagServiceKey]:values}});}
    return {hash,metadata,tags:values,prompts:promptsAndLinks(metadata)};
  }
  async importToComfy(id) {const asset=this.assets.get(id);if(asset?.source!=='hydrus')throw new Error('Choose a Hydrus file.');const response=await this.media(id),form=new FormData();const type=response.headers.get('content-type')||asset.mime;form.append('image',new Blob([await response.arrayBuffer()],{type}),asset.hash+'.'+(type?.split('/')[1]||'png'));form.append('type','input');form.append('subfolder','hydrus');const result=await this.fetcher(this.config.comfyUrl+'/upload/image',{method:'POST',body:form,signal:AbortSignal.timeout(60000)});if(!result.ok)throw new Error('ComfyUI upload failed: HTTP '+result.status);const saved=await result.json();return (await this.comfy(type.startsWith('image/')?'/Gallery/source/input':'/Gallery/source/provenance',{name:(saved.subfolder?saved.subfolder+'/':'')+saved.name,metadata:{...asset.metadata,gallery_origin:'hydrus',hydrus:asset.remote}})).json();}
  async manageTags({hashes=[],tags=[],operation='add',newTag='',tag=''}) {
    if(!['relationships','services','add','remove','replace'].includes(operation))throw new Error('Unknown tag operation.');
    if(operation==='relationships')return (await this.hydrus('/add_tags/get_siblings_and_parents',undefined,{tags:[tag]})).json();
    if(operation==='services')return (await this.hydrus('/get_services')).json();
    if(!hashes.length||hashes.length>200||hashes.some(hash=>!/^[a-f0-9]{64}$/i.test(hash)))throw new Error('Choose 1–200 Hydrus files.');
    if(!this.config.tagServiceKey)throw new Error('Choose a Hydrus tag service.');
    tags=cleanTags(tags);if(!tags.length)throw new Error('Enter at least one tag.');
    const actions=operation==='replace'?{'0':cleanTags([newTag]),'1':tags}: {[operation==='remove'?'1':'0']:tags};
    if(operation==='replace'&&!newTag.trim())throw new Error('Enter the replacement tag.');
    return (await this.hydrus('/add_tags/add_tags',{hashes,service_keys_to_actions_to_tags:{[this.config.tagServiceKey]:actions}})).text();
  }
}
