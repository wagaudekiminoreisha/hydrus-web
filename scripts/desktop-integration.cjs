const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
(async()=>{const root=path.resolve(__dirname),directory=await fs.mkdtemp(path.join(root,'desktop-qa-'));let app;
try {
app=await _electron.launch({executablePath:require('electron'),args:[path.resolve(__dirname,'../electron/main.cjs')],env:{...process.env,HYDRUS_WEB_HEADLESS_QA:'1',HYDRUS_WEB_QA_USER_DATA:directory}});
const page=await app.firstWindow();page.setDefaultTimeout(15000);await page.goto('http://127.0.0.1:47837/integration');await page.waitForFunction(()=>document.querySelector('input[type=password]')?.value.length>=24);await page.getByRole('button',{name:'Connect',exact:true}).click();await page.getByRole('heading',{name:'Media workspace',exact:true}).waitFor();
const bootstrap=await(await page.request.get('http://127.0.0.1:47837/__integration/bootstrap')).json();assert.match(bootstrap.url,/^http:\/\/127\.0\.0\.1:/);assert(bootstrap.token.length>=24);
assert.equal((await page.request.get('http://127.0.0.1:47837/__integration/bootstrap',{headers:{Origin:'https://untrusted.example'}})).status(),403);
assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);console.log('PASS Windows desktop private bridge bootstrap, hidden fixture profile and origin restriction');
}finally{if(app)await app.close();assert(directory.startsWith(root+path.sep+'desktop-qa-'));await fs.rm(directory,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exit(1)});
