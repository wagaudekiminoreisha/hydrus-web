import {createServer} from 'node:http';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {Readable} from 'node:stream';
import {IntegrationStore} from './integration-core.mjs';

export async function createIntegrationServer({token,origins=[],directory,fetcher,pollIntervalMs=10000}={}) {
  if(typeof token!=='string'||token.length<24)throw new Error('Set HYDRUS_WEB_BRIDGE_TOKEN to a private token with at least 24 characters.');
  const store=new IntegrationStore(directory,{fetcher});await store.load();
  const expected=Buffer.from('Bearer '+token);
  const tickets=new Map();
  const server=createServer(async(request,response)=>{
    const origin=request.headers.origin;
    if(origin&&!origins.includes(origin)){response.writeHead(403).end('Origin is not allowed.');return;}
    if(origin)response.setHeader('Access-Control-Allow-Origin',origin);
    response.setHeader('Vary','Origin');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,ngsw-bypass');response.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
    if(request.method==='OPTIONS'){response.writeHead(204).end();return;}
    let url,mediaID;
    try {url=new URL(request.url,'http://localhost');mediaID=url.pathname.startsWith('/media/')?decodeURIComponent(url.pathname.slice(7)):undefined;}catch{response.writeHead(400).end('Invalid URL.');return;}
    const ticket=tickets.get(url.searchParams.get('ticket'));
    const permittedMedia=url.pathname.startsWith('/media/')&&ticket&&ticket.expires>Date.now()&&ticket.id===mediaID&&ticket.thumbnail===(url.searchParams.get('thumbnail')==='1');
    const supplied=Buffer.from(request.headers.authorization||'');
    if(!permittedMedia&&(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))){response.writeHead(401).end('Bridge token required.');return;}
    const json=(value,status=200)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));};
    try {
      let body={};
      if(request.method==='POST'){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>1024*1024)throw new Error('Request body too large.');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString()||'{}');}
      if(url.pathname==='/ticket'&&request.method==='POST'){if(!store.assets.has(body.id))throw new Error('Search again to load this media.');for(const [key,ticket] of tickets)if(ticket.expires<Date.now())tickets.delete(key);const key=randomUUID();tickets.set(key,{id:body.id,thumbnail:body.thumbnail===true,expires:Date.now()+3600000});return json({ticket:key});}
      if(url.pathname==='/health')return json({ok:true,version:1,capabilities:{importFolders:true,comfyGallery:true,editFileTags:true,readTagRelationships:true,editTagRelationships:false}});
      if(url.pathname==='/diagnostics')return json(await store.diagnostics());
      if(url.pathname==='/handshake'&&request.method==='POST')return json(await store.handshake());
      if(url.pathname==='/config')return json(request.method==='POST'?await store.configure(body):store.publicConfig());
      if(url.pathname==='/folders')return json(request.method==='POST'?await store.addFolder(body):store.config.folders);
      if(url.pathname==='/folders/update'&&request.method==='POST'){await store.setFolderEnabled(body.id,body.enabled);return json(store.config.folders);}
      if(url.pathname.startsWith('/folders/')&&request.method==='DELETE'){await store.removeFolder(decodeURIComponent(url.pathname.slice(9)));return json(store.config.folders);}
      if(url.pathname==='/scan'&&request.method==='POST'){await store.scan(true);return json({folders:store.config.folders,scanning:store.scanning});}
      if(url.pathname==='/search'&&request.method==='POST')return json(await store.search(body));
      if(url.pathname==='/local')return json(await store.localMedia(request.method==='POST'?body:Object.fromEntries(url.searchParams)));
      if(url.pathname==='/export'&&request.method==='POST')return json(await store.exportMedia(body.id,body.inherit,body.tags));
      if(url.pathname==='/sync'&&request.method==='POST')return json(await store.syncMetadata(body.id,body.inherit,body.tags));
      if(url.pathname==='/import'&&request.method==='POST')return json(await store.importToComfy(body.id));
      if(url.pathname==='/tags'&&request.method==='POST')return json(await store.manageTags(body));
      if(url.pathname.startsWith('/media/')){const result=await store.media(mediaID,url.searchParams.get('thumbnail')==='1',request.headers.range);response.statusCode=result.status;for(const header of ['content-length','content-range','accept-ranges'])if(result.headers.get(header))response.setHeader(header,result.headers.get(header));response.setHeader('Content-Type',result.headers.get('content-type')||'application/octet-stream');if(!result.body){response.end();return;}Readable.fromWeb(result.body).on('error',()=>response.destroy()).pipe(response);return;}
      json({error:'Unknown integration endpoint.'},404);
    }catch(error){if(response.headersSent){response.destroy();return;}json({error:error.message},400);}
  });
  let polling=false;
  const timer=setInterval(()=>{
    if(polling)return;
    polling=true;
    // Reconcile saved settings even when no integration page is open. Saving
    // Gallery's Hydrus connection completes a pending handshake on the next tick.
    store.scan().catch(()=>{}).then(()=>{
      if(store.config.comfyUrl&&store.config.hydrusApiKey&&!store.config.comfyInstanceId)return store.handshake();
    }).catch(()=>{}).finally(()=>{polling=false;});
  },pollIntervalMs);timer.unref();server.on('close',()=>clearInterval(timer));
  return {server,store};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const directory=process.env.HYDRUS_WEB_BRIDGE_DATA||path.join(homedir(),'.hydrus-web-integration');
  const {server}=await createIntegrationServer({token:process.env.HYDRUS_WEB_BRIDGE_TOKEN,directory,origins:(process.env.HYDRUS_WEB_BRIDGE_ORIGINS||'http://localhost:4200,http://localhost:8080,http://127.0.0.1:47837,capacitor://localhost,http://localhost').split(',')});
  const host=process.env.HYDRUS_WEB_BRIDGE_HOST||'127.0.0.1',port=Number(process.env.HYDRUS_WEB_BRIDGE_PORT||47838);
  server.listen(port,host,()=>console.log(`Hydrus Web integration bridge listening on ${host}:${port}`));
}
