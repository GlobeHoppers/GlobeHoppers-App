import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('src/App.jsx');
const map = read('src/components/TravelMap.jsx');
const controls = read('src/components/PlaybackControls.jsx');
const admin = read('src/components/AdminPanel.jsx');
const cards = read('src/components/HopResultCards.jsx');
const css = read('src/styles.css');
const route = read('src/utils/routePresentation.js');
const checks = [
 ['version 7.5.3', JSON.parse(read('package.json')).version === '7.5.3'],
 ['spacebar playback control', controls.includes("event.code !== 'Space'") && controls.includes('(isPlaying ? onPause : onPlay)')],
 ['search closes for destination selection', app.includes("globehoppers-close-search")],
 ['destination closes for search', app.includes("globehoppers-search-opened")],
 ['search emits exclusivity event', controls.includes("globehoppers-search-opened")],
 ['disconnected route resets playback camera', map.includes('Never seed playback from a stale overview/idle camera')],
 ['manual return finishes on live target', map.includes('const finalTarget = latestTarget || state.target || endpoint')],
 ['follow camera floor', map.includes('activeFollowFloor')],
 ['antimeridian arc suppression', map.includes('Math.abs(Number(leg.to.lon) - Number(leg.from.lon)) > 180')],
 ['conservative horizon culling', map.includes('pitch > 45 ? 46') && map.includes('point, 0.90')],
 ['fixed fit scroll reset', controls.includes("behavior: 'auto'")],
 ['timeline overflow presentation', css.includes('GlobeHoppers v7.5.3') && css.includes('.timeline-marker__tooltip')],
 ['shared polished cards', cards.includes('hop-result-card__identity') && css.includes('deliberate two-column grid')],
 ['additional legs promoted heading', admin.includes('<h3>Additional Legs</h3>')],
 ['boat presentation widened', route.includes("normalizedMode === 'boat' ? 22") && route.includes("mode === 'boat' ? 5.25")]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failed++; }
if (failed) process.exit(1);
console.log(`\n${checks.length} v7.5.3 verification checks passed.`);
