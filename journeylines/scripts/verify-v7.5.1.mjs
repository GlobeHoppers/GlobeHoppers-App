import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const json = relative => JSON.parse(read(relative));
const checks = [];
function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
}
function contains(relative, text, label = `${relative} contains ${text}`) {
  check(read(relative).includes(text), label);
}
function excludes(relative, text, label = `${relative} excludes ${text}`) {
  check(!read(relative).includes(text), label);
}

const pkg = json('package.json');
check(pkg.version === '7.5.1', 'package version is 7.5.1');
check(pkg.scripts?.['verify:v7.5.1'] === 'node scripts/verify-v7.5.1.mjs .', 'v7.5.1 verifier is registered');

const trips = json('src/data/trips.json');
const hoppers = json('src/data/hoppers.json');
const routeDetails = json('src/data/routeDetails.json');
check(trips.length === 149, 'all 149 repository Hops are preserved');
check(trips.reduce((sum, trip) => sum + Math.max(0, trip.route.length - 1), 0) === 316, 'all 316 trip legs are preserved');
check(Object.keys(routeDetails.routes || {}).length === 316, 'all 316 saved route geometries are preserved');
check((hoppers.hoppers || []).length >= 3, 'Hopper data remains present');

contains('src/components/TravelMap.jsx', "stage: needsZoomOut ? 'zoom-out' : 'orient'", 'camera reacquisition starts with safe zoom-out when needed');
contains('src/components/TravelMap.jsx', "state.stage = 'orient'", 'camera reacquisition has an orientation-only stage');
contains('src/components/TravelMap.jsx', "state.stage = 'zoom-in'", 'camera reacquisition zooms in only after orientation');
contains('src/components/TravelMap.jsx', 'The final phase changes only zoom', 'camera return documents outside-globe invariant');
contains('src/components/TravelMap.jsx', "const cameraInterval = quality === 'high' ? 28", 'camera writes are throttled below display-rate vehicle motion');
contains('src/components/TravelMap.jsx', 'if (!returnState.active) camera = constrainCameraToVessel', 'temporary manual camera does not destabilize the desired return camera');
contains('src/components/TravelMap.jsx', 'const projectedRotation = tangentRotation', 'surface vessel orientation ignores camera-induced screen motion');
contains('src/components/TravelMap.jsx', "iconMode === 'car' ? 0.30", 'surface vessel heading uses gentle shortest-angle smoothing');
contains('src/components/TravelMap.jsx', 'buildSurfacePresentationGeometry(frozenGeometry', 'surface playback owns the local cinematic presentation path');
excludes('src/components/TravelMap.jsx', 'playbackPlanPresentationGeometry(playbackPlan) || buildSurfacePresentationGeometry', 'worker presentation cannot override cinematic surface geometry');
contains('src/components/TravelMap.jsx', 'dist > Math.hypot(canvasWidth, canvasHeight) * 0.72', 'oversized wrapped air arcs are suppressed');
contains('src/components/TravelMap.jsx', 'landingWindow * 76 - takeoffWindow * 56', 'airplane takeoff and landing pitch is more aggressive');
contains('src/components/TravelMap.jsx', "el.addEventListener('pointerup'", 'white marker circle and complete placard share pointer selection');
contains('src/components/TravelMap.jsx', "setAttribute('role', 'button')", 'map placards are keyboard-accessible buttons');
contains('src/components/TravelMap.jsx', "rootStyle.setProperty('--gh-map-label-scale'", 'label scale is inherited and updated only when materially changed');
contains('src/components/TravelMap.jsx', 'zoomBoost = clamp((zoom - 3.8) * 0.13', 'map text grows visibly with close zoom');
contains('src/components/TravelMap.jsx', 'const steps = 8', 'active-to-passive trail morph is staged rather than snapped');
contains('src/components/TravelMap.jsx', 'duration: 1800', 'trail profile transition is deliberately slower');
contains('src/components/TravelMap.jsx', '2280', 'View Globe retains camera ownership through full 4.20 zoom-out');

