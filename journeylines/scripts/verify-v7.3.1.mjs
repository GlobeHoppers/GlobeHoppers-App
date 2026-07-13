import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { stableRoutePrefix } from '../src/utils/routePresentation.js';
import { requestValhallaDrivingRoute } from '../src/utils/valhallaRouting.js';

const root = path.resolve(process.argv[2] || '.');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let passed = 0;
function check(condition, message) { assert.ok(condition, message); passed += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); passed += 1; }

const app = read('src/App.jsx');
const map = read('src/components/TravelMap.jsx');
const controls = read('src/components/PlaybackControls.jsx');
const routePresentation = read('src/utils/routePresentation.js');
const vesselIcons = read('src/utils/vesselIcons.js');
const valhalla = read('src/utils/valhallaRouting.js');
const css = read('src/styles.css');
const packageJson = JSON.parse(read('package.json'));

check(packageJson.version === '7.3.1', 'package version is 7.3.1');
check(packageJson.scripts?.['verify:v7.3.1']?.includes('verify-v7.3.1.mjs'), 'v7.3.1 verifier is registered');

// A growing trail must never recalculate previously laid vertices.
const sourceRoute = [[0, 0], [1, 0], [1, 1], [2, 1]];
const halfway = stableRoutePrefix(sourceRoute, 0.5);
equal(halfway[0], sourceRoute[0], 'stable prefix retains the exact origin');
equal(halfway[1], sourceRoute[1], 'stable prefix retains every completed source vertex');
check(Math.abs(halfway.at(-1)[0] - 1) < 1e-9 && Math.abs(halfway.at(-1)[1] - 0.5) < 0.001, 'stable prefix interpolates only the current frontier');
check(halfway[0] === sourceRoute[0] && halfway[1] === sourceRoute[1], 'completed vertices keep stable references');
equal(stableRoutePrefix(sourceRoute, 1), sourceRoute, 'complete progress returns the canonical presentation route');
const dateLine = stableRoutePrefix([[179, 10], [-179, 10]], 0.5);
check(Math.abs(Math.abs(dateLine.at(-1)[0]) - 180) < 1e-9, 'stable prefix follows the short path across the date line');

// Reproduce the browser Illegal invocation failure with a receiver-sensitive fetch.
let boundFetchCalls = 0;
function receiverSensitiveFetch(url) {
  assert.equal(this, globalThis, 'fetch keeps the Window/global receiver');
  boundFetchCalls += 1;
  const payload = JSON.parse(new URL(url).searchParams.get('json'));
  const [from, to] = payload.locations;
  const shape = encodePolyline6([[from.lon, from.lat], [to.lon, to.lat]]);
  return Promise.resolve(response(200, JSON.stringify({
    trip: { status: 0, summary: { length: 10, time: 600 }, legs: [{ shape }] }
  })));
}
const routed = await requestValhallaDrivingRoute({
  id: 'binding-check',
  legId: 'binding-check',
  from: { id: 'a', name: 'A', lon: -117.16, lat: 32.72 },
  to: { id: 'b', name: 'B', lon: -116.9, lat: 33.0 }
}, { endpoints: ['https://valhalla.test'], fetchImpl: receiverSensitiveFetch, timeoutMs: 5000 });
check(boundFetchCalls === 1, 'Valhalla fetch executes once with a valid receiver');
check(routed.geometry.length >= 2, 'receiver-safe Valhalla request returns usable geometry');
check(valhalla.includes('Reflect.apply(rawFetch, globalThis, args)'), 'Valhalla wraps native fetch with its required receiver');

// Timeline visibility and density regression.
check(controls.includes('markers.length < 220'), 'individual timeline pins remain visible for the current history size');
check(css.includes('min-height: 38px') && css.includes('padding-top: 24px'), 'timeline reserves an internal pin gutter');
check(css.includes('.timeline-scroll-viewport.is-zoomed') && css.includes('padding-top: 40px'), 'zoomed timeline preserves pin headroom inside its scrollport');
check(css.includes('.timeline-marker,\n.timeline-marker--cluster') && css.includes('visibility: visible !important'), 'timeline pins cannot be hidden by legacy rules');

// Paused manual camera ownership.
check(map.includes("map.on('movestart', claimManualCamera)"), 'manual camera ownership begins at the first map movement');
check(map.includes('try { map.stop(); } catch {}') && map.includes('userCameraOverrideRef.current = true'), 'manual input stops stale cinematic easing before latching ownership');
check(map.includes('manualSpinPauseRef.current = true'), 'manual camera input suspends automatic spin while dragging');

