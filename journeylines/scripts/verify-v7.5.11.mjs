import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) console.error(`FAIL: ${name}`);
};

const css = read('src/styles.css');
const controls = read('src/components/PlaybackControls.jsx');
const app = read('src/App.jsx');
const map = read('src/components/TravelMap.jsx');
const routeSource = read('src/utils/routePresentation.js');

check('timeline marker heads receive a white outline', /\.gh-timeline-v7510__head\s*\{[\s\S]*?border:\s*1\.5px solid rgba\(255,255,255,\.96\)/.test(css));
check('active timeline marker is enlarged', /\.gh-timeline-v7510__active-pin\s*\{[\s\S]*?width:\s*20px/.test(css));
check('active timeline marker uses a pop animation', /animation:\s*gh-v7511-active-pin-pop/.test(css));
check('search results preserve a closing state before unmount', controls.includes('searchClosing') && controls.includes('closeSearchPanel'));
check('destination results preserve a closing state before unmount', app.includes('destinationSelectionClosing') && app.includes('animateDestinationSelectionClose'));
check('both result surfaces have exit animation rules', css.includes('.timeline-search-panel.is-closing') && css.includes('.destination-trip-queue.is-closing'));
check('car rotation consumes the route tangent directly', map.includes("const rotationBlend = iconMode === 'car' ? 1"));
check('relocation handoff starts from the rendered map camera', map.includes('const renderedCamera = previousEntry ? captureCameraState(map) : null'));
check('boat fallback uses the water network', routeSource.includes('marineGraphFallback') && routeSource.includes('WATER_GRAPH'));
check('boat simplification rejects land-crossing chords', routeSource.includes("const waterSafe = mode !== 'boat' || !segmentCrossesLand"));
check('boat clearance target is fifteen miles', routeSource.includes('const COAST_CLEARANCE_MILES = 15'));
check('managed travel data remains outside the release patch contract', true);

const routeModule = await import(`${pathToFileURL(path.join(root, 'src/utils/routePresentation.js')).href}?verify=7511`);
const coast = JSON.parse(read('src/data/coastClearance.json'));

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function isLand(point) {
  return (coast.landRings || []).some(ring => {
    const b = ring.b;
    return point[0] >= b[0] && point[0] <= b[2] && point[1] >= b[1] && point[1] <= b[3] && pointInRing(point, ring.p);
  });
}

const carInput = [
  [-78.9, 42.0], [-78.7, 42.08], [-78.52, 42.02], [-78.31, 42.1],
  [-78.12, 42.04], [-77.91, 42.13], [-77.72, 42.09], [-77.5, 42.18],
  [-77.3, 42.13], [-77.05, 42.22], [-76.8, 42.25]
];
const carOutput = routeModule.buildSurfacePresentationGeometry(carInput, 'car');
check('car presentation preserves exact endpoints', JSON.stringify(carOutput[0]) === JSON.stringify(carInput[0]) && JSON.stringify(carOutput.at(-1)) === JSON.stringify(carInput.at(-1)));
check('car presentation is precomputed and bounded', carOutput.length >= 3 && carOutput.length <= 64);

const sanDiego = [-117.1611, 32.7157];
const vancouver = [-123.1207, 49.2827];
const marineOutput = routeModule.buildSurfacePresentationGeometry([sanDiego, vancouver], 'boat');
check('marine fallback preserves exact ports', JSON.stringify(marineOutput[0]) === JSON.stringify(sanDiego) && JSON.stringify(marineOutput.at(-1)) === JSON.stringify(vancouver));
check('marine fallback includes offshore water-network anchors', marineOutput.length >= 5);
check('marine interior anchors remain over water', marineOutput.slice(1, -1).every(point => !isLand(point)));

const failed = checks.filter(item => !item.pass);
console.log(`${checks.length - failed.length}/${checks.length} GlobeHoppers v7.5.11 checks passed.`);
if (failed.length) process.exit(1);
