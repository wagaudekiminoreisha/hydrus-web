import {homedir} from 'node:os';
import path from 'node:path';
import {createIntegrationServer} from './integration-server.mjs';

/** Explicit server configuration enables the bridge; credentials never enter a public bootstrap. */
export async function startManagedBridge(env=process.env) {
  if(!env.HYDRUS_WEB_BRIDGE_TOKEN) return undefined;
  const host=env.HYDRUS_WEB_BRIDGE_HOST||'127.0.0.1';
  const port=Number(env.HYDRUS_WEB_BRIDGE_PORT||47838);
  const origins=(env.HYDRUS_WEB_BRIDGE_ORIGINS||'http://localhost:4200,http://127.0.0.1:4200,http://localhost:8080').split(',');
  const {server}=await createIntegrationServer({token:env.HYDRUS_WEB_BRIDGE_TOKEN,origins,directory:env.HYDRUS_WEB_BRIDGE_DATA||path.join(homedir(),'.hydrus-web-integration')});
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  } catch(error) { server.close(); throw new Error(`Cannot start the configured integration bridge: ${error.message}`); }
  console.log(`Integration bridge listening on ${host}:${port}`);
  return server;
}
