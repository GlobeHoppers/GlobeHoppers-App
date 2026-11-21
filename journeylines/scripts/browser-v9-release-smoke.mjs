/* WP5 browser acceptance: no writes, token access, commits or deployment.
   Screenshots are visual candidates, not cross-GPU approved golden captures. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--out');
const out=path.resolve(i<0?'.wp5-smoke':process.argv[i+1]);
const base='http://127.0.0.1:4177/';
fs.mkdirSync(out,{recursive:true});
const report={schema:'globehoppers.wp5.smoke.v1',checks:[],screenshots:[],errors:[],status:'running'};
let server,browser,page;
const insist=(ok,what)=>{if(!ok)throw Error(what);report.checks.push(what)};
async function capture(label){await page.screenshot({path:path.join(out,label+'.png'),timeout:20000});report.screenshots.push(label+'.png')}
async function visit(query){page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(String(e)));const r=await page.goto(base+query,{waitUntil:'domcontentloaded',timeout:45000});if(!r?.ok())throw Error('HTTP '+r?.status())}
async function close(){await page?.close().catch(()=>{});page=null}
async function viewerReady(){await page.waitForFunction(()=>window.__GLOBEHOPPERS_VIEWER__?.snapshot().routesInMemory===401,null,{timeout:90000})}
async function state(){return page.evaluate(()=>({v:window.__GLOBEHOPPERS_VIEWER__?.snapshot(),r:window.__GLOBEHOPPERS_RENDERER__?.snapshot(),p:window.__GLOBEHOPPERS_BENCHMARK__?.snapshot()}))}
async function flightReady(expected){await page.waitForFunction(({tripId,legId})=>{const s=window.__GLOBEHOPPERS_BENCHMARK__?.snapshot();return s?.playing&&s.tripId===tripId&&String(s.legId)===String(legId)},expected,{timeout:90000})}
try{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177','--strictPort'],{cwd:root,stdio:'pipe'});
 let online=false;
 for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('preview exited');try{if((await fetch(base,{signal:AbortSignal.timeout(800)})).ok){online=true;break}}catch{}await sleep(180)}
 if(!online)throw Error('preview server unavailable');
 browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage']});
 report.browserVersion=browser.version();
 await visit('?v9Benchmark=1');
 await page.waitForFunction(()=>window.__GLOBEHOPPERS_RENDERER__?.snapshot(),null,{timeout:50000});
 let s=await state();
 insist(s.r.mode==='wp2-legacy','WP2 remains default before promotion');
 insist(!s.v.enabled,'compact v9 viewer is not default');
 await close();
 await visit('?v9Benchmark=1&v9Viewer=1&v9Playback=1&v9Renderer=1&v9Metrics=1');
 await viewerReady();s=await state();
 insist(s.v.mode==='viewer'&&!s.v.fallback,'verified compact viewer loads');
 insist(s.r.mode==='v9-pipeline','v9 renderer enabled only by flag');
 const selection=await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.start({progress:0.20,speed:0.25}));
 report.selection=selection;await flightReady(selection);await sleep(1500);
 s=await state();insist(s.p.tripId===selection.tripId&&s.p.progress>=0.19,'controlled flight advances');
 await capture('flight');
 const seek=await page.evaluate(index=>window.__GLOBEHOPPERS_BENCHMARK__.start({index,progress:0.65,speed:0.25}),selection.index);
 await flightReady(seek);
 await page.waitForFunction(()=>window.__GLOBEHOPPERS_BENCHMARK__?.snapshot().progress>=0.60,null,{timeout:30000});
 insist((await state()).p.legId===selection.legId,'same leg preserved on seek');
 await capture('seek');
 await page.locator('.topbar button[aria-label="Pause"]').first().click({timeout:25000});
 await page.waitForFunction(()=>window.__GLOBEHOPPERS_BENCHMARK__?.snapshot().playing===false,null,{timeout:15000});
 const stopped=(await state()).p.progress;await sleep(900);
 insist(Math.abs((await state()).p.progress-stopped)<0.004,'pause freezes playback');
 await page.locator('.topbar button[aria-label="Resume Travel History"]').first().click({timeout:25000});
 await page.waitForFunction(()=>window.__GLOBEHOPPERS_BENCHMARK__?.snapshot().playing===true,null,{timeout:15000});
 insist((await state()).p.tripId===selection.tripId,'resume keeps trip identity');
 await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.openStudio());
 await page.locator('.studio-shell').waitFor({state:'visible',timeout:45000});
 await capture('studio');insist(true,'single-user Studio accessible');
 await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.closeStudio());
 await page.locator('.studio-shell').waitFor({state:'detached',timeout:15000});
 insist((await state()).v.routesInMemory===401,'viewer restored after Studio close');
 await close();
 // Route interception is installed before navigation on a fresh page.
 page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(String(e)));
 await page.route('**/data/v9-viewer/manifest.json',route=>route.fulfill({status:503,body:'WP5 fault injection'}));
 const response=await page.goto(base+'?v9Viewer=1&v9Playback=1&v9Renderer=1',{waitUntil:'domcontentloaded',timeout:45000});
 if(!response?.ok())throw Error('fallback preview HTTP failed');
 await viewerReady();s=await state();
 insist(s.v.mode==='full-fallback'&&s.v.fallback,'broken viewer asset falls back to canonical data');
 await capture('fallback');await close();
 await visit('?screensaver=1&globeMinutes=0.01&v9Viewer=1&v9Playback=1&v9Renderer=1');
 await viewerReady();
 insist(await page.locator('main.app.is-screensaver').count()===1,'screensaver mode loads');
 await capture('screensaver');await close();
 insist(report.errors.length===0,'no browser JavaScript errors');
 report.status='pass';
}catch(error){report.status='fail';report.failure=String(error?.stack||error).slice(0,1800);process.exitCode=1;if(page)try{await capture('failure')}catch{}}
finally{report.finishedAt=new Date().toISOString();if(page)await close();if(browser)await browser.close().catch(()=>{});if(server)server.kill('SIGTERM');fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log('WP5_SMOKE '+JSON.stringify({status:report.status,checks:report.checks,screenshots:report.screenshots,errors:report.errors,failure:report.failure}))}
