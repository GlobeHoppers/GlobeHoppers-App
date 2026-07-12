#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function findProject(startPath) {
  const start = path.resolve(startPath || process.cwd());
  const candidates = [
    { repoRoot: start, appRoot: path.join(start, 'journeylines') },
    { repoRoot: path.dirname(start), appRoot: start },
    { repoRoot: start, appRoot: start },
  ];
  for (const candidate of candidates) {
    const required = {
      app: path.join(candidate.appRoot, 'src', 'App.jsx'),
      controls: path.join(candidate.appRoot, 'src', 'components', 'PlaybackControls.jsx'),
      travelMap: path.join(candidate.appRoot, 'src', 'components', 'TravelMap.jsx'),
      routing: path.join(candidate.appRoot, 'src', 'utils', 'routingClient.js'),
      hopper: path.join(candidate.appRoot, 'src', 'utils', 'hopperUtils.js'),
      styles: path.join(candidate.appRoot, 'src', 'styles.css'),
      packageJson: path.join(candidate.appRoot, 'package.json'),
    };
    if (Object.values(required).every(fs.existsSync)) return { ...candidate, ...required };
  }
  throw new Error(`Could not find GlobeHoppers beneath ${start}`);
}

const failures = [];
const passes = [];
function check(condition, label) {
  if (condition) passes.push(label);
  else failures.push(label);
}
function includes(source, text, label) { check(source.includes(text), label); }
function excludes(source, text, label) { check(!source.includes(text), label); }
function count(source, text) { return source.split(text).length - 1; }

const project = findProject(process.argv[2] || process.cwd());
const app = fs.readFileSync(project.app, 'utf8');
const controls = fs.readFileSync(project.controls, 'utf8');
const travelMap = fs.readFileSync(project.travelMap, 'utf8');
const routing = fs.readFileSync(project.routing, 'utf8');
const hopper = fs.readFileSync(project.hopper, 'utf8');
const styles = fs.readFileSync(project.styles, 'utf8');
const packageData = JSON.parse(fs.readFileSync(project.packageJson, 'utf8'));

check(packageData.version === '6.2.0', 'package version is 6.2.0');

includes(travelMap, 'CONTINUOUS_HANDOFF_HOLD_MS = 900', 'connected handoff hold remains present');
includes(travelMap, 'CONTINUOUS_HANDOFF_RELEASE_MS = 1200', 'connected handoff release remains present');
includes(travelMap, 'TIMELINE_COMPLETE_GLOBE_DURATION_MS = 2200', 'completion globe glide remains present');
includes(travelMap, 'transitionStartCamera', 'connected handoff captures prior camera');
includes(travelMap, 'Math.min(liveZoom, IDLE_SPIN_GLOBE_ZOOM)', 'completion never zooms inward');
excludes(travelMap, "if (completedMode && !globeOverview) {\n        map.easeTo({ center: INTRO_GLOBE_CENTER", 'legacy completion cut to home is absent');

includes(app, 'const GLOBEHOPPERS_V62 = true;', 'v6.2 application marker is present');
includes(app, 'function restartJourney()', 'explicit Restart Journey command exists');
includes(app, 'onReset={restartJourney}', 'advanced controls use Restart Journey');
includes(app, 'if (started && finalLegComplete)', 'completed Play guard exists');
excludes(app, '!started || finalLegComplete || activeIndex', 'completed timeline is not implicitly restarted');
includes(app, 'timelineComplete={started && legs.length > 0', 'completed playback state is passed to controls');
includes(app, "restartRoutingEngine('manual retry')", 'manual routing retry is connected');
includes(app, 'hopperIntegrity={hopperIntegrity}', 'Hopper integrity diagnostics are connected');
check(count(app, 'setResetNonce(n => n + 1)') === 1, 'only Restart Journey increments the reset nonce');
const viewGlobeMatch = app.match(/function viewGlobe\(\) \{([\s\S]*?)\n\s*\}/);
check(Boolean(viewGlobeMatch) && !viewGlobeMatch[1].includes('setResetNonce'), 'View Globe does not also issue a restart reset');
const restartMatch = app.match(/function restartJourney\(\) \{([\s\S]*?)\n\s*\}/);
check(Boolean(restartMatch) && restartMatch[1].includes('setResetNonce'), 'Restart Journey owns the home reset');

includes(routing, 'WORKER_INIT_TIMEOUT_MS = 30000', 'routing initialization has a timeout');
includes(routing, 'WORKER_REQUEST_TIMEOUT_MS = 45000', 'routing jobs have a timeout');
includes(routing, 'function disposeWorker(', 'routing worker disposal is centralized');
includes(routing, 'instance.terminate()', 'poisoned routing workers are terminated');
includes(routing, 'worker.onmessageerror', 'routing message errors are handled');
includes(routing, 'window.clearTimeout(record.timer)', 'completed routing requests clear timeout state');
includes(routing, 'if (epoch !== workerEpoch) return;', 'stale routing worker messages are ignored');
includes(routing, 'export async function restartRoutingEngine', 'fresh-worker retry API exists');
includes(routing, 'Routing engine timed out', 'routing timeout is visible to the UI');

