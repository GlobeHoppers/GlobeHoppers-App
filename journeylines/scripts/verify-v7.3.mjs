import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { anchorRouteGeometryToEndpoints } from '../src/utils/routePresentation.js';
import { applyVesselSpriteOffset, vesselSpriteRotationOffset } from '../src/utils/vehicleOrientation.js';
import {
  autoLevelGlobeCamera,
  clampGlobeSpinSpeed,
  DEFAULT_GLOBE_SPIN_SPEED,
  locationIdsVisitedByTrip,
  shouldEnterIdleMode
} from '../src/utils/globeInteraction.js';
import {
  isValhallaMaxDistanceError,
  requestValhallaDrivingRoute
} from '../src/utils/valhallaRouting.js';

const root = path.resolve(process.argv[2] || '.');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let passed = 0;
function check(condition, message) { assert.ok(condition, message); passed += 1; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); passed += 1; }

const app = read('src/App.jsx');
const map = read('src/components/TravelMap.jsx');
const controls = read('src/components/PlaybackControls.jsx');
const admin = read('src/components/AdminPanel.jsx');
const css = read('src/styles.css');
const packageJson = JSON.parse(read('package.json'));

check(packageJson.version === '7.3.0', 'package version is 7.3.0');
check(packageJson.scripts?.['verify:v7.3']?.includes('verify-v7.3.mjs'), 'v7.3 verifier script is registered');

// Route endpoints are presentation invariants.
const leg = { from: { lon: -117.16, lat: 32.72 }, to: { lon: -87.63, lat: 41.88 } };
const anchored = anchorRouteGeometryToEndpoints([[-117.0, 32.9], [-100, 36], [-88, 41.5]], leg);
equal(anchored[0], [-117.16, 32.72], 'presentation route starts at exact origin');
equal(anchored.at(-1), [-87.63, 41.88], 'presentation route ends at exact destination');
check(anchored.length === 3, 'endpoint anchoring does not densify the route');

// Sprite assets use mode-specific authored direction offsets.
check(vesselSpriteRotationOffset('plane') === 0, 'plane asset is nose-up');
check(vesselSpriteRotationOffset('car') === 0, 'car asset is nose-up');
check(vesselSpriteRotationOffset('boat') === 0, 'boat asset is bow-up');
check(vesselSpriteRotationOffset('train') === 180, 'train asset nose offset is corrected');
check(applyVesselSpriteOffset(25, 'train') === -155, 'train offset normalizes through the shortest angle');

// Globe interaction utilities.
check(DEFAULT_GLOBE_SPIN_SPEED <= 0.35, 'default globe spin is deliberately slow');
check(clampGlobeSpinSpeed(99) <= 1.25, 'globe spin has a safe upper bound');
check(clampGlobeSpinSpeed(-1) >= 0.05, 'globe spin has a usable lower bound');
equal(autoLevelGlobeCamera({ center: [42, -83], zoom: 3.2, pitch: 67, bearing: 123 }), {
  center: [42, -34], zoom: 3.2, pitch: 0, bearing: 0
}, 'auto-level preserves longitude and returns an extreme polar view upright');
const visited = locationIdsVisitedByTrip({ toLocationId: 'tokyo', route: [{ locationId: 'san-diego' }, { locationId: 'tokyo' }, { locationId: 'seoul' }] }, [
  { leg: { to: { id: 'tokyo' } } }, { leg: { to: { id: 'seoul' } } }
]);
check(visited.includes('tokyo') && visited.includes('seoul') && !visited.includes('san-diego'), 'destination selection includes destinations and intermediate stops but not the departure');
check(shouldEnterIdleMode({ isPlaying: false, isRelocating: false, adminOpen: false, destinationSelectionActive: false }), 'paused map may enter idle mode');
check(!shouldEnterIdleMode({ isPlaying: true, isRelocating: false, adminOpen: false, destinationSelectionActive: false }), 'active playback never enters idle mode');

