import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_PRESETS, DEFAULT_EARTH_PRESET,
  NASA_BLUE_MARBLE_TILES, EOX_SENTINEL_2016_TILES,
  activeImageryForPreset, normalizedEarthPreset,
  installCinematicEarth, setCinematicEarthPreset, updateScenicRegionalDetail, getCinematicEarthState,SCENIC_REGIONAL_TILE_TEMPLATE
} from '../src/cinematic/earthStyles.js';

function mockMap() {
  const sources = new Map();
  const baseLayers = [
    { id: 'background', type: 'background' },
    { id: 'land', type: 'fill' },
    { id: 'place-labels', type: 'symbol' },
    { id: 'road-labels', type: 'symbol' }
  ];
  const layers = new Map(baseLayers.map(layer => [layer.id, structuredClone(layer)]));
  const paint = new Map([['place-labels:text-opacity', ['interpolate', ['linear'], ['zoom'], 1, .4, 8, 1]]]);
  const layouts = new Map();
  const calls = [];
  let sky;
  return {
    calls, paint, layouts, sources, layers,
    getStyle: () => ({ layers: [...layers.values()] }),
    getPaintProperty: (id, key) => paint.get(id + ':' + key),
    getLayer: id => layers.get(id),
    addSource(id, source) { assert.ok(!sources.has(id)); sources.set(id, source); calls.push(['addSource', id]); },
    addLayer(layer, before) {
      assert.ok(!layers.has(layer.id));
      assert.ok(!before || layers.has(before));
      layers.set(layer.id, layer);
      calls.push(['addLayer', layer.id, before]);
    },
    setPaintProperty(id, key, value) {
      assert.ok(layers.has(id));
      paint.set(id + ':' + key, value);
      calls.push(['paint', id, key]);
    },
    setLayoutProperty(id, key, value) {
      assert.ok(layers.has(id));
      layouts.set(id + ':' + key, value);
      calls.push(['layout', id, key]);
    },
    setSky(config) { sky = config; calls.push(['setSky']); },
    get sky() { return sky; }
  };
}

test('all WP2 presets are unique, bounded and have safe defaults', () => {
  assert.deepEqual(EARTH_PRESETS.map(preset => preset.id), [
    'scenic', 'local', 'earth', 'satellite', 'hybrid', 'midnight'
  ]);
  assert.equal(DEFAULT_EARTH_PRESET, 'scenic');
  assert.equal(normalizedEarthPreset('midnight'), 'midnight');
  assert.equal(normalizedEarthPreset('invalid-id'), 'scenic');
  assert.deepEqual(activeImageryForPreset('scenic'),['cg-earth-local','cg-earth-regional']);
  assert.deepEqual(activeImageryForPreset('local'), ['cg-earth-local']);
  assert.deepEqual(activeImageryForPreset('midnight'), []);
  assert.deepEqual(activeImageryForPreset('earth'),
    ['cg-earth-blue-marble', 'cg-earth-sentinel']);
});

