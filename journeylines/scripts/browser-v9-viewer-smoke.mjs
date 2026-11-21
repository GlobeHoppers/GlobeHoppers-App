/**
 * WP4 browser gate: prove read-only playback stays out of the Studio bundle.
 * No auth, commits, or data edits are performed by this smoke test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv.indexOf('--out');
const out = path.resolve(arg < 0 ? '.v9-viewer-smoke' : process.argv[arg + 1]);
fs.mkdirSync(out, { recursive:true });
const base = 'http://127.0.0.1:4175/';
const summary = { schema:'globehoppers.wp4.browser-smoke.v1', startedAt:new Date().toISOString(),
  requests:[], errors:[], screenshots:[], status:'running' };
let server, browser, page;
const check = (condition, message) => {if(!condition) throw new Error(message);};
const screenshot = async file => {try{await page.screenshot({path:path.join(out,file),timeout:20000});summary.screenshots.push(file);}catch(e){summary.errors.push('screenshot: '+String(e).slice(0,200));}};
try {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4175','--strictPort'],
    {cwd:root,stdio:'pipe'});
  let ready=false;
  for(let i=0;i<90;i++){
    if(server.exitCode!==null)throw new Error('Preview server exited prematurely');
    try{const res=await fetch(base,{signal:AbortSignal.timeout(900)});if(res.ok){ready=true;break;}}catch{}
    await delay(160);
  }
  check(ready,'Preview server failed to start');
  browser=await chromium.launch({headless:true,args:[
    '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle',
    '--use-angle=swiftshader','--disable-dev-shm-usage','--no-sandbox'
  ]});
  page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('request',r=>{
    const url=r.url();
    if(url.startsWith(base))summary.requests.push(url.replace(base,'/'));
  });
  page.on('pageerror',e=>summary.errors.push('page: '+String(e).slice(0,400)));
  const res=await page.goto(base+'?v9Benchmark=1&v9Viewer=1&v9Playback=1&v9Renderer=1',
    {waitUntil:'domcontentloaded',timeout:45000});
  check(res.ok(),'Preview returned non-200 response');

  await page.waitForFunction(()=>{
    const data=window.__GLOBEHOPPERS_VIEWER__?.snapshot();
    return data?.ready && data?.mode==='viewer' && data?.routesInMemory===401;
  },null,{timeout:70000});
  summary.viewer=await page.evaluate(()=>window.__GLOBEHOPPERS_VIEWER__.snapshot());
  check(summary.viewer.enabled && summary.viewer.mode==='viewer','Compact viewer did not load');
  summary.initialRequestCount=summary.requests.length;
  check(summary.requests.some(x=>x.includes('/data/v9-viewer/manifest.json')),'Missing compact manifest request');
  check(summary.requests.some(x=>x.includes('/data/v9-viewer/route-details.json')),'Missing compact routes request');
  check(!summary.requests.some(x=>/\/routeDetails-[^/]+\.js/.test(x)),
    'Full editor route metadata downloaded during read-only startup');
  check(!summary.requests.some(x=>/\/AdminPanel-[^/]+\.js/.test(x)),
    'Editor bundle downloaded during read-only startup');

  summary.selection=await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.start({progress:.20,speed:.25}));
  await page.waitForFunction(({tripId,legId})=>{
    const x=window.__GLOBEHOPPERS_BENCHMARK__?.snapshot();
    return x?.playing && x.tripId===tripId && String(x.legId)===String(legId);
  },summary.selection,{timeout:70000});
  summary.playback=await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.snapshot());
  await screenshot('viewer.png');

  await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.openStudio());
  await page.locator('.studio-shell').waitFor({state:'visible',timeout:50000});
  summary.editorRequested=summary.requests.some(x=>/\/AdminPanel-[^/]+\.js/.test(x));
  summary.fullRouteModuleRequested=summary.requests.some(x=>/\/routeDetails-[^/]+\.js/.test(x));
  check(summary.editorRequested,'Studio chunk not requested on user open');
  check(summary.fullRouteModuleRequested,'Canonical route metadata was not loaded for Studio');
  await screenshot('studio.png');

  await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.closeStudio());
  await page.locator('.studio-shell').waitFor({state:'detached',timeout:10000});
  summary.afterClose=await page.evaluate(()=>window.__GLOBEHOPPERS_VIEWER__.snapshot());
  check(summary.afterClose.ready && summary.afterClose.routesInMemory===401,
    'Viewer data lost when returning from Studio');
  await screenshot('viewer-after-close.png');
  check(!summary.errors.some(x=>x.startsWith('page:')),'Browser JavaScript error(s): '+summary.errors.join('; '));
  summary.status='pass';
} catch(error){
  summary.status='fail';
  summary.failure=String(error?.stack||error).slice(0,1800);
  if(page)await screenshot('failure.png');
  process.exitCode=1;
} finally {
  summary.finishedAt=new Date().toISOString();
  if(page)await page.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
  if(server)server.kill('SIGTERM');
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log('V9_VIEWER_SMOKE_REPORT '+JSON.stringify({
    status:summary.status,source:summary.viewer,selection:summary.selection,
    editorRequested:summary.editorRequested,fullRouteModuleRequested:summary.fullRouteModuleRequested,
    requestCount:summary.requests.length,errors:summary.errors,
    failure:summary.failure
  }));
}
