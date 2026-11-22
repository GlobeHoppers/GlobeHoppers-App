import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.env.CINEMATIC_BASE_URL || 'http://127.0.0.1:5173/cinematic/';
const base = root + '?demo=1';
const out = process.argv[2] || '/tmp/cinematic-smoke';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1, reducedMotion: 'reduce' });
const runtimeErrors = [];
const unexpectedHosts = [];
const unexpectedLocalImageryRequests=[];
page.on('pageerror', e => runtimeErrors.push(e.message));
page.on('request', request => {
  if (/(\.|^)mult\.dev$/.test(new URL(request.url()).hostname)) unexpectedHosts.push(request.url());
  if (page.url().includes('?demo=1') && !page.url().includes('capture=1') &&
      /gibs\.earthdata\.nasa\.gov|tiles\.maps\.eox\.at|tiles\.openfreemap\.org/.test(request.url()))
    unexpectedLocalImageryRequests.push(request.url());
});
try {
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__CINEMATIC_GLOBEHOPPERS__,
    null, { timeout: 15000 });
  await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 90000 });
  await page.waitForFunction(() => {
    const play = document.querySelector('.cg-play');
    return play && play.disabled === false;
  }, null, { timeout: 90000 });

  const first = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  const meta = await page.evaluate(() => {
    const api = window.__CINEMATIC_GLOBEHOPPERS__;
    return { version: api.version, stops: api.stopCount, duration: api.durationMs };
  });
  assert.equal(meta.stops, 8);
  assert.ok(meta.duration > 20000);
  assert.ok(first.ready);

  // Local Earth is the default: all NASA imagery is compiled and served by us.
  const initialImagery = await page.evaluate(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails());
  assert.equal(initialImagery.preset, 'local');
  assert.equal(initialImagery.installed, true);
  assert.deepEqual(initialImagery.activeLayers,['cg-earth-local']);
  assert.equal(initialImagery.labelLayerCount,0,'local Earth requires no remote glyphs');
  assert.equal(initialImagery.localEarth.ready,true);
  assert.equal(initialImagery.localEarth.cachedTiles,1365);
  assert.ok(await page.locator('.cg-local-stop-label').count()>=1,
    'the self-contained globe should retain geographically attached city labels');
  assert.deepEqual(unexpectedLocalImageryRequests,[],
    'local Earth must not request NASA/EOX/OpenFreeMap tiles at runtime');

  await page.screenshot({ path: path.join(out, 'cinematic-initial.png') });

  // Changing globe appearance cannot tear down the map, reset camera progress,
  // destroy the route layer, or interfere with the moving airplane.
  const timeBeforeStyles = await page.evaluate(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getState().elapsedMs);
  await page.getByLabel('Globe appearance').selectOption('midnight');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getState().ready &&
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails()?.preset === 'midnight',
    null,{timeout:90000});
  const midnightImagery = await page.evaluate(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails());
  assert.deepEqual(midnightImagery.activeLayers, []);
  await page.screenshot({ path: path.join(out, 'cinematic-midnight.png') });

  await page.getByLabel('Globe appearance').selectOption('hybrid');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails().preset === 'hybrid');
  await page.getByLabel('Globe appearance').selectOption('satellite');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails().preset === 'satellite');
  assert.equal(await page.getByLabel('Globe appearance').inputValue(), 'satellite');
  await page.screenshot({ path: path.join(out, 'cinematic-satellite.png') });

  await page.getByLabel('Globe appearance').selectOption('earth');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails().preset === 'earth');
  // Switch back across the local/remote renderer boundary while keeping time.
  await page.getByLabel('Globe appearance').selectOption('local');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getState().ready &&
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails()?.preset === 'local',
    null,{timeout:90000});
  const timeAfterStyles = await page.evaluate(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getState().elapsedMs);
  assert.ok(Math.abs(timeAfterStyles - timeBeforeStyles) < 75,
    'changing imagery must not reset the playback clock');


  await page.getByRole('button', { name: 'Play cinematic route' }).click();
  // Headless SwiftShader may spend >1 s decoding new satellite tiles. Require
  // observable clock progress, not a particular single-frame CI deadline.
  await page.waitForFunction(startMs => {
    const s=window.__CINEMATIC_GLOBEHOPPERS__.getState();
    return s.elapsedMs > startMs + 200 || s.buffering;
  }, first.elapsedMs, { timeout: 20000, polling: 120 });
  const advancing = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  assert.ok(advancing.elapsedMs > first.elapsedMs + 200 || advancing.buffering,
    'playback clock did not advance or enter a deliberate imagery preflight');

  await page.getByRole('button', { name: 'Pause playback' }).click();
  const paused = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  await page.waitForTimeout(180);
  const still = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.getState());
  assert.ok(Math.abs(still.elapsedMs - paused.elapsedMs) < 75, 'pause failed to hold the deterministic clock');
  const seek = await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(12000));
  assert.ok(Array.isArray(seek.center));
  assert.ok(Number.isFinite(seek.zoom));
  await page.screenshot({ path: path.join(out, 'cinematic-seek.png') });

  // Verify that no future marker appears early, and inspect a flight in Chromium.
  const phase = await page.evaluate(() => {
    const api = window.__CINEMATIC_GLOBEHOPPERS__;
    const initial = api.getPresentationAtMs(0);
    let flightMs = -1;
    let arrivalMs = -1;
    for (let ms = 0; ms < api.durationMs; ms += 95) {
      const frame = api.getPresentationAtMs(ms);
      if (flightMs < 0 && frame.plane && frame.visibleStops.length === 2) flightMs = ms;
      if (arrivalMs < 0 && frame.arrival?.opacity > 0.85) arrivalMs = ms;
      const pose = api.sampleAtMs(ms);
      if (pose.bearing < -45.0001 || pose.bearing > 45.0001) {
        throw new Error('Camera exceeds north-up limit at ' + ms + 'ms');
      }
    }
    return { initial, flightMs, arrivalMs,
      flight: api.getPresentationAtMs(flightMs) };
  });
  assert.equal(phase.initial.visibleStops.length, 1);
  assert.equal(phase.initial.visibleRouteCount, 0);
  assert.ok(phase.flightMs > 0);
  assert.ok(phase.flight.plane);
  assert.equal(phase.flight.visibleStops.length, 2);
  assert.ok(phase.arrivalMs > phase.flightMs);
  await page.evaluate(ms => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(ms), phase.flightMs);
  const flightDom = await page.evaluate(ms => {
    const root = document.querySelector('.cg-aircraft');
    const image = document.querySelector('.cg-aircraft-img');
    const expected = window.__CINEMATIC_GLOBEHOPPERS__.projectAircraftAtMs(ms);
    const rootBounds = root?.getBoundingClientRect();
    const actorBounds = document.querySelector('.cg-actors')?.getBoundingClientRect();
    return {
      visible: root?.style.visibility,
      transform: image?.style.transform,
      imageSrc: image?.currentSrc || image?.src,
      imageLoaded: Boolean(image?.complete && image.naturalWidth > 0),
      expected,
      actual: rootBounds && actorBounds
        ? { x: rootBounds.left - actorBounds.left, y: rootBounds.top - actorBounds.top }
        : null,
      noLegacyLift: document.querySelector('.cg-aircraft-lift') === null,
      noLegacyVector: document.querySelector('.cg-aircraft-visual') === null
    };
  }, phase.flightMs);
  assert.equal(flightDom.visible, 'visible', 'airplane should be visible during flight');
  assert.ok(flightDom.transform?.includes('rotate('), 'airplane rotates with route tangent');
  assert.ok(flightDom.transform?.includes('rotateX('), 'v9 PNG pitches during takeoff and landing');
  assert.ok(flightDom.imageSrc?.includes('Airplane'), 'use actual GlobeHoppers PNG asset');
  assert.ok(flightDom.imageLoaded, 'v9 PNG must be loaded');
  assert.ok(flightDom.noLegacyLift && flightDom.noLegacyVector, 'remove synthetic lift and SVG');
  assert.ok(flightDom.expected && flightDom.actual, 'route anchor must be measurable');
  assert.ok(Math.hypot(flightDom.actual.x - flightDom.expected.x,
    flightDom.actual.y - flightDom.expected.y) < 0.12, 'airplane center must stay on route');
  await page.screenshot({ path: path.join(out, 'cinematic-aircraft.png') });
  await page.evaluate(ms => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(ms), phase.arrivalMs);
  await page.locator('.cg-arrival-place').getByText('Los Angeles').waitFor({ timeout: 5000 });
  assert.equal(await page.locator('.cg-arrival-label').count(), 1,
    'arrival is a small map-anchored label, not a full-screen popup');
  assert.equal(await page.getByText('TOUCHDOWN').count(), 0,
    'large touchdown title must be absent');
  await page.screenshot({ path: path.join(out, 'cinematic-touchdown.png') });

  // The aircraft transform is updated on every exact seek, not only at GeoJSON cadence.
  const continuity = await page.evaluate(() => {
    const api = window.__CINEMATIC_GLOBEHOPPERS__;
    const firstLegEnd = (() => {
      for (let t = 0; t < api.durationMs; t += 20) {
        const current = api.getPresentationAtMs(t);
        const after = api.getPresentationAtMs(t + 20);
        if (current.plane?.legIndex === 0 && !after.plane) return t;
      }
      return -1;
    })();
    if (firstLegEnd < 0) return { valid: false };
    const pitches = [];
    const alignmentErrors = [];
    const rotations = [];
    for (let ms = firstLegEnd - 400; ms < firstLegEnd - 50; ms += 16.666) {
      const plane = api.getPresentationAtMs(ms).plane;
      api.seekMs(ms);
      const root = document.querySelector('.cg-aircraft');
      const rootBounds = root?.getBoundingClientRect();
    const actorBounds = document.querySelector('.cg-actors')?.getBoundingClientRect();
      const expected = api.projectAircraftAtMs(ms);
      pitches.push(plane?.pitchDegrees);
      rotations.push(document.querySelector('.cg-aircraft-img')?.style.transform);
      alignmentErrors.push(expected && rootBounds && actorBounds
        ? Math.hypot(rootBounds.left - actorBounds.left - expected.x,
          rootBounds.top - actorBounds.top - expected.y)
        : Infinity);
    }
    return { valid: pitches.length > 10 && pitches.every(Number.isFinite) &&
      pitches.at(-1) > pitches[0] && rotations.every(Boolean) &&
      alignmentErrors.every(error => error < 0.12),
      samples: pitches.length, maxAlignmentPx: Math.max(...alignmentErrors) };
  });
  assert.ok(continuity.valid, 'aircraft pitch and route anchor must stay smooth in approach: ' + JSON.stringify(continuity));



  await page.goto(root + '?demo=1&capture=1&map=hybrid', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__CINEMATIC_GLOBEHOPPERS__,
    null, { timeout: 15000 });
  assert.equal(await page.locator('.cg-console').count(), 0, 'capture mode must hide playback UI');
  assert.equal(await page.locator('.cg-map-selector').count(), 0,
    'capture mode hides globe appearance controls');
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__.getMapDetails()?.preset === 'hybrid');

  await page.evaluate(() => window.__CINEMATIC_GLOBEHOPPERS__.seekMs(13000));
  assert.equal(await page.locator('.cg-actors').count(), 1,
    'cinematic actors remain available for headless video capture');

  // WP3: production-like history mode streams all trips without compiling them all.
  await page.goto(root+'?map=earth',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() =>
    window.__CINEMATIC_GLOBEHOPPERS__?.getState().ready === true,
    null,{timeout:50000});
  const history = await page.evaluate(()=>{
    const api=window.__CINEMATIC_GLOBEHOPPERS__;
    const initial=api.getPlaylistDetails();
    const atStart=api.sampleAtMs(0);
    const early=api.getPresentationAtMs(0);
    api.seekMs(api.durationMs*.73);
    const later=api.getPlaylistDetails();
    const laterPresentation=api.getPresentationAtMs(api.durationMs*.73);
    return {initial,later,durationMs:api.durationMs,
      tripCount:api.tripCount,legCount:api.legCount,
      atStart,early,laterPresentation,now:api.getState()};
  });
  assert.equal(history.tripCount,178);
  assert.ok(history.initial.reviewedSurfaceLegs>=65,
    'full history must load the reviewed v9 surface-route geometry before starting');
  assert.ok(history.legCount>=385);
  assert.ok(history.durationMs>30*60*1000);
  assert.ok(history.initial.cachedScenes<=3&&history.later.cachedScenes<=3);
  assert.ok(history.later.builds<20,'random seek should not compile the full history');
  assert.equal(history.early.historyTripCount,0);
  assert.equal(history.early.historyRouteCount,0);
  assert.ok(history.laterPresentation.historyTripCount>=115,
    'history should accumulate completed trips');
  assert.ok(history.laterPresentation.historyRouteCount>=240,
    'earlier travel lines should persist across trip transitions');
  assert.ok(history.laterPresentation.historyStopCount>=35,
    'earlier destinations should persist as map markers');
  assert.ok(history.now.elapsedMs>history.durationMs*.72);
  await page.screenshot({path:path.join(out,'cinematic-full-history.png')});

  assert.deepEqual(unexpectedHosts, [], 'unexpected Mult.dev requests');
  assert.deepEqual(runtimeErrors, [], 'browser runtime exceptions');
  console.log(JSON.stringify({ status: 'PASS', meta, screenshots: out }, null, 2));
} catch (error) {
  console.error('Cinematic browser smoke failed:', error);
  console.error('Browser errors:', runtimeErrors);
  await page.screenshot({ path: path.join(out, 'cinematic-failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