test('public NASA and CC BY 4.0 Sentinel-2 2016 endpoints are explicit and provider-isolated', () => {
  assert.match(NASA_BLUE_MARBLE_TILES, /^https:\/\/gibs\.earthdata\.nasa\.gov\/wmts\/epsg3857\/best\/BlueMarble_NextGeneration\//);
  assert.match(EOX_SENTINEL_2016_TILES, /^https:\/\/tiles\.maps\.eox\.at\/wmts\/1\.0\.0\/s2cloudless_3857\//);
  for (const template of [NASA_BLUE_MARBLE_TILES, EOX_SENTINEL_2016_TILES]) {
    assert.ok(template.includes('{z}/{y}/{x}'));
    assert.ok(!template.includes('mult.dev'));
    assert.ok(!template.includes('api_key'));
  }
});

test('install layers above basemap fills, below labels, without replacing the map style', () => {
  const map = mockMap();
  assert.equal(installCinematicEarth(map,'earth'), true);
  assert.equal(map.sources.size, 2);
  assert.equal(map.layers.size, 6);
  const nasa = map.sources.get('cg-earth-blue-marble');
  const sentinel = map.sources.get('cg-earth-sentinel');
  assert.equal(nasa.maxzoom, 8);
  assert.equal(sentinel.minzoom, 5);
  assert.equal(sentinel.maxzoom, 14);
  assert.match(sentinel.attribution, /CC BY 4.0/);
  assert.deepEqual(map.calls.filter(call => call[0] === 'addLayer'),
    [['addLayer', 'cg-earth-blue-marble', 'place-labels'],
     ['addLayer', 'cg-earth-sentinel', 'place-labels']]);
  assert.deepEqual(getCinematicEarthState(map).activeLayers,
    ['cg-earth-blue-marble', 'cg-earth-sentinel']);
  assert.equal(getCinematicEarthState(map).skySupported, true);
  assert.ok(map.sky['atmosphere-blend']);
});

test('preset changes preserve map sources, route layers and native label styles', () => {
  const map = mockMap();
  const originalLabel = structuredClone(map.getPaintProperty('place-labels', 'text-opacity'));
  installCinematicEarth(map, 'hybrid');
  const sourceCount = map.sources.size;
  const layerCount = map.layers.size;
  assert.equal(map.getPaintProperty('place-labels', 'text-opacity'), .9);

  setCinematicEarthPreset(map, 'satellite');
  assert.equal(map.getPaintProperty('place-labels', 'text-opacity'), 0);
  assert.equal(map.layouts.get('cg-earth-sentinel:visibility'), 'visible');

  setCinematicEarthPreset(map, 'midnight');
  assert.equal(map.layouts.get('cg-earth-sentinel:visibility'), 'none');
  assert.equal(map.layouts.get('cg-earth-blue-marble:visibility'), 'none');
  assert.deepEqual(map.getPaintProperty('place-labels', 'text-opacity'), originalLabel);
  assert.equal(map.getPaintProperty('road-labels', 'text-opacity'), 1);
  assert.deepEqual(getCinematicEarthState(map).activeLayers, []);
  assert.equal(map.sources.size, sourceCount);
  assert.equal(map.layers.size, layerCount);

  setCinematicEarthPreset(map, 'earth');
  assert.equal(map.layouts.get('cg-earth-blue-marble:visibility'), 'visible');
  assert.equal(map.getPaintProperty('place-labels', 'text-opacity'), .42);
  // Switching presets MUST NOT call setStyle() or reconstruct the base scene.
  assert.equal(map.calls.filter(call => call[0] === 'addLayer').length, 2);
});

test('invalid presets cannot be injected, installed sources remain idempotent', () => {
  const map = mockMap();
  assert.equal(setCinematicEarthPreset(map, 'earth'), false);
  installCinematicEarth(map, 'bad');
  assert.equal(getCinematicEarthState(map).preset, 'scenic');
  assert.equal(installCinematicEarth(map, 'satellite'), false,
    'local-to-remote preset change requires a controlled map rebuild');
  assert.equal(map.sources.size, 2);
  assert.equal(map.layers.size, 6);
});

test('globe imagery automatically crossfades between NASA and satellite near zoom 5-6', () => {
  const map = mockMap();
  installCinematicEarth(map,'earth');
  const nasa = map.paint.get('cg-earth-blue-marble:raster-opacity');
  const sentinel = map.paint.get('cg-earth-sentinel:raster-opacity');
  assert.equal(nasa, 1);
  assert.equal(sentinel[0], 'interpolate');
  assert.equal(nasa, 1);
  assert.equal(sentinel.at(-1), 1);
  assert.equal(nasa, 1);
  assert.ok(sentinel.includes(4.75) && sentinel.includes(6.35));
});


test('local Earth installs one packaged raster source without remote map tiles',()=>{
  const map=mockMap();
  assert.equal(installCinematicEarth(map,'local'),true);
  const source=map.sources.get('cg-earth-local');
  assert.ok(source);
  assert.deepEqual(source.tiles,['cg-local-earth://{z}/{x}/{y}']);
  assert.equal(source.maxzoom,5);
  assert.equal(map.sources.size,1);
  assert.equal(map.layouts.size,0);
  assert.equal(getCinematicEarthState(map).local,true);
  assert.equal(getCinematicEarthState(map).labelLayerCount,0);
});


test('scenic regional detail is bounded, hysteretic, and retains global imagery',()=>{
  const map=mockMap();
  assert.equal(installCinematicEarth(map,'scenic'),true);
  assert.equal(map.sources.size,2);
  assert.equal(map.sources.get('cg-earth-regional').maxzoom,8);
  assert.equal(map.sources.get('cg-earth-regional').minzoom,3);
  assert.deepEqual(map.sources.get('cg-earth-regional').tiles,[SCENIC_REGIONAL_TILE_TEMPLATE]);
  assert.equal(map.sources.get('cg-earth-local').maxzoom,4);
  assert.deepEqual(getCinematicEarthState(map).activeLayers,['cg-earth-local','cg-earth-regional']);
  assert.equal(updateScenicRegionalDetail(map,3.4),false);
  assert.equal(updateScenicRegionalDetail(map,4.2),true);
  const count=map.calls.length;
  assert.equal(updateScenicRegionalDetail(map,3.45),true);
  assert.equal(map.calls.length,count);
  assert.equal(updateScenicRegionalDetail(map,3.1),false);
  assert.equal(map.layouts.get('cg-earth-regional:visibility'),'none');
  assert.equal(setCinematicEarthPreset(map,'local'),false);
});


test('scenic tile URLs are bounded to the approved 2016 EOX service',async()=>{
  const {scenicRemoteTileURL}=await import('../src/cinematic/scenicTileCache.js');
  assert.equal(scenicRemoteTileURL(4,2,6),
    EOX_SENTINEL_2016_TILES.replace('{z}','4').replace('{x}','2').replace('{y}','6'));
  assert.throws(()=>scenicRemoteTileURL(9,0,0),/bounds/);
  assert.throws(()=>scenicRemoteTileURL(4,16,0),/bounds/);
});

test('regional tile cache reuses JPEG bytes across requests without another network fetch',async()=>{
  const {loadScenicTile,SCENIC_TILE_CACHE,MAX_SCENIC_CACHED_TILES}=
    await import('../src/cinematic/scenicTileCache.js');
  assert.equal(MAX_SCENIC_CACHED_TILES,1152);
  const records=new Map();
  const stored={
    match:async url=>records.get(url)?.clone()||null,
    put:async(url,resp)=>{records.set(url,resp.clone());},
    keys:async()=>[...records.keys()].map(url=>({url})),
    delete:async request=>records.delete(request.url)
  };
  const cacheStorage={open:async name=>{
    assert.equal(name,SCENIC_TILE_CACHE);return stored;
  }};
  let requests=0;
  const jpeg=new Uint8Array([255,216,255,224,0,1,255,217]);
  const fetchImpl=async()=>{requests++;return new Response(jpeg,{
    status:200,headers:{'content-type':'image/jpeg'}
  });};
  const url=EOX_SENTINEL_2016_TILES.replace('{z}','4')
    .replace('{y}','4').replace('{x}','3');
  const options={cacheStorage,fetchImpl,now:()=>100000000};
  assert.deepEqual(await loadScenicTile(url,options),jpeg);
  assert.deepEqual(await loadScenicTile(url,options),jpeg);
  assert.equal(requests,1,'browser persistent tile should be served without refetch');
  await assert.rejects(loadScenicTile('https://untrusted.example/4/4/4.jpg',options),
    /Unapproved/);
});


test('preflight across multiple scenic locations shares the four-request global ceiling',async()=>{
  const {createImageryPreflight,destinationTiles,
    SCENIC_DESTINATION_TILE_BUDGET,SCENIC_CORRIDOR_TILE_BUDGET}=
    await import('../src/cinematic/imageryPreflight.js');
  assert.equal(SCENIC_DESTINATION_TILE_BUDGET,90);
  assert.equal(SCENIC_CORRIDOR_TILE_BUDGET,20);
  let active=0,maxActive=0;
  const preflight=createImageryPreflight(async()=>{
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,1));active--;
  });
  const a={id:'a',lat:25.75,lon:-80.2},b={id:'b',lat:34.05,lon:-118.24};
  const jobs=[preflight.schedule(a,'scenic'),
    preflight.schedule(b,'scenic'),
    preflight.schedule({id:'mid',lat:28,lon:-81},'scenic','corridor')];
  await Promise.all(jobs.map(j=>j.promise));
  assert.ok(maxActive<=4,'provider requests from concurrent scenes must stay bounded');
  assert.ok(jobs[0].attempted<=SCENIC_DESTINATION_TILE_BUDGET);
  assert.ok(jobs[2].attempted<=SCENIC_CORRIDOR_TILE_BUDGET);
  assert.equal(new Set(destinationTiles(a,'scenic')).size,jobs[0].attempted);
});