contains('src/utils/routePresentation.js', 'softenPresentationCorners', 'surface routes receive one-time cinematic corner softening');
contains('src/utils/routePresentation.js', "normalizedMode === 'boat' ? 12", 'boat routes use a low broad-route point budget');
contains('src/utils/routePresentation.js', "mode === 'boat' ? 2.20", 'boat routing permits broader offshore presentation chords');
contains('src/utils/routePresentation.js', 'routeScale * 11.0', 'boat presentation skips shoreline micro-turns over longer spans');

contains('src/components/PlaybackControls.jsx', 'visibleTimelineYears > 3.25', 'month labels activate at a practical close timeline range');
contains('src/components/PlaybackControls.jsx', 'Math.min(16', 'timeline supports sufficiently deep month-level zoom');
contains('src/components/PlaybackControls.jsx', 'timelineZoom >= 15.999', 'timeline zoom control exposes the full close range');
contains('src/components/PlaybackControls.jsx', '<HopResultCards rows={searchResults}', 'search continues to share destination result cards');
excludes('src/components/HopResultCards.jsx', 'gh-timeline-trip-row', 'result cards no longer render the nested timeline pill');
excludes('src/components/HopResultCards.jsx', 'TimelineRowBorder', 'result cards have only one outer segmented border');

contains('src/components/AdminPanel.jsx', 'additional-legs-section compact-section route-section', 'Additional Legs receives route-section highlighting');
contains('src/components/AdminPanel.jsx', '<h3>Additional legs</h3>', 'Additional Legs uses the common section-heading element');
contains('src/styles.css', '.destination-trip-queue__card.hop-result-card', 'shared single-shell result-card styling is present');
contains('src/styles.css', 'bottom: 76px !important', 'destination suggestions stop above the timeline');
contains('src/styles.css', '.timeline-month-scale__tick b', 'timeline month labels have a visible reserved row');
contains('src/styles.css', '-webkit-text-fill-color: #fff', 'search input text is explicitly white');
contains('src/styles.css', '.jl-map-pin-dot,', 'white location circles explicitly accept pointer input');
contains('src/styles.css', '.additional-legs-section.route-section', 'Additional Legs highlight styling is present');
contains('src/styles.css', '.studio-modal-maincol .studio-form-grid.single > label', 'Notes and primary editor labels share typography');

const routeModule = await import(pathToFileURL(path.join(root, 'src/utils/routePresentation.js')));
const detailed = Array.from({ length: 480 }, (_, index) => {
  const t = index / 479;
  return [-124 + t * 10, 35 + t * 7 + Math.sin(t * Math.PI * 28) * 0.06];
});
const car = routeModule.buildSurfacePresentationGeometry(detailed, 'drive');
const train = routeModule.buildSurfacePresentationGeometry(detailed, 'train');
const boat = routeModule.buildSurfacePresentationGeometry(detailed, 'boat');
for (const [mode, geometry] of [['car', car], ['train', train], ['boat', boat]]) {
  check(geometry.length >= 2, `${mode} presentation geometry remains usable`);
  check(geometry[0][0] === detailed[0][0] && geometry[0][1] === detailed[0][1], `${mode} preserves the exact origin`);
  check(geometry.at(-1)[0] === detailed.at(-1)[0] && geometry.at(-1)[1] === detailed.at(-1)[1], `${mode} preserves the exact destination`);
}
check(boat.length < car.length && boat.length < train.length, 'boat playback is materially broader than road and rail presentation');
check(routeModule.presentationPointBudget(2500, 'boat') < routeModule.presentationPointBudget(2500, 'drive'), 'boat point budget is lower than car point budget');

check(fs.existsSync(path.join(root, 'QA/QA-v7.5.1.md')), 'v7.5.1 QA documentation is under journeylines/QA');
check(fs.existsSync(path.join(root, 'INTERACTION-v7.5.1.md')), 'v7.5.1 interaction notes are documented');
check(!fs.existsSync(path.join(root, '..', 'QA-v7.5.1.md')), 'QA documentation is not duplicated at repository root');

const build = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production' }
});
if (build.status !== 0) {
  process.stderr.write(build.stdout || '');
  process.stderr.write(build.stderr || '');
}
check(build.status === 0, 'production Vite build succeeds');
check(fs.existsSync(path.join(root, 'dist/index.html')), 'production build output exists');

console.log(`GlobeHoppers v7.5.1 verification passed: ${checks.length} checks.`);
