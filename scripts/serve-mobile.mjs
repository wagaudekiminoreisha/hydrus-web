import {createReadStream, existsSync, readFileSync, statSync} from 'node:fs';
import {createServer as createHttpServer, request as httpRequest} from 'node:http';
import {createServer as createHttpsServer, request as httpsRequest} from 'node:https';
import {networkInterfaces} from 'node:os';
import {dirname, extname, join, relative, resolve, sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const distributionDirectory = resolve(
  process.env.HYDRUS_WEB_DIST || join(projectDirectory, 'dist', 'hydrus-web')
);
const host = process.env.HYDRUS_WEB_HOST || '0.0.0.0';
const port = Number.parseInt(process.env.HYDRUS_WEB_PORT || '8080', 10);
const apiProxyPrefix = '/hydrus-api/';
const apiProxyTarget = new URL(process.env.HYDRUS_API_PROXY || 'http://127.0.0.1:45869/');
const tlsCertificatePath = process.env.HYDRUS_WEB_TLS_CERT;
const tlsKeyPath = process.env.HYDRUS_WEB_TLS_KEY;

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('HYDRUS_WEB_PORT must be a number from 1 to 65535.');
  process.exit(1);
}

if (process.argv.includes('--build')) {
  runBuildStep('version-info.js');
  runBuildStep(join('node_modules', '@angular', 'cli', 'bin', 'ng.js'), ['build', '--configuration', 'production']);
}

const indexPath = join(distributionDirectory, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`No production build was found at ${distributionDirectory}.`);
  console.error('Run this script with --build, or run the Angular production build first.');
  process.exit(1);
}

if(Boolean(tlsCertificatePath) !== Boolean(tlsKeyPath)) {
  console.error('Set both HYDRUS_WEB_TLS_CERT and HYDRUS_WEB_TLS_KEY, or neither.');
  process.exit(1);
}

const useHttps = Boolean(tlsCertificatePath && tlsKeyPath);
const requestHandler = (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://hydrus-web.local');
  if (requestUrl.pathname.startsWith(apiProxyPrefix)) {
    proxyHydrusRequest(request, response, requestUrl);
    return;
  }
  serveApplicationFile(request, response, requestUrl);
};

const server = useHttps
  ? createHttpsServer({
      cert: readFileSync(tlsCertificatePath),
      key: readFileSync(tlsKeyPath)
    }, requestHandler)
  : createHttpServer(requestHandler);

const stopServers = () => { server.close(); };
process.once('SIGINT', stopServers);
process.once('SIGTERM', stopServers);
server.listen(port, host, () => {
  const protocol = useHttps ? 'https' : 'http';
  console.log('\nHydrus Web is ready:');
  for(const address of lanAddresses()) {
    console.log(`  ${protocol}://${formatHost(address)}:${port}/`);
  }
  console.log(`\nOn the iPad, set the Hydrus API URL to:`);
  console.log(`  ${protocol}://<the same address>:${port}${apiProxyPrefix}`);
  console.log(`The proxy forwards only that path to ${apiProxyTarget.origin}.`);
  if (!useHttps) {
    console.log('\nLAN mode uses HTTP. It works in Safari, but HTTPS is required for offline caching and full PWA behavior.');
  }
  console.log('Press Ctrl+C to stop.\n');
});

server.on('error', error => {
  console.error(`Unable to start Hydrus Web: ${error.message}`);
  process.exitCode = 1;
});

function runBuildStep(script, argumentsList = []) {
  const result = spawnSync(process.execPath, [join(projectDirectory, script), ...argumentsList], {
    cwd: projectDirectory,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function serveApplicationFile(request, response, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    sendText(response, 400, 'Invalid URL');
    return;
  }

  const requestedPath = resolve(distributionDirectory, `.${pathname}`);
  const outsideDistribution = requestedPath !== distributionDirectory
    && !requestedPath.startsWith(distributionDirectory + sep);
  if (outsideDistribution) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let filePath = requestedPath;
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = indexPath;
  }

  const extension = extname(filePath).toLowerCase();
  const fileName = relative(distributionDirectory, filePath).replaceAll('\\', '/');
  const noCache = fileName === 'index.html'
    || fileName === 'ngsw.json'
    || fileName === 'ngsw-worker.js'
    || fileName === 'manifest.webmanifest';

  response.writeHead(200, {
    'Cache-Control': noCache ? 'no-cache' : 'public, max-age=86400',
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
    'Referrer-Policy': 'same-origin',
    'Service-Worker-Allowed': '/',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

function proxyHydrusRequest(request, response, requestUrl) {
  const upstreamPath = requestUrl.pathname.substring(apiProxyPrefix.length) + requestUrl.search;
  const upstreamUrl = new URL(upstreamPath, apiProxyTarget);
  const requestFunction = upstreamUrl.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = {...request.headers, host: upstreamUrl.host};
  delete headers.connection;

  const upstreamRequest = requestFunction(upstreamUrl, {
    method: request.method,
    headers
  }, upstreamResponse => {
    const responseHeaders = {...upstreamResponse.headers};
    delete responseHeaders.connection;
    responseHeaders['cache-control'] = 'no-store';
    response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(response);
  });

  upstreamRequest.on('error', error => {
    if (!response.headersSent) {
      response.writeHead(502, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    }
    response.end(JSON.stringify({
      error: `Could not reach the Hydrus Client API at ${apiProxyTarget.origin}: ${error.message}`
    }));
  });
  request.pipe(upstreamRequest);
}

function sendText(response, status, message) {
  response.writeHead(status, {'Content-Type': 'text/plain; charset=utf-8'});
  response.end(message);
}

function lanAddresses() {
  if (host !== '0.0.0.0' && host !== '::') {
    return [host];
  }
  const addresses = new Set(['localhost']);
  for(const entries of Object.values(networkInterfaces())) {
    for(const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
}

function formatHost(address) {
  return address.includes(':') ? `[${address}]` : address;
}
