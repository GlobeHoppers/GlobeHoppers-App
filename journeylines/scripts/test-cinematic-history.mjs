import test from 'node:test';
import assert from 'node:assert/strict';
import trips from '../src/data/trips.json' with {type:'json'};
import locations from '../src/data/locations.json' with {type:'json'};
import { createHistoryPlaylist, createEightStopPlaylist } from '../src/cinematic/historyPlaylist.js';
import { demoStops } from '../src/cinematic/demoStops.js';
import { createImageryPreflight, destinationTiles } from '../src/cinematic/imageryPreflight.js';

test('WP3 indexes the complete chronological trip snapshot without prebuilding all scenes',()=>{
  const p=createHistoryPlaylist(trips,locations);
  assert.equal(trips.length,178);
  assert.equal(p.tripCount,178);
  assert.ok(p.legCount>=385 && p.legCount<=401,'all meaningful trip legs represented');
  assert.ok(p.totalMs>30*60*1000 && p.totalMs<3*60*60*1000);
  assert.equal(p.stats().cachedScenes,0,'only timeline metadata loads initially');
  assert.equal(p.stats().builds,0);
  const times=p.entries.map(e=>e.startMs);
  assert.deepEqual(times,[...times].sort((a,b)=>a-b));
  assert.ok(p.entries.every(e=>e.durationMs>0&&e.bridgeEndMs>=e.endMs));
});

test('time resolution and inter-trip globe transitions do not cut the camera',()=>{
  const p=createHistoryPlaylist(trips,locations);
  for(const i of [0,5,53,90,176]){
    const entry=p.entries[i];
    const start=p.locate(entry.startMs);
    assert.equal(start.entry.id,entry.id);
    assert.equal(start.kind,'trip');
    const before=p.sample(entry.endMs-0.001);
    const bridge=p.locate(entry.endMs);
    assert.equal(bridge.kind,'bridge');
    const at=p.sample(entry.endMs);
    assert.ok(Math.abs(before.zoom-at.zoom)<.001);
    assert.ok(Math.abs(before.pitch-at.pitch)<.001);
    assert.ok(Math.abs(before.center[1]-at.center[1])<.001);
    const next=p.locate(entry.bridgeEndMs);
    assert.equal(next.entry.id,p.entries[i+1].id);
    const end=p.sample(entry.bridgeEndMs-.001);
    assert.ok(Math.abs(end.zoom-next.pose.zoom)<.001);
    assert.ok(Math.abs(end.center[1]-next.pose.center[1])<.001);
    assert.ok(Math.abs(((end.center[0]-next.pose.center[0]+540)%360)-180)<.002);
  }
});

test('compiled scene cache stays bounded during hour-long random seeking',()=>{
  const p=createHistoryPlaylist(trips,locations);
  for(let i=0;i<178;i+=11){
    const e=p.entries[i],sample=p.sample(e.startMs+1000);
    assert.ok(sample.center.every(Number.isFinite));
    p.primeNear(e.startMs);
    assert.ok(p.stats().cachedScenes<=3);
  }
  assert.ok(p.stats().builds<60,'only inspected segments were compiled');
  assert.equal(p.entries.length,178);
});

test('vehicle mode is preserved for train, boat, plane, and driving trips',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const matched=new Set();
  for(let i=0;i<p.entries.length;i++){
    for(const stop of p.entries[i].stops.slice(1)) matched.add(stop.modeFromPrevious);
  }
  assert.ok(matched.has('plane')&&matched.has('drive')&&matched.has('boat')&&matched.has('train'));
  for(const mode of ['plane','drive','boat','train']){
    const index=p.entries.findIndex(e=>e.stops.slice(1).some(s=>s.modeFromPrevious===mode));
    assert.ok(index>=0);
    const scene=p.sceneFor(index);
    const leg=scene.legs.find(l=>l.mode===mode);
    const actor=p.planeAt(p.entries[index].startMs+(leg.startMs+leg.endMs)/2);
    assert.equal(actor.mode,mode);
    if(mode!=='plane') assert.equal(actor.pitchDegrees,0);
  }
});

test('demo mode preserves exactly eight independent stops',()=>{
  const d=createEightStopPlaylist(demoStops);
  assert.equal(d.tripCount,1);
  assert.equal(d.stopCount,8);
  assert.equal(d.legCount,7);
  assert.equal(d.planeAt(0),null);
});

test('bounded destination preflight generates limited satellite tiles',()=>{
  const stop={id:'ny',lon:-74.006,lat:40.71};
  const urls=destinationTiles(stop,'earth');
  assert.ok(urls.length>12 && urls.length<=27);
  assert.ok(urls.some(url=>url.includes('gibs.earthdata.nasa.gov')));
  assert.ok(urls.some(url=>url.includes('tiles.maps.eox.at')));
  assert.deepEqual(destinationTiles(stop,'midnight'),[]);
  assert.deepEqual(destinationTiles(null,'earth'),[]);
});

test('preflight observes concurrency limit, results, and failed tile recovery',async()=>{
  let active=0,maxActive=0;
  const preflight=createImageryPreflight(async()=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,1));
    active--;
    return true;
  });
  const stop={id:'la',lon:-118.24,lat:34.05};
  const job=preflight.schedule(stop,'earth');
  assert.equal(preflight.status(stop,'earth'),'loading');
  assert.equal(await job.promise,true);
  assert.equal(preflight.status(stop,'earth'),'ready');
  assert.equal(preflight.schedule(stop,'earth'),job,'no duplicate tile fetch');
  assert.ok(maxActive<=4);
  assert.equal(preflight.stats()[0].failed,0);
  assert.equal(preflight.stats()[0].passed,job.attempted);
  const broken=createImageryPreflight(async()=>{throw Error('offline');});
  assert.equal(await broken.schedule(stop,'earth').promise,false);
  assert.equal(broken.status(stop,'earth'),'degraded');
});
