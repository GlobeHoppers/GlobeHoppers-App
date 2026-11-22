import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_PRESETS, DEFAULT_EARTH_PRESET,
  NASA_BLUE_MARBLE_TILES, EOX_SENTINEL_2016_TILES,
  activeImageryForPreset, normalizedEarthPreset,
  installCinematicEarth, setCinematicEarthPreset, getCinematicEarthState
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
    'local', 'earth', 'satellite', 'hybrid', 'midnight'
  ]);
  assert.equal(DEFAULT_EARTH_PRESET, 'local');
  assert.equal(normalizedEarthPreset('midnight'), 'midnight');
  assert.equal(normalizedEarthPreset('invalid-id'), 'local');
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
  assert.equal(getCinematicEarthState(map).preset, 'local');
  assert.equal(installCinematicEarth(map, 'satellite'), false,
    'local-to-remote preset change requires a controlled map rebuild');
  assert.equal(map.sources.size, 1);
  assert.equal(map.layers.size, 5);
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
  assert.equal(source.maxzoom,4);
  assert.equal(map.sources.size,1);
  assert.equal(map.layouts.size,0);
  assert.equal(getCinematicEarthState(map).local,true);
  assert.equal(getCinematicEarthState(map).labelLayerCount,0);
});