includes(controls, 'timelineComplete = false', 'controls accept completed state');
includes(controls, "if (timelineComplete) return;", 'completed Play is a deliberate no-op');
includes(controls, 'Restart Journey</button>', 'Restart Journey is user-visible');
includes(controls, "event.key !== 'Escape'", 'advanced controls support Escape');
includes(controls, 'advancedToggleRef.current?.focus()', 'advanced-controls focus is restored');
includes(controls, 'aria-expanded={advancedOpen}', 'advanced-controls expanded state is exposed');
includes(controls, 'role="dialog"', 'advanced controls expose dialog semantics');
includes(controls, 'Retry Routing Engine', 'routing recovery is user-visible');
includes(controls, 'Hopper integrity', 'Hopper integrity diagnostics are user-visible');
includes(controls, 'aria-disabled={timelineComplete}', 'completed Play state is exposed accessibly');

includes(hopper, 'export function auditHopperData', 'Hopper/Hop Squad audit exists');
includes(hopper, 'Duplicate Hopper ID', 'duplicate Hopper IDs are detected');
includes(hopper, 'references unknown Hopper IDs', 'broken Hopper and trip references are detected');
includes(hopper, 'duplicate Guest Hopper IDs', 'duplicate Guest Hopper IDs are detected');
includes(hopper, "new Set([...hopperIds, ...squadIds, 'both'])", 'legacy and Hop Squad traveler IDs are recognized');

includes(styles, 'GlobeHoppers v6.2 control containment and accessibility', 'v6.2 style marker is present');
includes(styles, '@media (max-height: 720px)', 'short-screen advanced controls are contained');
includes(styles, '@media (max-width: 720px)', 'mobile playback controls are contained');
includes(styles, '@media (prefers-reduced-motion: reduce)', 'reduced-motion safeguards are present');

for (const [label, file] of [['routingClient.js', project.routing], ['hopperUtils.js', project.hopper]]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  check(result.status === 0, `${label} passes Node syntax checking`);
  if (result.status !== 0 && result.stderr) failures.push(result.stderr.trim());
}

try {
  const moduleUrl = `${pathToFileURL(project.hopper).href}?verify=${Date.now()}`;
  const hopperModule = await import(moduleUrl);
  const clean = hopperModule.auditHopperData({ hoppers: [{ id: 'a', name: 'A', color: '#fff' }, { id: 'b', name: 'B', color: '#000' }], hopSquads: [{ id: 'ab', name: 'AB', hopperIds: ['a', 'b'] }] }, [{ id: 'trip', travelers: ['a', 'b'] }]);
  const broken = hopperModule.auditHopperData({ hoppers: [{ id: 'a', name: 'A' }, { id: 'a', name: 'Again' }], hopSquads: [{ id: 'bad', name: 'Bad', hopperIds: ['missing'] }] }, [{ id: 'trip', label: 'Trip', travelers: ['missing'] }]);
  const compatible = hopperModule.auditHopperData({ hoppers: [{ id: 'a', name: 'A', color: '#fff' }, { id: 'b', name: 'B', color: '#000' }], hopSquads: [{ id: 'ab', name: 'AB', hopperIds: ['a', 'b'] }] }, [{ id: 'squad-trip', travelers: ['ab'] }, { id: 'legacy-trip', travelers: ['both'] }]);
  check(clean.state === 'ok', 'clean Hopper data audits as healthy');
  check(compatible.state === 'ok', 'Hop Squad and legacy traveler references remain compatible');
  check(broken.state === 'error' && broken.errors.length >= 2, 'broken Hopper data produces actionable errors');
} catch (error) {
  failures.push(`Hopper audit behavior test could not run: ${error.message}`);
}



console.log('\nGlobeHoppers v6.2 static verification');
for (const label of passes) console.log(`  PASS  ${label}`);
for (const label of failures) console.error(`  FAIL  ${label}`);
if (failures.length) {
  console.error(`\n${failures.length} verification check(s) failed. Production build was not started.`);
  process.exit(1);
}

if (process.env.GLOBEHOPPERS_SKIP_BUILD === '1') {
  console.log('\nStatic and behavioral verification passed. Build skipped by GLOBEHOPPERS_SKIP_BUILD=1.');
  process.exit(0);
}

console.log('\nRunning production build...');
const build = spawnSync('npm', ['run', 'build'], { cwd: project.appRoot, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) {
  console.error('\nProduction build failed. Do not deploy this checkout until the build error is corrected.');
  process.exit(build.status || 1);
}
console.log('\nGlobeHoppers v6.2 verification and production build passed.');