// Long Valhalla routes recover from provider error 154 by splitting and stitching.
check(isValhallaMaxDistanceError(new Error('Path distance exceeds the max distance limit: 1500000 meters')), 'Valhalla max-distance text is recognized');
check(isValhallaMaxDistanceError({ valhallaCode: 154 }), 'Valhalla max-distance code is recognized');
let calls = 0;
const mockFetch = async url => {
  calls += 1;
  const parsedUrl = new URL(url);
  const payload = JSON.parse(parsedUrl.searchParams.get('json'));
  const [from, to] = payload.locations;
  if (calls === 1) {
    return response(400, JSON.stringify({ error_code: 154, error: 'Path distance exceeds the max distance limit: 1500000 meters' }));
  }
  const midpoint = { lat: (from.lat + to.lat) / 2, lon: (from.lon + to.lon) / 2 };
  const shape = encodePolyline6([[from.lon, from.lat], [midpoint.lon, midpoint.lat], [to.lon, to.lat]]);
  return response(200, JSON.stringify({
    trip: {
      status: 0,
      summary: { length: 600, time: 36000, has_highway: true },
      legs: [{ shape }]
    }
  }));
};
const longRoute = await requestValhallaDrivingRoute({
  id: 'san-diego-chicago',
  legId: 'san-diego-chicago',
  from: { id: 'san-diego', name: 'San Diego', lon: -117.1611, lat: 32.7157 },
  to: { id: 'chicago', name: 'Chicago', lon: -87.6298, lat: 41.8781 }
}, {
  endpoints: ['https://valhalla.test'],
  fetchImpl: mockFetch,
  timeoutMs: 5000,
  segmentMiles: 650
});
check(longRoute.segmented === true, 'long drive returns a segmented route');
check(longRoute.segmentCount >= 2, 'long drive uses multiple bounded requests');
check(calls >= 3, 'provider receives the failed direct request plus multiple segment requests');
check(longRoute.geometry.length >= 5, 'stitched route contains geometry from each section');
check(longRoute.warnings.some(message => message.includes('divided into')), 'segmentation is disclosed in diagnostics');

// Static ownership and interaction checks.
check(map.includes('projectedHeadingFromScene(map, sceneState)'), 'all vessels use the rendered scene tangent');
check(map.includes('routeBehind: behind') && map.includes('routeAhead: future'), 'scene exposes the exact playback-plan tangent points');
check(map.includes('applyVesselSpriteOffset(projectedRotation, iconMode)'), 'mode-specific sprite offsets are applied after projection');
check(map.includes('anchorRouteGeometryToEndpoints'), 'map route presentation anchors endpoints');
check(map.includes("pulseActive: phase === 'settle'"), 'arrival pulse exists only during settle');
check(!map.includes("pulseActive: phase === 'settle' ||"), 'arrival pulse is not tied to traveling progress');
check(map.includes('updatePulseOverlay(pulseRef.current, destPt'), 'DOM arrival pulse is projected from the destination');
check(map.includes('const landingShrink = smoothstep') && map.includes('(1 - progress) / 0.045'), 'vessel shrink is delayed to the final route window');
check(map.includes('const visibleGlobeCenter = visualGlobeCenterCoordinate(map, w, h);') && map.includes('map.unproject([w / 2, h / 2])'), 'horizon culling uses one visible-canvas-center calculation on pitched globe views');
check(map.includes('angularDistance <= centerCutoff') && map.includes('angularDistance <= horizonCutoff'), 'playback and globe modes enforce hemisphere cutoffs');
check(map.includes('AUTO_LEVEL_DELAY_MS') && map.includes('autoLevelGlobeCamera'), 'dragged globe auto-levels after interaction');
check(map.includes("map.on('mousedown', pauseSpin)") && map.includes('map.stop()'), 'first drag immediately takes camera ownership from auto-spin');
check(map.includes('globehoppers-globe-zoom'), 'globe zoom controls have a map command');
check(map.includes('CONTINUOUS_HANDOFF_RELEASE_MS = 2600'), 'connected long-route framing releases slowly');
check(map.includes("const driftRadius = distance > 1500 ? 0.0025 : 0.0012"), 'arrival hold drift is negligible');
check(map.includes('zoomOutDuration') && map.includes('zoomInAtDestination'), 'disconnected trips retain staged zoom-out/reposition/zoom-in');
check(map.includes('idleCameraRef.current = captureCameraState(map)'), 'idle entry saves the exact camera state');
check(map.includes("idleExitMode === 'restore'"), 'idle exit can restore the saved camera');

