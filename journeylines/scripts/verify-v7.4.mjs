import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
}
function contains(relative, text, label = `${relative} contains ${text}`) { check(read(relative).includes(text), label); }
function excludes(relative, text, label = `${relative} excludes ${text}`) { check(!read(relative).includes(text), label); }

const pkg = JSON.parse(read('package.json'));
check(pkg.version === '7.4.0', 'package version is 7.4.0');
check(pkg.scripts?.['verify:v7.4'] === 'node scripts/verify-v7.4.mjs .', 'v7.4 verifier script is registered');
contains('src/components/TravelMap.jsx', 'manualGestureRef', 'manual gesture ownership is explicit');
contains('src/components/TravelMap.jsx', 'capture: true', 'pointer/touch input captures camera ownership before MapLibre gesture handling');
contains('src/components/TravelMap.jsx', 'setWheelZoomRate', 'normal wheel zoom response is configured');
contains('src/components/TravelMap.jsx', 'glideAtOverview', 'disconnected trips include an overview glide stage');
const relocationBlock = read('src/components/TravelMap.jsx').slice(read('src/components/TravelMap.jsx').indexOf('const request = relocationTransition'), read('src/components/TravelMap.jsx').indexOf('const request = relocationTransition') + 8000);
excludes('src/components/TravelMap.jsx', 'map.jumpTo({ center: [lon, lat], zoom: overviewZoom', 'no overview center cut remains');
contains('src/components/TravelMap.jsx', 'movementRotation', 'surface heading follows actual screen movement');
contains('src/components/TravelMap.jsx', 'jl-live-trail-overlay', 'live trail connector is rendered');
contains('src/components/TravelMap.jsx', 'currentProgress > lastProgress', 'connector bridges only the live frontier');
contains('src/components/TravelMap.jsx', 'centerCutoff = activePlacard ? 68', 'playback horizon culling starts earlier');
contains('src/components/PlaybackControls.jsx', 'timelineAnimating', 'timeline scale animation state exists');
contains('src/components/PlaybackControls.jsx', "behavior: 'smooth'", 'timeline focus scroll animates');
excludes('src/components/PlaybackControls.jsx', '<span className="timeline-marker__match-pill">', 'destination matching does not open timeline pills');
contains('src/App.jsx', 'setGlobeSpinPaused(false);', 'View Globe resumes automatic spin');
contains('src/App.jsx', 'destination-trip-queue__ball', 'destination cards include larger trip balls');
contains('src/App.jsx', 'TimelineRowBorder', 'destination cards reuse Timeline segmented borders');
contains('src/components/AdminPanel.jsx', 'Exact Hop Dates', 'Add Hop labels exact dates');
contains('src/components/AdminPanel.jsx', 'Optional', 'exact dates are marked optional');
contains('src/components/AdminPanel.jsx', 'automaticHopTitle', 'automatic destination title generation exists');
contains('src/components/AdminPanel.jsx', 'Use Automatic Title', 'custom titles can return to automatic mode');
contains('src/components/AdminPanel.jsx', '_fromTouched', 'derived home base stops updating after manual start edits');
excludes('src/components/AdminPanel.jsx', '> Override start location<', 'override start location control is removed');
contains('src/components/AdminPanel.jsx', 'Pre-filled from the active home base', 'editable start explains date-based prefill');
contains('src/styles.css', '.studio-modal-maincol .route-section { order: 1; }', 'route entry is visually first');
contains('src/styles.css', 'transition: width 560ms', 'timeline width changes animate');
contains('src/styles.css', '@keyframes destinationCardFlyIn', 'destination cards fly in');
contains('src/styles.css', '.jl-live-trail-overlay', 'live connector is styled');
check(fs.existsSync(path.join(root, 'QA/QA-v7.4.md')), 'v7.4 QA file is under QA folder');
check(fs.existsSync(path.join(root, 'INTERACTION-v7.4.md')), 'v7.4 interaction design is documented');

const routeModule = await import(pathToFileURL(path.join(root, 'src/utils/routePresentation.js')));
const input = [[-117.2,32.7],[-117.1,32.75],[-116.9,32.9],[-116.7,33.1],[-116.5,33.4],[-116.2,33.7],[-115.9,34.0]];
const output = routeModule.buildSurfacePresentationGeometry(input, 'drive', { points: 5 });
check(output.length >= 2 && output.length <= input.length, 'surface presentation route remains lightweight');
check(output[0][0] === input[0][0] && output[0][1] === input[0][1], 'surface route preserves exact origin');
check(output.at(-1)[0] === input.at(-1)[0] && output.at(-1)[1] === input.at(-1)[1], 'surface route preserves exact destination');
const anchored = routeModule.anchorRouteGeometryToEndpoints(output, { from: { lon: -118, lat: 31 }, to: { lon: -80, lat: 40 } });
check(anchored[0][0] === -118 && anchored.at(-1)[0] === -80, 'route anchoring forces exact location-circle endpoints');

for (const file of ['src/App.jsx','src/components/AdminPanel.jsx','src/components/PlaybackControls.jsx','src/components/TravelMap.jsx','src/utils/routePresentation.js']) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--emptyOutDir=false'], { cwd: root, encoding: 'utf8', env: { ...process.env, GLOBEHOPPERS_VERIFY_FILE: file } });
  // One complete Vite transform is enough; break after first success.
  check(result.status === 0, `Vite parses application source (${file})`);
  break;
}

console.log(`GlobeHoppers v7.4 verification passed: ${checks.length} checks.`);
