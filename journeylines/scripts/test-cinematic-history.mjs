import test from 'node:test';
import assert from 'node:assert/strict';
import trips from '../src/data/trips.json' with {type:'json'};
import locations from '../src/data/locations.json' with {type:'json'};
import details from '../src/data/routeDetails.json' with {type:'json'};
import { createHistoryPlaylist, createEightStopPlaylist } from '../src/cinematic/historyPlaylist.js';
import { simplifyReviewedSurfaceRoute } from '../src/cinematic/surfaceGeometry.js';
const demoStops = locations.slice(0,8).map(item => ({
  id:item.id,name:item.name,lon:item.lon,lat:item.lat
}));
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
  assert.ok(urls.length>12 && urls.length<=28);
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


test('WP3.1 matches reviewed car, boat and train geometry from v9 snapshot',()=>{
  const player=createHistoryPlaylist(trips,locations);
  const surface=Object.fromEntries(Object.entries(details.routes).filter(([,row])=>
    ['drive','boat','train'].includes(row.mode)&&Array.isArray(row.geometry)&&row.geometry.length>1)
    .map(([key,row])=>[key,{mode:row.mode,geometry:row.geometry}]));
  const matched=player.hydrateSurfaceRoutes({routes:surface});
  assert.ok(matched>=65,'most surface legs should reuse v9 reviewed route geometry');
  assert.ok(player.stats().reviewedSurfaceLegs>=65);
  const entryIndex=player.entries.findIndex(entry=>entry.stops.some(stop=>
    stop.modeFromPrevious==='drive' && stop.geometryFromPrevious?.length>2));
  assert.ok(entryIndex>=0);
  const scene=player.sceneFor(entryIndex);
  const leg=scene.legs.find(row=>row.mode==='drive');
  assert.equal(leg.geometrySource,'v9-reviewed');
  assert.ok(leg.path.length>50);
  const ms=player.entries[entryIndex].startMs+(leg.startMs+leg.endMs)/2;
  const camera=player.sample(ms);
  const actor=player.planeAt(ms);
  assert.equal(actor.mode,'drive');
  assert.ok(camera.zoom>=7 && camera.zoom<=8.6 && camera.pitch>55,
    'car camera uses stable, wider regional framing');
  assert.ok(Math.hypot(camera.center[0]-actor.coordinates[0],
    camera.center[1]-actor.coordinates[1])<0.3);
  assert.ok(player.stats().cachedScenes<=3);
});

test('preflight warms the lower-zoom Earth backdrop before close-up tiles',()=>{
  const urls=destinationTiles({id:'test',lon:-81,lat:25},'earth');
  assert.ok(urls.some(url=>url.includes('BlueMarble')&&url.includes('/4/')),
    'regional pullback must have z4 natural Earth tiles');
  assert.ok(urls.some(url=>url.includes('s2cloudless')&&url.includes('/6/')),
    'regional satellite zoom must be in the cache');
  assert.ok(urls.some(url=>url.includes('s2cloudless')&&url.includes('/9/')),
    'surface-follow close-up needs z9 tiles');
});


test('completed trips accumulate historical routes and destinations without scene cache expansion',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const before=p.completedHistory(0);
  assert.equal(before.count,0);
  assert.equal(before.routeCount,0);
  assert.equal(before.stopCount,0);
  assert.equal(p.stats().builds,0);
  const first=p.entries[0],second=p.entries[1];
  const bridge=p.completedHistory(first.endMs+1);
  assert.equal(bridge.count,1);
  assert.equal(bridge.routeCount,first.legCount);
  assert.ok(bridge.stopCount>=2);
  const travel=p.completedHistory(second.startMs+250);
  assert.equal(travel.count,1);
  assert.equal(travel.routeCount,bridge.routeCount);
  const next=p.completedHistory(second.endMs+1);
  assert.equal(next.count,2);
  assert.equal(next.routeCount,first.legCount+second.legCount);
  assert.ok(next.stopCount>=bridge.stopCount);
  const rewound=p.completedHistory(0);
  assert.equal(rewound.count,0);
  assert.equal(rewound.routeCount,0,'seeking backwards removes future history');
  const end=p.completedHistory(p.totalMs);
  assert.equal(end.count,178);
  assert.equal(end.routeCount,p.legCount);
  assert.ok(end.stopCount>=50 && end.stopCount<p.stopCount);
  assert.equal(p.stats().builds,0,'history archive does not compile all scenes');
  assert.ok(p.stats().cachedScenes<=3);
});

