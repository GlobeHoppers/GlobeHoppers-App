/* WP5 endurance watchdog; set V9_ENDURANCE_MINUTES=30 for release certification.
   CI SwiftShader cannot certify discrete GPU frame rate or visual quality. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--out'),out=path.resolve(i<0?'.wp5-endurance':process.argv[i+1]);
const minutes=Number(process.env.V9_ENDURANCE_MINUTES||2),duration=minutes*60000;
if(!Number.isFinite(minutes)||minutes<1||minutes>30)throw Error('V9_ENDURANCE_MINUTES must be between 1 and 30');
const base='http://127.0.0.1:4178/';
fs.mkdirSync(out,{recursive:true});
const report={schema:'globehoppers.wp5.endurance.v1',status:'running',minutesRequested:minutes,samples:[],errors:[],webglWarnings:0,softwareWebgl:true};
let server,browser,page;
try{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4178','--strictPort'],{cwd:root,stdio:'pipe'});
 let ready=false;for(let n=0;n<100;n++){if(server.exitCode!==null)throw Error('preview exited');try{if((await fetch(base,{signal:AbortSignal.timeout(800)})).ok){ready=true;break}}catch{}await sleep(180)}
 if(!ready)throw Error('preview server unavailable');
 browser=await chromium.launch({headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--enable-precise-memory-info','--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 page.on('pageerror',e=>report.errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='warning'&&/WebGL|READ-usage|GPU/i.test(m.text()))report.webglWarnings++});
 const response=await page.goto(base+'?v9Benchmark=1&v9Viewer=1&v9Playback=1&v9Renderer=1&v9Metrics=1',{waitUntil:'domcontentloaded',timeout:45000});
 if(!response?.ok())throw Error('preview HTTP status '+response?.status());
 await page.waitForFunction(()=>window.__GLOBEHOPPERS_VIEWER__?.snapshot().ready&&window.__GLOBEHOPPERS_BENCHMARK__?.start,null,{timeout:90000});
 report.selection=await page.evaluate(()=>window.__GLOBEHOPPERS_BENCHMARK__.start({progress:0.20,speed:0.25}));
 await page.waitForFunction(({tripId,legId})=>{const s=window.__GLOBEHOPPERS_BENCHMARK__?.snapshot();return s?.playing&&s.tripId===tripId&&String(s.legId)===String(legId)},report.selection,{timeout:90000});
 await page.evaluate(()=>window.__GLOBEHOPPERS_RENDERER__.enableMetrics());
 const start=Date.now();let moving=Date.now(),previous='';
 while(Date.now()-start<duration){
  await sleep(Math.min(15000,Math.max(800,duration-(Date.now()-start))));
  const raw=await cdp.send('Performance.getMetrics');
  const m=Object.fromEntries(raw.metrics.map(row=>[row.name,row.value]));
  if(!Number.isFinite(m.JSHeapUsedSize)||!Number.isFinite(m.JSHeapTotalSize))throw Error('Chromium heap counters unavailable');
  const x=await page.evaluate(()=>{const r=window.__GLOBEHOPPERS_RENDERER__.snapshot(),p=window.__GLOBEHOPPERS_BENCHMARK__.snapshot();return {p,viewer:window.__GLOBEHOPPERS_VIEWER__.snapshot(),mode:r.mode,displayFps:r.performance.estimatedRenderedFps||0,frames:r.performance.counters.frames||0,longGaps:r.performance.renderedGapsOver250Ms||0}});
  if(x.viewer.routesInMemory!==401||x.mode!=='v9-pipeline')throw Error('view/renderer changed unexpectedly');
  if(!x.p.playing)throw Error('playback halted');
  if(report.errors.length)throw Error('uncaught browser JS exception');
  const identity=[x.p.tripId,x.p.legId,Number(x.p.progress).toFixed(5),x.p.generation].join('/');
  if(identity!==previous)moving=Date.now();
  previous=identity;
  if(Date.now()-moving>=60000)throw Error('playback stalled >60 seconds');
  const entry={elapsedSeconds:Number(((Date.now()-start)/1000).toFixed(1)),heapUsedMB:Number((m.JSHeapUsedSize/1048576).toFixed(1)),heapTotalMB:Number((m.JSHeapTotalSize/1048576).toFixed(1)),domNodes:m.Nodes,eventListeners:m.JSEventListeners,...x};
  report.samples.push(entry);
  console.log('WP5_ENDURANCE_SAMPLE '+JSON.stringify(entry));
 }
 report.durationObservedSeconds=(Date.now()-start)/1000;
 const first=report.samples[0],last=report.samples.at(-1);
 report.heapGrowthMB=Number((last.heapUsedMB-first.heapUsedMB).toFixed(1));
 // Memory is advisory: one last-heap sample is not proof of retained leakage.
 report.memoryReviewRequired=report.heapGrowthMB>120&&last.heapUsedMB>first.heapUsedMB*2;
 await page.screenshot({path:path.join(out,'final.png'),timeout:20000});
 report.status='pass';
}catch(e){report.status='fail';report.failure=String(e?.stack||e).slice(0,1800);process.exitCode=1}
finally{if(page)await page.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(server)server.kill('SIGTERM');fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log('WP5_ENDURANCE '+JSON.stringify({status:report.status,minutes:report.minutesRequested,observed:report.durationObservedSeconds,samples:report.samples.length,heapGrowthMB:report.heapGrowthMB,webglWarnings:report.webglWarnings,failure:report.failure}))}
