/**
 * WP2 Cinematic Earth: raster imagery and atmosphere, independent of camera time.
 *
 * Keep one MapLibre map, its compiled route layers and one playback clock.
 * Preset changes modify only imagery/labels/sky; NO map.setStyle or map.easeTo.
 *
 * Imagery:
 *   NASA EOSDIS GIBS Blue Marble Next Generation: orbital mosaic (500 m).
 *   EOX Sentinel-2 Cloudless 2016: CC BY 4.0, 10 m regional imagery.
 * Respect attribution, provider traffic policies and any export conditions.
 */
export const NASA_BLUE_MARBLE_TILES =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
export const EOX_SENTINEL_2016_TILES =
  'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg';

export const EARTH_PRESETS = Object.freeze([
  Object.freeze({ id: 'scenic', name: 'Scenic Earth', detail: 'Preloaded globe + selective regional satellite', labels: 0 }),
  Object.freeze({ id: 'local', name: 'Local Earth', detail: 'Preloaded NASA globe · zero remote map tiles', labels: 0 }),
  Object.freeze({ id: 'earth', name: 'Cinematic Earth', detail: 'Natural globe + detailed satellite', labels: 0.42 }),
  Object.freeze({ id: 'satellite', name: 'Satellite', detail: 'Uncluttered real-world imagery', labels: 0 }),
  Object.freeze({ id: 'hybrid', name: 'Satellite + Labels', detail: 'Imagery with geographic context', labels: 0.9 }),
  Object.freeze({ id: 'midnight', name: 'Midnight', detail: 'Original lightweight blue map', labels: 1 })
]);
export const DEFAULT_EARTH_PRESET = 'scenic';
export const validEarthPreset = id => EARTH_PRESETS.some(preset => preset.id === id);
export const normalizedEarthPreset = id => validEarthPreset(id) ? id : DEFAULT_EARTH_PRESET;
export const activeImageryForPreset = id => {
  const preset = normalizedEarthPreset(id);
  return preset==='local' ? ['cg-earth-local'] :
    preset==='scenic' ? ['cg-earth-local','cg-earth-regional'] :
    preset==='midnight' ? [] : ['cg-earth-blue-marble', 'cg-earth-sentinel'];
};
const presetById = Object.fromEntries(EARTH_PRESETS.map(item => [item.id, item]));
const stateByMap = new WeakMap();

const LOCAL_SOURCE = 'cg-earth-local';
const REGIONAL_SOURCE = 'cg-earth-regional';
export const SCENIC_DETAIL_MAX_ZOOM = 8;
export const SCENIC_DETAIL_ENTER_ZOOM = 5.65;
export const SCENIC_DETAIL_EXIT_ZOOM = 5.3;
const NASA_SOURCE = 'cg-earth-blue-marble';
const SENTINEL_SOURCE = 'cg-earth-sentinel';
const CREDITS = {
  nasa: '<a href="https://earthobservatory.nasa.gov/features/BlueMarble">NASA Blue Marble / EOSDIS GIBS</a>',
  sentinel: '<a href="https://cloudless.eox.at/">EOX Cloudless 2016</a> (modified Copernicus Sentinel data 2016 &amp; 2017, CC BY 4.0)'
};

// Both layers coexist in one WebGL style. Overlapping raster draws blend
// continuously with zoom, while source tiles can load ahead of the camera.
// Never fade the low-resolution globe away before the detailed raster has
// loaded. NASA overzoomed imagery remains a graceful visual fallback.
const nasaOpacity = 1;
const satelliteOpacity = ['interpolate', ['linear'], ['zoom'],
  4.75, 0, 6.35, 1, 14, 1];

function setAtmosphere(map, mode) {
  if (typeof map.setSky !== 'function') return false;
  const space = mode === 'midnight';
  try {
    map.setSky({
      'sky-color': space ? '#091625' : '#050a10',
      'horizon-color': space ? '#143249' : '#23415d',
      'fog-color': space ? '#182d3d' : '#162a3b',
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'],
        0, space ? 0.45 : 0.85, 3, space ? 0.4 : 0.72, 6.5, 0]
    });
    return true;
  } catch {
    // Sky is experimental in MapLibre v5. Map imagery remains functional.
    return false;
  }
}

