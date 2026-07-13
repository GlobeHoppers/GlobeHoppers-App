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
check(pkg.version === '7.5.0', 'package version is 7.5.0');
check(pkg.scripts?.['verify:v7.5'] === 'node scripts/verify-v7.5.mjs .', 'v7.5 verifier is registered');

const trips = json('src/data/trips.json');
const hoppers = json('src/data/hoppers.json');
const routeDetails = json('src/data/routeDetails.json');
check(trips.length === 149, 'all 149 repository Hops are present');
check(trips.every(trip => Array.isArray(trip.route) && trip.route.length >= 2), 'every Hop has a usable route chain');
check(trips.reduce((sum, trip) => sum + Math.max(0, trip.route.length - 1), 0) === 316, 'trip routes retain all 316 legs');
check(Object.keys(routeDetails.routes || {}).length === 316, 'routeDetails retains all 316 leg geometries');
check((hoppers.hoppers || []).length >= 3 && (hoppers.palette || []).length >= 10, 'Hopper and palette data are present');

contains('src/components/TravelMap.jsx', 'playbackCameraReturnRef', 'playback camera-return state exists');
contains('src/components/TravelMap.jsx', '}, 500);', 'playback camera waits before returning');
contains('src/components/TravelMap.jsx', 'duration: 1250', 'playback camera uses a smooth 1.25 second return');
contains('src/components/TravelMap.jsx', 'latestDesiredCameraRef.current = camera', 'return targets the live vessel camera');
contains('src/components/TravelMap.jsx', 'for (const method of methods)', 'all direct-map interaction methods are managed together');
contains('src/components/TravelMap.jsx', 'try { method.enable(); }', 'map interaction remains enabled during playback');
excludes('src/components/TravelMap.jsx', 'isPlaying ? method.disable()', 'playback no longer disables direct manipulation');
contains('src/components/TravelMap.jsx', 'Programmatic easeTo/jumpTo events must not latch the spin', 'programmatic globe motion cannot leave spin paused');
contains('src/components/TravelMap.jsx', 'autoLevelGlobeCamera(current || {}, { zoom: preservedZoom })', 'auto-level explicitly preserves zoom');
contains('src/components/TravelMap.jsx', "setProperty('--gh-map-ui-scale'", 'map UI sizing responds to viewport and zoom');
contains('src/components/TravelMap.jsx', "setProperty('--gh-map-label-scale'", 'city labels respond to viewport and zoom');
contains('src/components/TravelMap.jsx', 'centerCutoff = activePlacard ? 62', 'playback horizon culling is more aggressive');
contains('src/components/TravelMap.jsx', 'return Math.round((landingWindow * 48 - takeoffWindow * 28)', 'aircraft have takeoff and landing pitch');
contains('src/components/TravelMap.jsx', 'lerp(1, 0.78', 'aircraft retain readable arrival scale');
contains('src/components/TravelMap.jsx', "el.addEventListener('click'", 'map placards are clickable');

contains('src/App.jsx', 'destinationSelectionEnabled={!isRelocating && !admin}', 'destination selection stays enabled during playback');
contains('src/App.jsx', 'buildTimelineMonthTicks', 'timeline month placement is derived from dated pins');
contains('src/App.jsx', 'buildTimelineYearSpan', 'timeline visible-year calculation is supported');
contains('src/App.jsx', 'searchRows={tripTimeline}', 'timeline search indexes all Hop rows');
contains('src/components/PlaybackControls.jsx', "import { Search } from 'lucide-react'", 'timeline uses a search icon');
contains('src/components/PlaybackControls.jsx', 'query.length < 2', 'search waits for two characters');
contains('src/components/PlaybackControls.jsx', 'setDebouncedSearchText(searchText), 120)', 'search uses a short 120 ms debounce');
contains('src/components/PlaybackControls.jsx', 'visibleTimelineYears > 2.15', 'month labels appear only at close timeline zoom');
contains('src/components/PlaybackControls.jsx', '<HopResultCards rows={searchResults}', 'search reuses destination result cards');
excludes('src/components/PlaybackControls.jsx', '<span>Timeline</span>', 'Timeline text label is removed');
check(fs.existsSync(path.join(root, 'src/components/HopResultCards.jsx')), 'shared compact Hop result cards exist');

