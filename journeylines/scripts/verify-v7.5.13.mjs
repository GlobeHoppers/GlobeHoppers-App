import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) console.error(`FAIL: ${name}`);
};

const controls = read('src/components/PlaybackControls.jsx');
const cards = read('src/components/HopResultCards.jsx');
const map = read('src/components/TravelMap.jsx');
const css = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));

check('release version is v7.5.13', pkg.version === '7.5.13');
check('timeline measurement runs in layout phase', controls.includes('useLayoutEffect'));
check('active overlay anchors to the fixed track', controls.includes("querySelector?.('.gh-timeline-v7510__track')") && controls.includes('const markerBaseY = trackRect.top + trackRect.height / 2 - controlsRect.top'));
check('active overlay uses full raised geometry immediately', controls.includes('const stemLength = isCurrentMarker ? 24 : 12') && controls.includes('const headCenterY = markerBaseY - stemLength'));
check('active overlay renders independent stem and head', controls.includes('><i /><b /></span>'));
check('active overlay geometry is passed as explicit CSS variables', controls.includes("'--gh-overlay-stem'") && controls.includes("'--gh-overlay-head'"));
check('active marker wrapper is a zero-size track anchor', /\.gh-timeline-v7510__active-pin\s*\{[\s\S]*?width:\s*0\s*!important;[\s\S]*?height:\s*0\s*!important;/.test(css));
check('active stem uses the explicit overlay length', css.includes('height: var(--gh-overlay-stem, 24px) !important'));
check('active head is independently positioned and animated', css.includes('.gh-timeline-v7510__active-pin > b') && css.includes('gh-v7513-active-head-pop'));
check('short destination result stacks align to the top', css.includes('.destination-trip-queue__list > .hop-result-cards') && css.includes('align-content: start !important'));
check('result rows no longer stretch to consume free height', css.includes('grid-auto-rows: max-content !important') && css.includes('height: max-content !important'));
check('globe top-menu button has a larger dedicated target', /\.topbar-globe-button\s*\{[\s\S]*?width:\s*48px\s*!important;[\s\S]*?height:\s*48px\s*!important;/.test(css));
check('transport badges remain present', cards.includes('hop-result-card__modes') && cards.includes('hop-result-card__mode'));
check('globe display filters remain playback isolated', map.includes('effectiveGlobeDisplayMode'));
check('v7.5.13 release documentation exists', fs.existsSync(path.join(root, 'QA/QA-v7.5.13.md')) && fs.existsSync(path.join(root, 'QA/RELEASE-v7.5.13.md')) && fs.existsSync(path.join(root, 'INTERACTION-v7.5.13.md')));

const failed = checks.filter(item => !item.pass);
console.log(`${checks.length - failed.length}/${checks.length} GlobeHoppers v7.5.13 checks passed.`);
if (failed.length) process.exit(1);
