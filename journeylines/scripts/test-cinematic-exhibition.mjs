import test from 'node:test';
import assert from 'node:assert/strict';
import trips from '../src/data/trips.json' with { type: 'json' };
import locations from '../src/data/locations.json' with { type: 'json' };
import { createHistoryPlaylist, createEightStopPlaylist, withExhibitionLoop,
  EXHIBITION_WRAP_MS } from '../src/cinematic/historyPlaylist.js';
import { EXHIBITION_IDLE_MS, EXHIBITION_WATCHDOG_MS,
  exhibitionRetryDelay, createExhibitionUi,
  shouldResumeAfterVisibility } from '../src/cinematic/exhibition.js';

const smallStops=[
  {id:'sd',name:'San Diego',lon:-117.1611,lat:32.7157},
  {id:'ny',name:'New York',lon:-74.006,lat:40.7128},
  {id:'tk',name:'Tokyo',lon:139.6503,lat:35.6762}
];
const bearingDelta=(a,b)=>((a-b+540)%360)-180;
function nearPose(a,b,eps=1e-6){
  assert.ok(Math.abs(bearingDelta(a.center[0],b.center[0]))<eps);
  assert.ok(Math.abs(a.center[1]-b.center[1])<eps);
  assert.ok(Math.abs(a.zoom-b.zoom)<eps);
  assert.ok(Math.abs(a.pitch-b.pitch)<eps);
  assert.ok(Math.abs(bearingDelta(a.bearing,b.bearing))<eps);
}

test('WP4 wrap path ends exactly on its starting camera pose',()=>{
  const base=createEightStopPlaylist(smallStops);
  const loop=withExhibitionLoop(base);
  assert.equal(loop.totalMs,base.totalMs+EXHIBITION_WRAP_MS);
  assert.equal(loop.naturalEndMs,base.totalMs);
  nearPose(loop.sample(loop.totalMs),loop.sample(0),1e-7);
  nearPose(loop.sample(loop.naturalEndMs),base.sample(base.totalMs),1e-7);
  assert.equal(loop.locate(loop.naturalEndMs).kind,'bridge');
  assert.equal(loop.context(loop.naturalEndMs).tripIndex,0);
  assert.equal(loop.planeAt(loop.naturalEndMs+1000),null);
  assert.equal(loop.arrivalAt(loop.naturalEndMs+1000),null);
  assert.deepEqual(loop.visibleRoutes(loop.naturalEndMs+1000),[]);
  assert.deepEqual(loop.visibleStops(loop.naturalEndMs+1000),[]);
  assert.deepEqual(loop.currentStopTimes(loop.naturalEndMs+1000),[]);
  nearPose(loop.sample(loop.totalMs-.0001),loop.sample(0),1e-3);
});

test('WP4 hour-scale full history closure preserves bounded compiled scenes',()=>{
  const base=createHistoryPlaylist(trips,locations);
  const loop=withExhibitionLoop(base);
  assert.equal(loop.tripCount,178);
  assert.equal(loop.legCount,base.legCount);
  assert.ok(loop.totalMs>30*60*1000);
  const end=loop.locate(loop.totalMs);
  assert.equal(end.kind,'bridge');
  assert.equal(end.nextEntry.id,loop.entries[0].id);
  nearPose(loop.sample(loop.totalMs),loop.sample(0));
  for(let i=0;i<120;i++){
    const t=(i*103273)%loop.totalMs;
    const p=loop.sample(t);
    assert.ok(p.center.every(Number.isFinite));
    assert.ok(loop.stats().cachedScenes<=3);
  }
});

test('WP4 loop bridging never jumps rotation beyond north-biased envelope',()=>{
  const loop=withExhibitionLoop(createEightStopPlaylist(smallStops));
  for(let t=loop.naturalEndMs;t<=loop.totalMs;t+=17){
    const p=loop.sample(t);
    assert.ok(p.bearing>=-45.00001&&p.bearing<=45.00001);
    assert.ok(p.center.every(Number.isFinite));
  }
});

test('WP4 UI auto hides after inactivity and resets idle timer on activity',()=>{
  let clock=0,nextId=1,visible=false;
  const timers=new Map(),visits=[];
  const advance=ms=>{
    const end=clock+ms;
    while(true){
      const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next||next[1].at>end)break;
      clock=next[1].at;timers.delete(next[0]);next[1].run();
    }
    clock=end;
  };
  const ui=createExhibitionUi({
    show(){visible=true;visits.push('show');},
    hide(){visible=false;visits.push('hide');},
    schedule(run,ms){const id=nextId++;timers.set(id,{run,at:clock+ms});return id;},
    cancel:id=>timers.delete(id),
    idleMs:EXHIBITION_IDLE_MS
  });
  assert.equal(visible,false);
  ui.wake();assert.equal(visible,true);
  advance(EXHIBITION_IDLE_MS-300);assert.equal(visible,true);
  ui.wake();advance(EXHIBITION_IDLE_MS-100);assert.equal(visible,true);
  advance(100);assert.equal(visible,false);
  ui.wake();ui.close();
  advance(EXHIBITION_IDLE_MS+1000);
  assert.equal(visible,true,'disposed timers must not mutate the UI');
  assert.deepEqual(visits,['show','show','hide','show']);
  assert.ok(EXHIBITION_WATCHDOG_MS>EXHIBITION_IDLE_MS);
});

test('WP4 recovery retries use bounded exponential backoff',()=>{
  assert.deepEqual([0,1,2,3,4,5,6,200].map(exhibitionRetryDelay),
    [1400,2800,5600,11200,22400,30000,30000,30000]);
  assert.equal(exhibitionRetryDelay(-5),1400);
});

test('WP4 visibility resume only restarts previously playing exhibits',()=>{
  assert.equal(shouldResumeAfterVisibility({pausedByVisibility:true,hidden:false,userPaused:false}),true);
  assert.equal(shouldResumeAfterVisibility({pausedByVisibility:false,hidden:false,userPaused:false}),false);
  assert.equal(shouldResumeAfterVisibility({pausedByVisibility:true,hidden:true,userPaused:false}),false);
  assert.equal(shouldResumeAfterVisibility({pausedByVisibility:true,hidden:false,userPaused:true}),false);
});

test('WP4 refuses invalid or ambiguous loop duration',()=>{
  const base=createEightStopPlaylist(smallStops);
  assert.throws(()=>withExhibitionLoop(base,0),/Invalid/);
  assert.throws(()=>withExhibitionLoop(base,Infinity),/Invalid/);
  assert.throws(()=>withExhibitionLoop(base,40000),/Invalid/);
});
