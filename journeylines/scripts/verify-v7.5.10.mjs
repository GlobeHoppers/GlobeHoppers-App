import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const travelMap = read('src/components/TravelMap.jsx');
const controls = read('src/components/PlaybackControls.jsx');
const styles = read('src/styles.css');

const checks = [
  ['manual gesture session is explicit', travelMap.includes('active: false, sequence: 0')],
  ['programmatic end events cannot schedule returns', travelMap.includes('if (!gesture.active) return;')],
  ['gesture sequence guards delayed return', travelMap.includes('currentGesture.sequence !== sequence')],
  ['playback start clears gesture ownership', travelMap.includes('manualGestureRef.current.active = false;')],
  ['live return controller is used', travelMap.includes('updatePlaybackReturnCamera(returnState, camera, now)')],
  ['legacy staged return controller removed', !travelMap.includes('stagedPlaybackReturnCamera')],
  ['return controller uses frame-rate independent damping', travelMap.includes('1 - Math.exp(-dt /')],
  ['return controller follows current live target', travelMap.includes('latestTarget.center') && travelMap.includes("state.target = { ...latestTarget")],
  ['timeline uses isolated namespace', controls.includes('gh-timeline-v7510__viewport')],
  ['timeline overlay anchors to real marker bounds', controls.includes('markerNode.getBoundingClientRect()')],
  ['active base pin is hidden under overlay', controls.includes("isCurrent || isHovered ? 'is-overlayed'")],
  ['timeline months are tied to actual trip months', controls.includes('if (!tick.hasPin || seen.has(key)) return false;')],
  ['timeline fixed geometry CSS exists', styles.includes('GlobeHoppers v7.5.10 — isolated fixed-geometry timeline')],
  ['timeline content height is fixed', styles.includes('.gh-timeline-v7510__content') && styles.includes('height: 42px !important;')],
  ['timeline zoom only changes content width in JSX', controls.includes('style={{ width: `${timelineZoom * 100}%` }}')],
  ['endpoint pins are clamped within the rail', styles.includes('left: clamp(7px, var(--marker-left), calc(100% - 7px))')]
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exit(1);