export function installCinematicEarth(map, selected = DEFAULT_EARTH_PRESET) {
  const preset=normalizedEarthPreset(selected);
  if (stateByMap.has(map)) return setCinematicEarthPreset(map, preset);

  if (preset==='local'||preset==='scenic') {
    map.addSource(LOCAL_SOURCE,{
      type:'raster',tiles:['cg-local-earth://{z}/{x}/{y}'],tileSize:256,
      minzoom:0,maxzoom:preset==='scenic'?4:5,
      attribution:'NASA Earth Observatory — Blue Marble: Next Generation'
    });
    map.addLayer({id:LOCAL_SOURCE,type:'raster',source:LOCAL_SOURCE,
      paint:{'raster-opacity':1,'raster-fade-duration':0,
        'raster-saturation':0.14,'raster-contrast':0.09}});
    // Scenic mode is a bounded detail layer over the complete local image.
    // Strict Local Earth creates no remote source and remains fully offline.
    if(preset==='scenic'){
      map.addSource(REGIONAL_SOURCE,{
        type:'raster',tiles:[EOX_SENTINEL_2016_TILES],tileSize:256,
        minzoom:5,maxzoom:SCENIC_DETAIL_MAX_ZOOM,attribution:CREDITS.sentinel
      });
      map.addLayer({id:REGIONAL_SOURCE,type:'raster',source:REGIONAL_SOURCE,
        layout:{visibility:'none'},
        paint:{'raster-opacity':['interpolate',['linear'],['zoom'],
          5.5,0,6.3,.96,7.2,1],
          'raster-fade-duration':620,'raster-saturation':0.2,
          'raster-contrast':0.12}});
    }
    stateByMap.set(map,{labels:[],preset,regionalVisible:false,
      skySupported:setAtmosphere(map,preset),kind:'packaged'});
    return true;
  }

  const baseLayers = (map.getStyle()?.layers || []).filter(layer => !layer.id.startsWith('cg-'));
  const labelLayers = baseLayers.filter(layer => layer.type === 'symbol')
    .map(layer => ({
      id: layer.id,
      originalOpacity: map.getPaintProperty(layer.id, 'text-opacity') ?? 1
    }));
  const beforeId = baseLayers.find(layer => layer.type === 'symbol')?.id;

  map.addSource(NASA_SOURCE, {
    type: 'raster', tiles: [NASA_BLUE_MARBLE_TILES], tileSize: 256,
    minzoom: 0, maxzoom: 8, attribution: CREDITS.nasa
  });
  map.addSource(SENTINEL_SOURCE, {
    type: 'raster', tiles: [EOX_SENTINEL_2016_TILES], tileSize: 256,
    minzoom: 5, maxzoom: 14, attribution: CREDITS.sentinel
  });

  map.addLayer({
    id: NASA_SOURCE, type: 'raster', source: NASA_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': nasaOpacity, 'raster-fade-duration': 350,
      'raster-saturation': 0.15, 'raster-contrast': 0.08 }
  }, beforeId);
  map.addLayer({
    id: SENTINEL_SOURCE, type: 'raster', source: SENTINEL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'raster-opacity': satelliteOpacity, 'raster-fade-duration': 400,
      'raster-saturation': 0.22, 'raster-contrast': 0.13 }
  }, beforeId);

  stateByMap.set(map, { labels: labelLayers, preset: null, skySupported: false });
  return setCinematicEarthPreset(map, preset);
}

export function setCinematicEarthPreset(map, requested) {
  const state = stateByMap.get(map);
  if (!state) return false;
  const preset = normalizedEarthPreset(requested);
  if (state.kind==='packaged') return preset===state.preset;
  if (preset==='local'||preset==='scenic') return false; // Requires one controlled renderer rebuild.
  const config = presetById[preset];

  if (state.preset === preset) return true;
  const hasImagery = preset !== 'midnight';
  const visibility = hasImagery ? 'visible' : 'none';

  for (const id of [NASA_SOURCE, SENTINEL_SOURCE]) {
    map.setLayoutProperty(id, 'visibility', visibility);
  }
  if (hasImagery) {
    // Zoom crossfade is evaluated by WebGL without React rerenders.
    map.setPaintProperty(NASA_SOURCE, 'raster-opacity', nasaOpacity);
    map.setPaintProperty(SENTINEL_SOURCE, 'raster-opacity', satelliteOpacity);
  }
  // Base style labels remain under our route labels and never reinitialize the map.
  for (const label of state.labels) {
    map.setPaintProperty(label.id, 'text-opacity',
      preset === 'midnight' ? label.originalOpacity : config.labels);
  }
  state.skySupported = setAtmosphere(map, preset);
  state.preset = preset;
  return true;
}

/** Hysteresis prevents satellite source thrash when zooming near the threshold. */
export function updateScenicRegionalDetail(map,zoom) {
  const state=stateByMap.get(map);
  if(state?.preset!=='scenic'||!Number.isFinite(zoom))return false;
  const visible=zoom >= (state.regionalVisible?SCENIC_DETAIL_EXIT_ZOOM:SCENIC_DETAIL_ENTER_ZOOM);
  if(visible!==state.regionalVisible){
    map.setLayoutProperty(REGIONAL_SOURCE,'visibility',visible?'visible':'none');
    state.regionalVisible=visible;
  }
  return state.regionalVisible;
}

export function getCinematicEarthState(map) {
  const state = stateByMap.get(map);
  return {
    preset: state?.preset ?? null,
    installed: Boolean(state),
    sourceIds: state ? (state.kind==='packaged' ? (state.preset==='scenic'?[LOCAL_SOURCE,REGIONAL_SOURCE]:[LOCAL_SOURCE]) : [NASA_SOURCE,SENTINEL_SOURCE]) : [],
    activeLayers: state ? activeImageryForPreset(state.preset) : [],
    skySupported: state?.skySupported ?? false,
    labelLayerCount: state?.labels.length ?? 0,
    local: state?.kind==='packaged',
    regionalDetail: state?.preset==='scenic' ? {visible:state.regionalVisible,
      maxNativeZoom:SCENIC_DETAIL_MAX_ZOOM,enterZoom:SCENIC_DETAIL_ENTER_ZOOM,
      exitZoom:SCENIC_DETAIL_EXIT_ZOOM} : null
  };
}
