import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCinematicScene,pathDistanceIndex,cinematicLegDurationMs } from '../src/cinematic/scene.js';
import { destinationTiles,createImageryPreflight } from '../src/cinematic/imageryPreflight.js';
import {
  LOCAL_EARTH_TILE_COUNT, LOCAL_EARTH_MAX_ZOOM,
  SCENIC_EARTH_TILE_COUNT, SCENIC_EARTH_MAX_ZOOM,
  LOCAL_EARTH_SCHEME, LOCAL_EARTH_STYLE,
  localEarthTileURL,localEarthCameraPose,mercatorRowLatitude,getLocalEarthStatus
} from '../src/cinematic/localEarth.js';

test('local Earth is finite and complete before the display starts',()=>{
  assert.equal(LOCAL_EARTH_MAX_ZOOM,5);
  assert.equal(LOCAL_EARTH_TILE_COUNT,1365);
  assert.equal(SCENIC_EARTH_MAX_ZOOM,4);
  assert.equal(SCENIC_EARTH_TILE_COUNT,341);
  assert.equal(LOCAL_EARTH_SCHEME,'cg-local-earth');
  assert.equal(localEarthTileURL(4,9,7),'cg-local-earth://4/9/7');
  assert.equal(LOCAL_EARTH_STYLE.version,8);
  assert.deepEqual(LOCAL_EARTH_STYLE.sources,{});
  assert.equal(LOCAL_EARTH_STYLE.layers[0].type,'background');
  assert.equal(getLocalEarthStatus().ready,false);
});

test('global latitude reprojection has continuous tile-row edges and correct equator',()=>{
  assert.ok(Math.abs(mercatorRowLatitude(0,0)-85.0511287798066)<1e-6);
  assert.ok(Math.abs(mercatorRowLatitude(0,128))<1e-8);
  assert.ok(Math.abs(mercatorRowLatitude(0,256)+85.0511287798066)<1e-6);
  for(let z=0;z<=5;z++){
    const n=2**z;
    for(let y=0;y<n*256;y+=32) {
      assert.ok(mercatorRowLatitude(z,y)>mercatorRowLatitude(z,y+32));
    }
  }
});

test('local Earth camera soft caps zoom continuously but leaves travel timing and bearing intact',()=>{
  for(let zoom of [1,2,4,5.55,6,7.5,9,14]){
    const pose={center:[-81,27],zoom,pitch:61,bearing:28,elapsedMs:32000,segmentType:'travel'};
    const local=localEarthCameraPose(pose);
    assert.deepEqual(local.center,pose.center);
    assert.equal(local.elapsedMs,pose.elapsedMs);
    assert.equal(local.pitch,61);
    assert.equal(local.bearing,28);
    assert.ok(local.zoom<=zoom+1e-8);
    assert.ok(local.zoom<=7.21);
    assert.deepEqual(localEarthCameraPose(pose,'satellite'),pose);
  }
  const left=localEarthCameraPose({zoom:6.15-1e-5}).zoom;
  const right=localEarthCameraPose({zoom:6.15+1e-5}).zoom;
  assert.ok(Math.abs(right-left)<.000025);
});

test('local Earth preflight makes no external imagery requests',async()=>{
  const stop={id:'sd',lat:32.71,lon:-117.16};
  assert.deepEqual(destinationTiles(stop,'local'),[]);
  let requests=0;
  const preflight=createImageryPreflight(async()=>{requests++;throw Error('unexpected request');});
  assert.equal(preflight.status(stop,'local'),'ready');
  assert.equal(await preflight.schedule(stop,'local').promise,true);
  assert.equal(requests,0);
});

test('surface route playback respects cumulative miles rather than uneven vertex indices',()=>{
  const path=[[-80,25],[-80,25.05],[-80,25.1],[-80,26.7],[-80,27],[-79.5,27.2],[-79,27]];
  const distances=pathDistanceIndex(path);
  assert.equal(distances.cumulative.length,path.length);
  assert.ok(distances.totalMiles>165);
  const stops=[
    {id:'a',name:'Origin',lon:-80,lat:25},
    {id:'b',name:'Destination',lon:-79,lat:27,modeFromPrevious:'boat',geometryFromPrevious:path}
  ];
  const scene=buildCinematicScene(stops);
  const leg=scene.legs[0];
  assert.ok(leg.pathDistance.totalMiles>100);
  assert.equal(leg.cameraTrack.length,121);
  const mid=scene.sample((leg.startMs+leg.endMs)/2);
  const plane=scene.planeAt((leg.startMs+leg.endMs)/2);
  assert.equal(mid.segmentType,'travel');
  assert.ok(Math.hypot(mid.center[0]-plane.coordinates[0],mid.center[1]-plane.coordinates[1])<.1);
  // No camera teleportation over a run of 16 ms-spaced frames.
  let previous=null,maximum=0;
  for(let ms=leg.startMs;ms<leg.endMs;ms+=16.667) {
    const p=scene.sample(ms);
    assert.ok(p.center.every(Number.isFinite));
    if(previous)maximum=Math.max(maximum,
      Math.hypot(p.center[0]-previous.center[0],p.center[1]-previous.center[1]));
    previous=p;
  }
  assert.ok(maximum<.045,'long winding route camera must not jump forward abruptly: '+maximum);
});

