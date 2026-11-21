/* WP5 CI gate. This records automated evidence but never authorizes
   production promotion, gh-pages publishing or main ref updates. */
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
function opt(flag,fallback){const i=args.indexOf(flag);return i<0?fallback:args[i+1]}
const out=path.resolve(opt('--out','.wp5-readiness'));fs.mkdirSync(out,{recursive:true});
const checks=[];
function pass(name,condition,detail){checks.push({name,status:condition?'pass':'fail',detail})}
function read(label,filename){try{return JSON.parse(fs.readFileSync(path.resolve(filename),'utf8'))}catch(error){pass(label+' evidence available',false,String(error));return null}}
const smoke=read('smoke',opt('--smoke','.wp5-smoke/summary.json'));
const viewer=read('viewer',opt('--viewer','.v9-viewer-smoke/summary.json'));
const endurance=read('endurance',opt('--endurance','.wp5-endurance/summary.json'));
const benchmark=read('benchmark',opt('--benchmark','.v9-browser-report/summary.json'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const app=fs.readFileSync('src/App.jsx','utf8');
const deploy=fs.readFileSync('../.github/workflows/deploy.yml','utf8');
pass('pre-account v7.5.15 baseline',pkg.version==='7.5.15'&&!pkg.dependencies?.['@supabase/supabase-js']&&!app.includes('useAuth')&&!app.includes('bootstrapAccount'),'v8 authentication and account repository integrations are out of scope');
pass('release does not deploy',deploy.includes('branches: [main]')&&!deploy.includes('refactor/v9-core'),'main-only deploy trigger preserved');
pass('browser functional and candidate visual regression',smoke?.status==='pass'&&smoke.checks?.length>=12&&smoke.screenshots?.length>=4&&smoke.errors?.length===0,smoke?.failure||'checks '+(smoke?.checks?.length||0));
pass('WP4 viewer and lazy single-user Studio',viewer?.status==='pass'&&viewer.editorRequested===true&&viewer.fullRouteModuleRequested===true,viewer?.failure||viewer?.status);
pass('unattended playback watchdog',endurance?.status==='pass'&&endurance.durationObservedSeconds>=110&&endurance.samples?.length>=4&&endurance.errors?.length===0,endurance?.failure||'seconds '+(endurance?.durationObservedSeconds||0));
const modes=benchmark?.modes||{};
const sameLeg=['wp2','wp3','wp3gpu','wp4viewer'].every(k=>modes[k]?.benchmark?.tripId&&modes[k]?.benchmark?.legId&&modes[k].benchmark.tripId===modes.wp2?.benchmark?.tripId&&String(modes[k].benchmark.legId)===String(modes.wp2?.benchmark?.legId));
pass('software-WebGL same-leg four-way A/B',sameLeg&&['wp2','wp3','wp3gpu','wp4viewer'].every(k=>modes[k].status==='measured')&&modes.wp4viewer.viewer?.mode==='viewer'&&Boolean(benchmark.viewerComparison),'CI FPS is diagnostic, not physical GPU FPS');
const automatedPass=checks.every(c=>c.status==='pass');
const pending=[
 {name:'30-minute browser endurance',complete:endurance?.status==='pass'&&endurance.durationObservedSeconds>=1800&&!endurance.memoryReviewRequired},
 {name:'actual Windows hardware GPU performance / 60Hz target where supported',complete:false},
 {name:'approved v7.5.15 visual comparison and connected-leg camera handoffs',complete:false},
 {name:'full 30-minute real-GPU screensaver and resource stability',complete:false},
 {name:'isolated single-user Add/Edit Hop repository save and reload',complete:false},
 {name:'explicit main-replacement approval and verified rollback',complete:false}
];
const report={schema:'globehoppers.wp5.release-gate.v1',date:new Date().toISOString(),baseline:'v7.5.15',candidateBranch:'refactor/v9-core',automatedStatus:automatedPass?'pass':'fail',productionReady:false,checks,pending,note:'Green CI is necessary but not sufficient to replace main'};
fs.writeFileSync(path.join(out,'release-readiness.json'),JSON.stringify(report,null,2)+'\n');
console.log('WP5_RELEASE_GATE '+JSON.stringify(report));
if(!automatedPass)process.exitCode=1;