test('Key West reviewed Overseas Highway route retains provider road geometry',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const trip=trips.find(t=>t.label==='Key West May 2012');
  assert.ok(trip,'expected original May 2012 Key West itinerary');
  const firstDrive=trip.route.find(step=>step.modeFromPrevious==='drive');
  const key=trip.id+'::'+firstDrive.legId;
  const source=details.routes[key];
  assert.equal(source?.mode,'drive');
  assert.ok(source.geometry.length>1000,'v9 has detailed road source');
  const compact=simplifyReviewedSurfaceRoute(source.geometry,'drive');
  assert.ok(compact.length>12&&compact.length<=680,'keep significant road bends');
  assert.deepEqual(compact[0],source.geometry[0]);
  assert.deepEqual(compact.at(-1),source.geometry.at(-1));
  const matched=p.hydrateSurfaceRoutes({routes:{[key]:{
    mode:'drive',geometry:compact
  }}});
  assert.equal(matched,1);
  const entryIndex=p.entries.findIndex(e=>e.id===trip.id);
  const scene=p.sceneFor(entryIndex);
  const leg=scene.legs.find(l=>l.mode==='drive'&&l.to.name==='Key West');
  assert.ok(leg);
  assert.equal(leg.geometrySource,'v9-reviewed');
  assert.equal(leg.path.length,compact.length,
    'cinematic compiler must not simplify the reviewed road a second time');
  const after=p.completedHistory(p.entries[entryIndex].endMs+1);
  const historyLine=after.routes.features.find(f=>
    f.properties.tripId===trip.id&&f.properties.legId===firstDrive.legId);
  assert.ok(historyLine);
  assert.deepEqual(historyLine.geometry.coordinates,leg.path,
    'completed-history line matches the detailed route being driven');
});


test('same-place successive trips preserve route records but share one short home-base handoff',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const seams=p.entries.flatMap((entry,i)=>entry.sharedStart?[i]:[]);
  assert.ok(seams.length>=2,'history must contain at least two shared home-base transitions');
  for(const i of seams.slice(0,8)){
    const previous=p.entries[i-1],entry=p.entries[i];
    assert.equal(previous.sharedEnd,true);
    assert.equal(previous.bridgeDurationMs,650);
    assert.equal(entry.sceneOverrides.firstHoldMs,0);
    assert.equal(previous.sceneOverrides.lastHoldMs,0);
    assert.equal(entry.sceneOverrides.introMs,100);
    assert.equal(previous.sceneOverrides.outroMs,100);
    assert.ok(entry.startMs-previous.endMs<700);
    const atPreviousEnd=p.sample(previous.endMs);
    const atNextStart=p.sample(entry.startMs);
    assert.ok(Math.abs(atPreviousEnd.zoom-atNextStart.zoom)<.001);
    assert.ok(Math.abs(atPreviousEnd.pitch-atNextStart.pitch)<.001);
    const a=p.sample(previous.endMs),b=p.sample(entry.startMs);
    for(const f of [.1,.25,.5,.75,.9]){
      const pose=p.sample(previous.endMs+previous.bridgeDurationMs*f);
      const eased=f*f*f*(f*(f*6-15)+10);
      assert.ok(Math.abs(pose.zoom-(a.zoom+(b.zoom-a.zoom)*eased))<1e-5,
        'shared-city zoom must not pulse: '+f);
      assert.ok(pose.zoom>=Math.min(a.zoom,b.zoom)-1e-6);
    }
    assert.equal(p.locate(previous.endMs).kind,'bridge');
    assert.equal(p.locate(entry.startMs).kind,'trip');
    assert.equal(p.currentStopTimes(entry.startMs).length,entry.stops.length-1);
    assert.ok(p.planeAt(entry.startMs+entry.sceneOverrides.introMs+250),
      'following trip starts moving immediately after shared home-base');
  }
  assert.equal(p.legCount,p.entries.reduce((sum,e)=>sum+e.legCount,0));
  assert.equal(p.stats().sharedStopSeams,seams.length);
});

test('unrelated trip boundaries keep globe bridges and opening/closing holds',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const i=p.entries.findIndex((entry,j)=>j+1<p.entries.length&&!entry.sharedEnd);
  assert.ok(i>=0);
  assert.equal(p.entries[i].bridgeDurationMs,3600);
  assert.equal(p.entries[i+1].sharedStart,false);
  assert.equal(p.entries[i+1].sceneOverrides.introMs,undefined);
  assert.ok(p.entries[i+1].durationMs>3500);
});


test('cinematic identity preserves v9 Hopper colors and multi-traveler styles',()=>{
  const p=createHistoryPlaylist(trips,locations);
  const first=p.entries[0];
  assert.equal(first.visual.color.toLowerCase(),'#ffd60a');
  assert.equal(first.visual.traveler,'Joey');
  const duo=p.entries.find(e=>e.visual.colors.length>1);
  assert.ok(duo,'at least one trip includes two participants');
  assert.ok(duo.visual.colors.some(c=>c.toLowerCase()==='#ff4fd8'));
  assert.ok(duo.visual.colors.some(c=>c.toLowerCase()==='#ffd60a'));
  assert.ok(['ribbon','stripe'].includes(duo.visual.style));
  assert.equal(p.context(duo.startMs).visual.color,duo.visual.color);
  const full=p.completedHistory(p.totalMs);
  assert.equal(full.routeCount,p.legCount,'style splits must not inflate the logical leg count');
  assert.ok(full.routes.features.length>full.routeCount,
    'ribbon and stripe journeys create additional colored line features');
  assert.ok(full.routes.features.every(f=>/^#[0-9a-f]{6}$/i.test(f.properties.color)));
  assert.ok(full.routes.features.some(f=>f.properties.stackOffset!==0),
    'repeated corridors are visually separated in the historical archive');
  assert.ok(full.routes.features.some(f=>f.properties.color.toLowerCase()==='#ff4fd8'));
  assert.ok(p.stats().cachedScenes<=3);
});