// Pulse ownership.
check(map.includes("'circle-radius': 0") && map.includes("'circle-opacity': 0"), 'legacy MapLibre pulse layer is inert');
check(map.includes("map.getSource('arrival-pulse')?.setData(emptyCollection())"), 'legacy pulse source is always cleared');
check(css.includes('.jl-arrival-ripple.is-active') && css.includes('visibility: hidden !important'), 'DOM arrival pulse is visible only in explicit active state');
check(!css.includes(".jl-arrival-ripple {\n  opacity: .55 !important;"), 'legacy always-visible pulse opacity is removed');

// Surface route and immutable trail ownership.
check(map.includes('!isSurfaceRouteMode(leg.mode)'), 'surface vehicles do not use sparse worker playback samples');
check(map.includes('const fullRoute = routeCoordinates(leg, 1'), 'stacked route is calculated from the complete presentation path');
check(map.includes('return stableRoutePrefix(fullStacked, progress)'), 'active stacked trail reveals an immutable prefix');
check(map.includes('return stableRoutePrefix(routed, progress)'), 'normal active trail also reveals an immutable prefix');
check(routePresentation.includes('current frontier point is interpolated'), 'stable route-prefix invariant is documented in the utility');

// Cars should adhere closely to road turns instead of floating through them.
check(map.includes("iconMode === 'car' ? 0.90"), 'car heading reacts promptly to road turns');
check(map.includes("normalized === 'drive' || normalized === 'car'"), 'car tangent window uses a close road-following sample');
check(map.includes("const isSurface = mode === 'drive' || mode === 'car'"), 'car aliases share surface trail timing');

// Travel-mode horizon culling and MapLibre occlusion must agree.
check(map.includes('cameraSubpointCoordinate(map)'), 'horizon ownership uses the actual camera subpoint');
check(map.includes("freeCamera?.position?.toLngLat?.()"), 'camera subpoint uses the public free-camera position');
check(map.includes("el.style.removeProperty('opacity')"), 'runtime no longer overwrites MapLibre marker occlusion with opacity 1');
check(css.includes(".maplibregl-marker.jl-map-pin[aria-hidden='true']"), 'culled travel-mode placards have a CSS backstop');

// Correct trip color must appear from the first visible vessel frame.
check(vesselIcons.includes('peekRecoloredVesselIconUrl'), 'vessel icon cache supports a non-blue peek');
check(map.includes('peekRecoloredVesselIconUrl(iconMode, color)'), 'overlay checks for the exact recolored asset');
check(map.includes('vehicleSvg(iconMode)'), 'uncached colored trips use an immediate currentColor silhouette');
check(map.includes("mode === 'drive' || mode === 'car'"), 'car silhouette supports both mode aliases');
check(map.includes('primeRecoloredVesselIcon(iconMode, color).then'), 'exact colored PNG replaces the temporary silhouette asynchronously');

// Destination-choice cards retain Hopper queue visuals.
check(app.includes("'--queue-border': row.borderGradient"), 'destination cards receive segmented Hopper borders');
check(app.includes("'--queue-marker': row.markerBackground"), 'destination cards receive queue marker colors');
check(css.includes('var(--queue-border') && css.includes('var(--queue-marker'), 'destination queue renders the supplied segmented colors');

check(fs.existsSync(path.join(root, 'QA/QA-v7.3.1.md')), 'v7.3.1 QA record is under journeylines/QA');
check(!fs.existsSync(path.join(root, '..', 'QA-v7.3.1.md')), 'v7.3.1 QA record is not duplicated at repository root');

const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  cwd: root,
  encoding: 'utf8',
  stdio: 'pipe'
});
if (build.status !== 0) {
  process.stderr.write(build.stdout || '');
  process.stderr.write(build.stderr || '');
  throw new Error('FAIL: production build');
}
check(fs.existsSync(path.join(root, 'dist/index.html')), 'production build output exists');

console.log(`GlobeHoppers v7.3.1 verification passed: ${passed} checks.`);

function response(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    async text() { return text; }
  };
}

function encodePolyline6(coordinates) {
  let previousLat = 0;
  let previousLon = 0;
  let result = '';
  for (const [lon, lat] of coordinates) {
    const currentLat = Math.round(lat * 1e6);
    const currentLon = Math.round(lon * 1e6);
    result += encodeSigned(currentLat - previousLat);
    result += encodeSigned(currentLon - previousLon);
    previousLat = currentLat;
    previousLon = currentLon;
  }
  return result;
}

function encodeSigned(value) {
  let shifted = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (shifted >= 0x20) {
    encoded += String.fromCharCode((0x20 | (shifted & 0x1f)) + 63);
    shifted >>= 5;
  }
  return encoded + String.fromCharCode(shifted + 63);
}