contains('src/components/AdminPanel.jsx', 'additional-legs-section', 'Additional legs has a dedicated editor section');
contains('src/components/AdminPanel.jsx', 'if (!names.length) return `New Trip ${year}`', 'blank Hops use New Trip plus the current year');
contains('src/components/AdminPanel.jsx', 'const date = [monthLabel(draft.month), year]', 'destination titles omit an unselected month');
contains('src/styles.css', '.studio-modal-maincol .additional-legs-section { order: 4; }', 'Additional legs sits above Notes');
contains('src/styles.css', 'grid-template-columns: 17px minmax(0, 1fr)', 'result cards reserve almost all width for text');
contains('src/styles.css', '.destination-trip-queue__card::before { display: none', 'duplicate upper-right result circle is removed');
contains('src/styles.css', '.jl-map-pin::before', 'map placards have a larger invisible hit target');
contains('src/styles.css', '.timeline-search-panel', 'timeline search panel is styled');
contains('src/styles.css', '.timeline-month-scale', 'timeline month scale is styled');

const globeModule = await import(pathToFileURL(path.join(root, 'src/utils/globeInteraction.js')));
const leveled = globeModule.autoLevelGlobeCamera({ center: [202, 48], zoom: 4.2, pitch: 66, bearing: 31 });
check(leveled.zoom === 4.2, 'auto-level preserves camera zoom 4.20');
check(leveled.pitch === 0 && leveled.bearing === 0, 'auto-level corrects pitch and bearing only');
check(leveled.center[0] === -158 && leveled.center[1] === 34, 'auto-level preserves longitude and safely clamps latitude');
const requestedZoom = globeModule.autoLevelGlobeCamera({ center: [12, 8], zoom: 0.65 }, { zoom: 5.1 });
check(requestedZoom.zoom === 5.1, 'explicit zoom wins during auto-level');

const timingModule = await import(pathToFileURL(path.join(root, 'src/utils/routeTiming.js')));
const plane = timingModule.legDurationMs(2500, 1, 'plane') / 1000;
const drive = timingModule.legDurationMs(2500, 1, 'drive') / 1000;
const train = timingModule.legDurationMs(2500, 1, 'train') / 1000;
const boat = timingModule.legDurationMs(2500, 1, 'boat') / 1000;
check(plane >= 22 && plane <= 32, 'cross-country plane playback remains cinematic');
check(drive >= 45 && drive <= 56, 'cross-country car playback is about 50 seconds');
check(train > drive && boat > train, 'train and boat long trips retain progressively slower pacing');

const routeModule = await import(pathToFileURL(path.join(root, 'src/utils/routePresentation.js')));
const coast = Array.from({ length: 240 }, (_, index) => {
  const t = index / 239;
  return [-123 + t * 8, 36 + t * 8 + Math.sin(t * Math.PI * 18) * 0.045];
});
const marine = routeModule.buildSurfacePresentationGeometry(coast, 'boat');
check(marine.length >= 2 && marine.length <= 100, 'boat presentation uses a broad bounded route');
check(marine[0][0] === coast[0][0] && marine[0][1] === coast[0][1], 'boat route preserves exact origin');
check(marine.at(-1)[0] === coast.at(-1)[0] && marine.at(-1)[1] === coast.at(-1)[1], 'boat route preserves exact destination');
check(routeModule.presentationPointBudget(2500, 'boat') < routeModule.presentationPointBudget(2500, 'train'), 'boats use fewer presentation anchors than trains');

check(fs.existsSync(path.join(root, 'QA/QA-v7.5.md')), 'v7.5 QA documentation is under journeylines/QA');
check(fs.existsSync(path.join(root, 'INTERACTION-v7.5.md')), 'v7.5 interaction model is documented');
check(!fs.existsSync(path.join(root, '..', 'QA-v7.5.md')), 'v7.5 QA documentation is not duplicated at repository root');

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

console.log(`GlobeHoppers v7.5 verification passed: ${checks.length} checks.`);
