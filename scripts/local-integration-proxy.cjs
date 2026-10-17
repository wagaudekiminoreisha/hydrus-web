const {request: httpRequest} = require('node:http');
const PREFIX='/__integration/api';
function allowed(request) {
  const peer=request.socket.remoteAddress;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer))return false;
  if(request.headers.forwarded||request.headers['x-forwarded-for']||request.headers['x-forwarded-host'])return false;
  try {
    const local=new URL((request.socket.encrypted?'https://':'http://')+request.headers.host);
    if(!['localhost','127.0.0.1','[::1]'].includes(local.hostname))return false;
    if(request.headers['sec-fetch-site']==='cross-site')return false;
    return !request.headers.origin || request.headers.origin===local.origin;
  } catch { return false; }
}
function deny(response) {
  response.writeHead(403,{'Content-Type':'application/json','Cache-Control':'no-store'});
  response.end(JSON.stringify({error:'Automatic integration is available only from this computer at localhost. Use an authenticated bridge connection for remote access.'}));
}
function proxyLocalIntegration(request,response,bridge) {
  if(!allowed(request)) {deny(response);return;}
  const target=new URL(bridge.integrationTarget);
  const headers={...request.headers,host:target.host,authorization:'Bearer '+bridge.integrationToken};delete headers.origin;
  const upstream=httpRequest({hostname:target.hostname,port:target.port,method:request.method,path:request.url.slice(PREFIX.length)||'/',headers},result=>{
    response.writeHead(result.statusCode,result.headers);result.pipe(response);
  });
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'The managed integration bridge is unavailable.'}));});
  response.on('close',()=>upstream.destroy());request.pipe(upstream);
}
module.exports={PREFIX,allowed,deny,proxyLocalIntegration};
