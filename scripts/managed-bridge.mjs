import {homedir} from 'node:os';
import path from 'node:path';
import {createIntegrationServer} from './integration-server.mjs';
import {randomBytes} from 'node:crypto';

/** The app owns a private runtime credential; local UI requests use a guarded proxy. */
export async function startManagedBridge(env=process.env) {
  const token=env.HYDRUS_WEB_BRIDGE_TOKEN||randomBytes(32).toString('hex');
  const host=env.HYDRUS_WEB_BRIDGE_HOST||'127.0.0.1';
  const port=Number(env.HYDRUS_WEB_BRIDGE_PORT||(env.HYDRUS_WEB_BRIDGE_TOKEN?'47838':'0'));
  const origins=(env.HYDRUS_WEB_BRIDGE_ORIGINS||'http://localhost:4200,http://127.0.0.1:4200,http://localhost:8080').split(',');
  const {server}=await createIntegrationServer({token,origins,directory:env.HYDRUS_WEB_BRIDGE_DATA||path.join(homedir(),'.hydrus-web-integration')});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  } catch(error) { server.close(); throw new Error(`Cannot start the configured integration bridge: ${error.message}`); }
  const targetHost=host==='0.0.0.0'?'127.0.0.1':host==='::'||host==='::1'?'[::1]':host;
  Object.defineProperties(server,{integrationToken:{value:token},integrationTarget:{value:`http://${targetHost}:${server.address().port}`}});
  console.log('Local integration is managed by Hydrus Web. Configure ComfyUI in the app.');
  return server;
}
