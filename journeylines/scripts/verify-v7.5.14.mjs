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
const readme = read('README.md');
const pkg = JSON.parse(read('package.json'));

check('release version is v7.5.14', pkg.version === '7.5.14');
check('canonical screensaver query is recognized', app.includes("params.get('screensaver')") && app.includes("enabledValues.has(requested)"));
check('screensaver aliases are recognized', app.includes("params.get('mode')") && app.includes("hash === 'screensaver'") && app.includes("hash === 'playmode'"));
check('globe hold defaults to ten minutes', app.includes('const SCREENSAVER_GLOBE_DURATION_MS = 10 * 60 * 1000'));
check('screensaver starts at the first leg', app.includes('setActiveIndex(0)') && app.includes('legIdentityForEntry(currentLegs[0], 0, 0)'));
check('screensaver launches through existing intro playback', app.includes("setScreensaverPhase('timeline')") && app.includes('setIntroLaunching(true)'));
check('timeline completion enters screensaver globe phase', app.includes("screensaverPhase !== 'timeline' || !timelineComplete") && app.includes('enterScreensaverGlobePhase()'));
check('globe phase forces both routes and locations', app.includes("setGlobeDisplayMode('both')") && app.includes("setScreensaverPhase('globe')"));
check('globe phase resumes spin', app.includes('setGlobeSpinPaused(false)'));
check('globe timer restarts the timeline', app.includes('window.setTimeout(startScreensaverTimelineCycle, screensaverConfig.globeDurationMs)'));
check('normal idle scheduling is disabled in screensaver mode', app.includes('if (screensaverEnabled) return;') && app.includes('shouldEnterIdleMode'));
check('visible interrupted playback self-recovers', app.includes("screensaverPhase !== 'timeline'") && app.includes('document.hidden') && app.includes('setIsPlaying(true)'));
check('screensaver phase is observable on the app root', app.includes('data-screensaver-phase={screensaverPhase}'));
check('README documents the deployed screensaver URL', readme.includes('https://jonathanjoelneptune.github.io/JourneyLines/?screensaver=1'));
check('release documentation exists', fs.existsSync(path.join(root, 'QA/QA-v7.5.14.md')) && fs.existsSync(path.join(root, 'QA/RELEASE-v7.5.14.md')) && fs.existsSync(path.join(root, 'INTERACTION-v7.5.14.md')));

const failed = checks.filter(item => !item.pass);
console.log(`${checks.length - failed.length}/${checks.length} GlobeHoppers v7.5.14 checks passed.`);
if (failed.length) process.exit(1);
