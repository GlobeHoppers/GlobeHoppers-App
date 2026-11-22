import test from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base=process.env.CINEMATIC_BASE_URL||'http://127.0.0.1:5173/cinematic/';
const output=process.argv[2]||'/tmp/cinematic-exhibition-smoke';
fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1440,height:900},
  deviceScaleFactor:1,reducedMotion:'reduce'});
const exceptions=[];
page.on('pageerror',error=>exceptions.push(error.message));
const current=()=>page.evaluate(()=>window.__CINEMATIC_GLOBEHOPPERS__.getState());

try {
  await page.goto(base+'?demo=1&exhibition=1&map=earth&reset=1',
    {waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
    const api=window.__CINEMATIC_GLOBEHOPPERS__;
    return api?.getState().ready && api.getState().exhibition &&
      api.getExhibitionDetails().enabled && api.getState().elapsedMs>100;
  },null,{timeout:60000});

  const initial=await current();
  test.equal(initial.exhibition,true);
  test.equal(initial.controlsVisible,false,'exhibition starts with hidden controls');
  const metadata=await page.evaluate(()=>{
    const api=window.__CINEMATIC_GLOBEHOPPERS__;
    return {version:api.version,playlist:api.getPlaylistDetails(),
      exhibition:api.getExhibitionDetails()};
  });
  test.equal(metadata.version,'cinematic-globehoppers.wp4');
  test.equal(metadata.playlist.tripCount,1);
  test.ok(metadata.exhibition.enabled);
  test.ok(metadata.playlist.loopClosureMs>2000);
  test.equal(await page.locator('.cg-console').isVisible(),false);
  await page.screenshot({path:path.join(output,'exhibition-clean.png')});

  const prior=await current();
  test.ok(prior.playing || prior.buffering,
    'exhibition should already be running or waiting for imagery');
  await page.waitForFunction(startMs=>{
    const state=window.__CINEMATIC_GLOBEHOPPERS__.getState();
    return state.elapsedMs>startMs+175 || state.buffering;
  },prior.elapsedMs,{timeout:20000,polling:120});
  const advanced=await current();
  test.ok(advanced.elapsedMs>prior.elapsedMs+175 || advanced.buffering,
    'unattended presentation should progress or deliberately prepare imagery');

  // Pointer activity reveals controls without affecting the v9 playback clock.
  await page.mouse.move(410,175);
  await page.waitForFunction(()=>window.__CINEMATIC_GLOBEHOPPERS__.getState().controlsVisible,
    null,{timeout:5000});
  await page.locator('.cg-console').waitFor({state:'visible',timeout:10000});
  test.equal(await page.locator('.cg-console').isVisible(),true);
  test.equal(await page.getByRole('button',{name:'Enter fullscreen display'}).count(),1,
    'fullscreen must be a user-gesture button');
  await page.screenshot({path:path.join(output,'exhibition-controls.png')});

  // Headless screenshot rendering can take longer than the 6.5-second idle
  // timeout. Wake the controls again just before interacting.
  await page.mouse.move(417,192);
  await page.locator('.cg-console').waitFor({state:'visible',timeout:10000});
  await page.getByRole('button',{name:'Pause playback'}).click();
  const paused=await current();
  await page.waitForTimeout(180);
  const still=await current();
  test.ok(Math.abs(still.elapsedMs-paused.elapsedMs)<75,
    'explicit manual pause must not be overridden by exhibition autoplay');
  await page.mouse.move(422,198);
  await page.locator('.cg-console').waitFor({state:'visible',timeout:10000});
  await page.getByRole('button',{name:'Play cinematic route'}).click();

  // The end-to-beginning wrap is an actual camera trajectory, not a hard cut.
  const loop=await page.evaluate(()=>{
    const api=window.__CINEMATIC_GLOBEHOPPERS__;
    const first=api.sampleAtMs(0),last=api.sampleAtMs(api.durationMs);
    const duration=api.durationMs;
    api.seekMs(duration-420);
    api.play();
    return {first,last,duration};
  });
  test.ok(Math.abs(loop.first.zoom-loop.last.zoom)<1e-6);
  test.ok(Math.abs(loop.first.pitch-loop.last.pitch)<1e-6);
  test.ok(Math.abs(loop.first.center[1]-loop.last.center[1])<1e-6);
  await page.waitForFunction(()=>window.__CINEMATIC_GLOBEHOPPERS__.getExhibitionDetails().loopCount>=1,
    null,{timeout:15000});
  const afterLoop=await current();
  test.ok(afterLoop.elapsedMs<2000,'the loop should restart from the first trip');
  test.ok(afterLoop.ready,'loop must not recreate WebGL');

  // Explicit recovery path restores the same time and restarts playback.
  const recoveringAt=await current();
  test.equal(await page.evaluate(()=>
    window.__CINEMATIC_GLOBEHOPPERS__.requestRendererRecovery()),true);
  await page.waitForFunction(()=>
    window.__CINEMATIC_GLOBEHOPPERS__.getExhibitionDetails().rendererGeneration>=1 &&
    window.__CINEMATIC_GLOBEHOPPERS__.getState().ready,
    null,{timeout:60000});
  const recovered=await current();
  test.ok(recovered.elapsedMs>=recoveringAt.elapsedMs-150,
    'renderer recovery should retain the playback timestamp');
  const resumeAt=await current();
  await page.waitForFunction(startMs=>{
    const state=window.__CINEMATIC_GLOBEHOPPERS__.getState();
    return state.elapsedMs>startMs+125 || state.buffering;
  },resumeAt.elapsedMs,{timeout:20000,polling:120});
  test.ok((await current()).elapsedMs>resumeAt.elapsedMs+125 ||
    (await current()).buffering, 'exhibition must resume after renderer recovery');
  await page.screenshot({path:path.join(output,'exhibition-recovered.png')});

  // Idle chrome is not allowed to remain over a dedicated always-on screen.
  await page.mouse.move(450,280);
  await page.waitForFunction(()=>window.__CINEMATIC_GLOBEHOPPERS__.getState().controlsVisible);
  await page.waitForFunction(()=>
    window.__CINEMATIC_GLOBEHOPPERS__.getState().controlsVisible===false,
    null,{timeout:11000});
  await page.locator('.cg-console').waitFor({state:'hidden',timeout:7000});
  test.equal(await page.locator('.cg-console').isVisible(),false);

  // Kiosk restarts should return to the last saved position, not hour zero.
  await page.evaluate(()=>{
    const api=window.__CINEMATIC_GLOBEHOPPERS__;
    localStorage.setItem('cinematic-globehoppers-exhibition-checkpoint-v1',
      JSON.stringify({durationMs:api.durationMs,tripCount:api.tripCount,
        ms:17000,savedAt:Date.now()}));
  });
  await page.goto(base+'?demo=1&exhibition=1&map=earth',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__CINEMATIC_GLOBEHOPPERS__?.getState().ready,
    null,{timeout:60000});
  const resumed=await current();
  test.ok(resumed.elapsedMs>=16950 && resumed.elapsedMs<26000,
    'restarting the display should resume near the saved checkpoint');
  test.equal(resumed.exhibition,true);

  // Ordinary viewing and deterministic video capture stay opt-in and unchanged.
  await page.goto(base+'?demo=1&capture=1&exhibition=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__CINEMATIC_GLOBEHOPPERS__?.getState().ready,
    null,{timeout:60000});
  const capture=await current();
  test.equal(capture.exhibition,false,'capture must disable exhibition autoplay');
  test.equal(await page.locator('.cg-console').count(),0,
    'capture mode must not show exhibition controls');
  test.deepEqual(exceptions,[], 'no uncaught browser exceptions');

  console.log(JSON.stringify({status:'PASS',version:metadata.version,
    loopClosureMs:metadata.playlist.loopClosureMs,
    recoveryGeneration:1,checkpoint:resumed.elapsedMs,
    screenshots:output},null,2));
} catch(error) {
  console.error('WP4 exhibition browser smoke failed:',error);
  console.error('Page errors:',exceptions);
  await page.screenshot({path:path.join(output,'exhibition-failure.png')}).catch(()=>{});
  throw error;
} finally {
  await browser.close();
}