check(app.includes('studioTimelineRequestId'), 'Timeline has a dedicated lazy-load request id');
check(app.includes('setStudioAddRequestId(0)') && app.includes('setStudioTimelineRequestId(value => value + 1)'), 'Timeline explicitly clears Add Hop intent');
const topAdd = app.indexOf('topbar-add');
const topHoppers = app.indexOf('topbar-hoppers');
const topTimeline = app.indexOf('>GlobeHopper Timeline</button>');
check(topAdd >= 0 && topHoppers > topAdd && topTimeline > topHoppers, 'top navigation order is Add Hop, Hoppers, GlobeHopper Timeline');
check(app.includes("window.addEventListener('globehoppers-destination-click'"), 'destination markers dispatch into App selection state');
check(app.includes('matches.length === 1') && app.includes('jumpToLeg(matches[0].firstIndex'), 'single matching destination starts directly');
check(app.includes('DestinationTripQueue') && app.includes('destinationMatchIds='), 'multiple destination matches link queue cards and timeline pins');
check(app.includes("cancelDestinationSelection('outside-click')") && app.includes("cancelDestinationSelection('escape')"), 'outside click and Escape restore destination selection state');
check(app.includes('window.setTimeout(enterIdleMode, 30000)'), 'paused/not-started inactivity enters idle mode after 30 seconds');
check(app.includes("exitIdleMode('play')") && app.includes('setIntroLaunching(true)'), 'Resume exits idle through a smooth return to playback');
check(app.includes('setIdleActivityNonce(value => value + 1)'), 'activity reliably reschedules the idle timer');

check(controls.includes('timelineZoom') && controls.includes('changeTimelineZoom'), 'timeline has a horizontal time-scale zoom model');
check(controls.includes('Fit') && controls.includes('Recenter'), 'timeline exposes Fit and Recenter');
check(controls.includes('onPointerMove={moveTimelinePan}') && controls.includes('onWheel='), 'timeline supports drag and wheel navigation');
check(controls.includes('clusterTimelineMarkers') && controls.includes('timeline-marker--cluster'), 'extreme-density timeline clustering is available');
check(controls.includes('timeline-marker__match-pill'), 'all destination-match pins can display open pills');
check(controls.includes('Spin −') && controls.includes('Spin +') && controls.includes('Pause Spin'), 'globe playback controls include speed and pause controls');
check(css.includes('.timeline-scroll-viewport.is-zoomed') && css.includes('overflow-x: auto'), 'zoomed timeline becomes a scrollable canvas');
check(css.includes('.timeline-marker.is-destination-match') && css.includes('.timeline-marker__match-pill'), 'destination-match pins are raised and opened');
check(css.includes('.destination-trip-queue'), 'multi-trip destination queue is styled on the right');

check(admin.includes('initialTimelineRequestId'), 'Studio consumes Timeline independently from Add Hop');
check(admin.includes("activeStageId ? 'Update Current Hop' : 'Done with Hop'"), 'Batch Add uses Update Current Hop wording');
const updateAction = admin.indexOf("activeStageId ? 'Update Current Hop'");
const addAnotherAction = admin.indexOf('＋ Add Another Hop', updateAction);
const saveBatchAction = admin.indexOf('Save Hop Batch', addAnotherAction);
check(updateAction >= 0 && addAnotherAction > updateAction && saveBatchAction > addAnotherAction, 'Batch actions are ordered Update, Add Another, Save Batch');
check(css.includes('.batch-hop-actions'), 'Batch action group has responsive layout');

check(fs.existsSync(path.join(root, 'INTERACTION-v7.3.md')), 'v7.3 interaction architecture document exists');
check(fs.existsSync(path.join(root, 'QA/QA-v7.3.md')), 'v7.3 QA record is under journeylines/QA');
check(!fs.existsSync(path.join(root, '..', 'QA-v7.3.md')), 'v7.3 QA record is not duplicated at repository root');

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

console.log(`GlobeHoppers v7.3 verification passed: ${passed} checks.`);

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
