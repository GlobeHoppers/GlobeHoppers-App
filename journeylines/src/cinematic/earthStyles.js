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
  Object.freeze({ id: 'earth', name: 'Cinematic Earth', detail: 'Natural globe + detailed satellite', labels: 0.42 }),
  Object.freeze({ id: 'satellite', name: 'Satellite', detail: 'Uncluttered real-world imagery', labels: 0 }),
  Object.freeze({ id: 'hybrid', name: 'Satellite + Labels', detail: 'Imagery with geographic context', labels: 0.9 }),
  Object.freeze({ id: 'midnight', name: 'Midnight', detail: 'Original lightweight blue map', labels: 1 })
]);
export const DEFAULT_EARTH_PRESET = 'earth';
export const validEarthPreset = id => EARTH_PRESETS.some(preset => preset.id === id);
export const normalizedEarthPreset = id => validEarthPreset(id) ? id : DEFAULT_EARTH_PRESET;
export const activeImageryForPreset = id => normalizedEarthPreset(id) === 'midnight'
  ? [] : ['cg-earth-blue-marble', 'cg-earth-sentinel'];
const presetById = Object.fromEntries(EARTH_PRESETS.map(item => [item.id, item]));
const stateByMap = new WeakMap();

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
  if (stateByMap.has(map)) return setCinematicEarthPreset(map, selected);

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
  return setCinematicEarthPreset(map, selected);
}

export function setCinematicEarthPreset(map, requested) {
  const state = stateByMap.get(map);
  if (!state) return false;
  const preset = normalizedEarthPreset(requested);
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

export function getCinematicEarthState(map) {
  const state = stateByMap.get(map);
  return {
    preset: state?.preset ?? null,
    installed: Boolean(state),
    sourceIds: state ? [NASA_SOURCE, SENTINEL_SOURCE] : [],
    activeLayers: state ? activeImageryForPreset(state.preset) : [],
    skySupported: state?.skySupported ?? false,
    labelLayerCount: state?.labels.length ?? 0
  };
}
