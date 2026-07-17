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
const controls = read('src/components/PlaybackControls.jsx');
const styles = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));

check('release version is v7.5.15', pkg.version === '7.5.15');
check('screensaver state is passed into playback controls', app.includes('screensaverMode={screensaverEnabled}'));
check('screensaver controls have an isolated class', controls.includes("controls--screensaver") && controls.includes('screensaverMode = false'));
check('play pause control is omitted in screensaver mode', controls.includes('{!screensaverMode && <button type="button" className="controls-play-pill"'));
check('timeline zoom controls are omitted in screensaver mode', controls.includes('{!screensaverMode && <div className="timeline-scrubber__header'));
check('globe controls are omitted in screensaver mode', controls.includes('{!screensaverMode && globeControlsVisible'));
check('search is omitted in screensaver mode', controls.includes('{!screensaverMode && <div className="controls-search-wrap"'));
check('advanced menu is omitted in screensaver mode', controls.includes('{!screensaverMode && <div className="controls-advanced-wrap"'));
check('screensaver hides top navigation and about text', styles.includes('.app.is-screensaver .topbar') && styles.includes('.app.is-screensaver .about'));
check('screensaver hides zoom diagnostics', styles.includes('.app.is-screensaver .zoom-readout'));
check('screensaver timeline spans full viewport width', styles.includes('.app.is-screensaver .controls--screensaver') && styles.includes('width: 100% !important;') && styles.includes('left: 0 !important;'));
check('screensaver preserves queue cards', styles.includes('.app.is-screensaver .trip-card-stack') && !styles.includes('.app.is-screensaver .trip-card-stack,\n.app.is-screensaver'));
check('release documentation exists', fs.existsSync(path.join(root, 'QA/QA-v7.5.15.md')) && fs.existsSync(path.join(root, 'QA/RELEASE-v7.5.15.md')) && fs.existsSync(path.join(root, 'INTERACTION-v7.5.15.md')));

const failed = checks.filter(item => !item.pass);
console.log(`${checks.length - failed.length}/${checks.length} GlobeHoppers v7.5.15 checks passed.`);
if (failed.length) process.exit(1);
