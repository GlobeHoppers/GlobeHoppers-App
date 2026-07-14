import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) console.error(`FAIL: ${name}`);
};

const app = read('src/App.jsx');
const cards = read('src/components/HopResultCards.jsx');
const controls = read('src/components/PlaybackControls.jsx');
const map = read('src/components/TravelMap.jsx');
const css = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));

check('release version is v7.5.12', pkg.version === '7.5.12');
check('trip timeline exposes ordered leg transport modes', app.includes('legModes: collectTripTransportModes(trip, tripLegs)'));
check('transport aliases normalize car, train, boat, and plane modes', app.includes("return 'drive';") && app.includes("return 'train';") && app.includes("return 'boat';") && app.includes("return 'plane';"));
check('result cards define all four transport presentations', ['Plane', 'Car', 'Train', 'Boat'].every(label => cards.includes(`label: '${label}'`)));
check('result cards render transport mode badges', cards.includes('hop-result-card__modes') && cards.includes('hop-result-card__mode--${mode}'));
check('timeline search indexes every leg mode', controls.includes('...(row.legModes || [])'));
check('active pin position rises by one original stem length', controls.includes('const activeStemExtension = tooltipMarker.id === activeMarkerId ? 12 : 0'));
check('active pin stem doubles from twelve to twenty-four pixels', /\.gh-timeline-v7510__active-pin\.is-current\s*>\s*i\s*\{[\s\S]*?height:\s*24px/.test(css));
check('transport badges have compact shared styling', css.includes('.hop-result-card__modes') && css.includes('.hop-result-card__mode'));
check('globe display filter has an explicit playback-safe effective mode', map.includes("const effectiveGlobeDisplayMode = globeOverview && !idleMode && !isPlaying && !introLaunching"));
check('route and location layers use the effective globe mode', map.includes("const hideRoutes = effectiveGlobeDisplayMode === 'locations'") && map.includes("const hideLocations = effectiveGlobeDisplayMode === 'routes'"));
check('map shell class also uses the effective globe mode', map.includes('globe-display-${effectiveGlobeDisplayMode}'));
check('v7.5.12 QA documentation exists', fs.existsSync(path.join(root, 'QA/QA-v7.5.12.md')) && fs.existsSync(path.join(root, 'QA/RELEASE-v7.5.12.md')));

const failed = checks.filter(item => !item.pass);
console.log(`${checks.length - failed.length}/${checks.length} GlobeHoppers v7.5.12 checks passed.`);
if (failed.length) process.exit(1);