test('cinematic historical stacking is a paint-only toggle',async()=>{
  const {installCinematicLayers,setCinematicRouteStacking}=
    await import('../src/cinematic/mapLayers.js');
  const map=mockMap();
  map.getSource=id=>map.sources.get(id);
  installCinematicLayers(map,null);
  const layer=map.layers.get('cg-history-route');
  assert.equal(layer.paint['line-color'][0],'coalesce');
  assert.equal(layer.paint['line-offset'][0],'coalesce');
  assert.equal(setCinematicRouteStacking(map,false),false);
  assert.equal(map.paint.get('cg-history-route:line-offset'),0);
  assert.equal(setCinematicRouteStacking(map,true),true);
  assert.equal(map.paint.get('cg-history-route:line-offset')[0],'coalesce');
  const {coloredRouteFeatures,routeStackKey,stackOffsetForOccurrence}=
    await import('../src/cinematic/routeVisuals.js');
  const path=[[-80,26],[-80.3,26.2],[-80.6,27]];
  const visual={color:'#ffd60a',colors:['#ffd60a','#ff4fd8'],style:'ribbon'};
  const features=coloredRouteFeatures(path,visual,{tripId:'demo'},3);
  assert.equal(features.length,2);
  assert.deepEqual(features.map(f=>f.properties.color),visual.colors);
  assert.deepEqual(features[0].geometry.coordinates,path);
  assert.ok(features[0].properties.stackOffset<features[1].properties.stackOffset);
  assert.equal(routeStackKey({lon:-80,lat:26},{lon:-80.6,lat:27}),
    routeStackKey({lon:-80.6,lat:27},{lon:-80,lat:26}));
  assert.equal(stackOffsetForOccurrence(0),0);
  assert.ok(stackOffsetForOccurrence(1)>0&&stackOffsetForOccurrence(2)<0);
  const stripes=coloredRouteFeatures(path,{...visual,style:'stripe'});
  assert.ok(stripes.length>=8);
  assert.ok(stripes.some(f=>f.properties.color==='#ff4fd8'));
});