test('camera does not jump at the endpoints of a winding road leg',()=>{
  const points=[[-81,25],[-80.8,25.2],[-80.1,25.1],[-79.9,26.1],[-80.6,26.4],[-79.5,27]];
  const scene=buildCinematicScene([
    {id:'a',lon:-81,lat:25},{id:'b',lon:-79.5,lat:27,
      modeFromPrevious:'drive',geometryFromPrevious:points}
  ]);
  const leg=scene.legs[0];
  for(const ms of [leg.startMs,leg.endMs]){
    const near=scene.sample(ms-.01);
    const at=scene.sample(ms);
    assert.ok(Math.hypot(near.center[0]-at.center[0],
      near.center[1]-at.center[1])<.0001);
  }
});


test('long winding surface legs are given enough screen time for continuous camera travel',()=>{
  for(const mode of ['boat','drive','train']){
    assert.ok(cinematicLegDurationMs(200,mode)>5000,
      mode+' needs several seconds for smooth route-following');
    assert.ok(cinematicLegDurationMs(600,mode)<=11000);
    assert.ok(cinematicLegDurationMs(600,mode)>cinematicLegDurationMs(20,mode));
  }
  assert.ok(cinematicLegDurationMs(200,'plane')<10000,
    'existing airplane pacing stays unchanged');
});


test('scenic preserves close zoom motion and preflights bounded regional tiles',()=>{
  const p={center:[-80.5,25.6],zoom:9,pitch:60,bearing:22};
  const local=localEarthCameraPose(p,'local'),scenic=localEarthCameraPose(p,'scenic');
  assert.ok(scenic.zoom>8.55&&scenic.zoom<8.85);
  assert.ok(scenic.zoom>local.zoom+1.4);
  assert.deepEqual(scenic.center,p.center);
  assert.equal(destinationTiles({id:'miami',lat:25.7,lon:-80.2},'scenic').length,28);
  assert.deepEqual(destinationTiles({id:'miami',lat:25.7,lon:-80.2},'local'),[]);
});


test('surface camera derivatives stay continuous through route knots',()=>{
  const points=[[-81,25],[-80.9,25.5],[-80.5,25.55],[-80.7,25.7],
    [-80.1,25.9],[-80.0,26.2],[-79.5,26.4]];
  const scene=buildCinematicScene([{id:'s',lon:-81,lat:25},
    {id:'e',lon:-79.5,lat:26.4,modeFromPrevious:'drive',
      geometryFromPrevious:points}]);
  const leg=scene.legs[0];
  // Camera path has matching first derivatives on both sides of each spline knot.
  const step=leg.durationMs/120;
  for(let i=2;i<119;i++){
    const center=scene.sample(leg.startMs+i*step).center;
    const before=scene.sample(leg.startMs+i*step-.1).center;
    const after=scene.sample(leg.startMs+i*step+.1).center;
    const v0=[center[0]-before[0],center[1]-before[1]];
    const v1=[after[0]-center[0],after[1]-center[1]];
    assert.ok(Math.hypot(v1[0]-v0[0],v1[1]-v0[1])<.000015,
      'camera velocity must not make a visible kink at knot '+i);
  }
  const quarter=scene.sample(leg.startMs+.25*leg.durationMs);
  const middle=scene.sample(leg.startMs+.5*leg.durationMs);
  assert.ok(Math.abs(quarter.bearing)<=25 && Math.abs(middle.bearing)<=25);
  assert.ok(middle.zoom>quarter.zoom-.5,'close-range dolly is progressive');
});


test('surface modes are now near flight pace without modifying reviewed path geometry',()=>{
  const miles=200;
  const plane=cinematicLegDurationMs(miles,'plane');
  const drive=cinematicLegDurationMs(miles,'drive');
  const boat=cinematicLegDurationMs(miles,'boat');
  const train=cinematicLegDurationMs(miles,'train');
  assert.ok(drive<plane*1.3&&drive>plane,'driving remains cinematic without crawling');
  assert.ok(boat<plane*1.4&&boat>drive);
  assert.ok(train<plane*1.3&&train>plane);
  assert.ok(cinematicLegDurationMs(600,'drive')<8500);
});
