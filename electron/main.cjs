const {app, BrowserWindow, shell} = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const appHost = '127.0.0.1';
const appPort = 47837;
const webRoot = path.resolve(__dirname, '..', 'dist', 'hydrus-web');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function resolveWebFile(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${appHost}:${appPort}`).pathname);
  const requestedPath = pathname.replace(/^\/+/, '') || 'index.html';
  const candidate = path.resolve(webRoot, requestedPath);
  const insideWebRoot = candidate === webRoot || candidate.startsWith(`${webRoot}${path.sep}`);

  if (!insideWebRoot) {
    return undefined;
  }

  try {
    if (fs.statSync(candidate).isFile()) {
      return candidate;
    }
  } catch {
    // Angular routes are served by index.html below.
  }

  return path.join(webRoot, 'index.html');
}

function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveWebFile(request.url || '/');

      if (!filePath) {
        response.writeHead(403).end('Forbidden');
        return;
      }

      fs.readFile(filePath, (error, body) => {
        if (error) {
          response.writeHead(404).end('Not found');
          return;
        }

        response.writeHead(200, {
          'Cache-Control': 'no-cache',
          'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(body);
      });
    });

    server.once('error', reject);
    server.listen(appPort, appHost, () => resolve(server));
  });
}

function createWindow() {
  const window = new BrowserWindow({
    show: !process.env.HYDRUS_WEB_HEADLESS_QA,
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 540,
    backgroundColor: '#121318',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const appOrigin = `http://${appHost}:${appPort}`;
  window.webContents.setWindowOpenHandler(({url}) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
    return {action: 'deny'};
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${appOrigin}/`)) {
      event.preventDefault();
    }
  });
  void window.loadURL(appOrigin);
}

if(process.env.HYDRUS_WEB_QA_USER_DATA) app.setPath('userData',path.resolve(process.env.HYDRUS_WEB_QA_USER_DATA));
const ownsInstance = app.requestSingleInstanceLock();

if (!ownsInstance) {
  app.quit();
} else {
  let server;

  app.setAppUserModelId('io.github.hydrusweb.desktop');
  app.whenReady().then(async () => {
    server = await startWebServer();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch(error => {
    console.error(error);
    app.quit();
  });

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    server?.close();
  });
}
