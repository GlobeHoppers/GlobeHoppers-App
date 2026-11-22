/**
 * GeoJSON sources only. The airplane and destination emphasis are rendered in
 * actorOverlay.js on every camera frame, never at this source-update cadence.
 */
import {coloredRouteFeatures} from './routeVisuals.js';
const collection = features => ({ type: 'FeatureCollection', features });
const point = (coordinates, properties) => ({
  type: 'Feature', properties, geometry: { type: 'Point', coordinates }
});
const metadata = new WeakMap();

function stopFeatures(stops) {
  return collection(stops.map((stop, index) => point([stop.lon, stop.lat], {
    id: stop.id, name: stop.name, index: index + 1
  })));
}

function routeFeatures(legs,visual) {
  return collection(legs.flatMap(leg =>
    coloredRouteFeatures(leg.path,visual,{index:leg.index,mode:leg.mode})));
}
function revealedRouteFeatures(active,visual){
  return collection(active.features.flatMap(feature=>
    coloredRouteFeatures(feature.geometry.coordinates,visual,feature.properties)));
}

function arrivalFeatures(arrival) {
  if (!arrival) return collection([]);
  return collection([0, 1].flatMap(ring => {
    const ageMs = arrival.ageMs - ring * 200;
    if (ageMs < 0) return [];
    const progress = Math.min(1, ageMs / 1260);
    if (progress >= 1) return [];
    return [point([arrival.stop.lon, arrival.stop.lat], {
      radius: 7 + 58 * progress,
      opacity: 0.78 * Math.pow(1 - progress, 1.5)
    })];
  }));
}

export function installCinematicLayers(map, scene) {
  if (map.getSource('cg-route-full')) return;
  metadata.set(map, { routes: -1, stops: -1, completed: -1,
    historyCount:-1, trailActive: false, arrivalActive: false,
    stacking:true });
  map.addSource('cg-history-routes',{type:'geojson',data:collection([])});
  map.addSource('cg-history-stops',{type:'geojson',data:collection([])});
  map.addSource('cg-route-full', { type: 'geojson', data: collection([]) });
  map.addSource('cg-route-completed', { type: 'geojson', data: collection([]) });
  map.addSource('cg-route-revealed', { type: 'geojson', data: collection([]) });
  map.addSource('cg-stops', { type: 'geojson', data: collection([]) });
  map.addSource('cg-arrival-rings', { type: 'geojson', data: collection([]) });

  // Completed TRIPS, unlike completed LEGS in the active scene, remain
  // visible as a subdued geographic memory throughout the exhibit. This
  // single static archive updates at trip boundaries, not every animation
  // frame; the existing active route layers remain above it.
  map.addLayer({id:'cg-history-route',type:'line',source:'cg-history-routes',
    layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':['coalesce',['get','color'],'#7bbed0'],
      'line-width':1.7,'line-opacity':0.52,
      'line-offset':['coalesce',['get','stackOffset'],0]}});
  map.addLayer({id:'cg-history-halo',type:'circle',source:'cg-history-stops',
    paint:{'circle-color':'#0a2231','circle-radius':4.2,
      'circle-opacity':0.72,'circle-stroke-color':'#7bd0d8',
      'circle-stroke-width':1.0,'circle-stroke-opacity':0.67}});
  map.addLayer({id:'cg-history-center',type:'circle',source:'cg-history-stops',
    paint:{'circle-radius':1.55,'circle-color':'#e6fbff','circle-opacity':0.76}});
  // An unrevealed route only appears when its flight starts.
  map.addLayer({ id: 'cg-route-faint', type: 'line', source: 'cg-route-full',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color':['coalesce',['get','color'],'#8cd8e6'],
      'line-width': 1.15, 'line-opacity': 0.25,
      'line-offset':['coalesce',['get','stackOffset'],0] } });
  // Completed trails are static, avoiding repeated serialization on each frame.
  map.addLayer({ id: 'cg-route-completed', type: 'line', source: 'cg-route-completed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color':['coalesce',['get','color'],'#9beaf2'],
      'line-width': 2.3, 'line-opacity': 0.70,
      'line-offset':['coalesce',['get','stackOffset'],0] } });
  map.addLayer({ id: 'cg-route-glow', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color':['coalesce',['get','color'],'#51e5ec'],
      'line-width': 8, 'line-blur': 7,
             'line-opacity': 0.54 } });
  map.addLayer({ id: 'cg-route-head', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color':['coalesce',['get','color'],'#d5fdff'],
      'line-width': 2.8, 'line-opacity': 0.97,
      'line-offset':['coalesce',['get','stackOffset'],0] } });

  map.addLayer({ id: 'cg-arrival-rings', type: 'circle', source: 'cg-arrival-rings',
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': '#54e6f1',
      'circle-opacity': 0,
      'circle-stroke-color': '#d4feff',
      'circle-stroke-width': 2.2,
      'circle-stroke-opacity': ['get', 'opacity']
    } });
  map.addLayer({ id: 'cg-stop-halo', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#091c27', 'circle-radius': 8,
             'circle-opacity': 0.82, 'circle-stroke-color': '#99ecf1',
             'circle-stroke-width': 1.4 } });
  map.addLayer({ id: 'cg-stop-point', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#f6e0a4', 'circle-radius': 3.2,
             'circle-stroke-color': '#122a39', 'circle-stroke-width': 0.6 } });
  // Local Earth is fully self-contained and intentionally has no glyph endpoint.
  // City names are projected in the compositor overlay without remote fonts.
  if (map.getStyle()?.glyphs) map.addLayer({ id: 'cg-stop-label', type: 'symbol', source: 'cg-stops',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12,
              'text-offset': [0, 1.85], 'text-anchor': 'top',
              'text-allow-overlap': false },
    paint: { 'text-color': '#effbff', 'text-halo-color': '#142733',
             'text-halo-width': 1.7, 'text-halo-blur': 0.5 } });
}

export function updateCinematicRoute(map, scene, ms) {
  const state = metadata.get(map);
  if (!state) return;
  if (state.scene !== scene) {
    // A new trip must not retain the previous trip's completed trails.
    state.scene = scene; state.routes = -1; state.stops = -1;
    state.completed = -1; state.trailActive = true; state.arrivalActive = true;
  }
  const routes = scene.visibleRoutes(ms);
  const stops = scene.visibleStops(ms);
  if (routes.length !== state.routes) {
    map.getSource('cg-route-full')?.setData(routeFeatures(routes,scene.visual));
    state.routes = routes.length;
  }
  if (stops.length !== state.stops) {
    map.getSource('cg-stops')?.setData(stopFeatures(stops));
    state.stops = stops.length;
  }

  const completed = scene.legs.filter(leg => ms >= leg.endMs);
  if (completed.length !== state.completed) {
    map.getSource('cg-route-completed')?.setData(routeFeatures(completed,scene.visual));
    state.completed = completed.length;
  }

  const active = scene.activeRouteAt(ms);
  if (active.features.length || state.trailActive) {
    map.getSource('cg-route-revealed')?.setData(revealedRouteFeatures(active,scene.visual));
  }
  state.trailActive = active.features.length > 0;

  const arrival = scene.arrivalAt(ms);
  if (arrival || state.arrivalActive) {
    map.getSource('cg-arrival-rings')?.setData(arrivalFeatures(arrival));
  }
  state.arrivalActive = Boolean(arrival);
}

export function clearCinematicRoute(map) {
  const state = metadata.get(map);
  if (!state || state.scene === null) return;
  state.scene = null; state.routes = -1; state.stops = -1;
  state.completed = -1; state.trailActive = false; state.arrivalActive = false;
  const empty = { type: 'FeatureCollection', features: [] };
  for (const id of ['cg-route-full','cg-route-completed','cg-route-revealed',
    'cg-stops','cg-arrival-rings']) map.getSource(id)?.setData(empty);
}

/**
 * Static global history layer. Only replaces GeoJSON when the number of
 * completed trips changes. Bridge transitions include the just-finished trip;
 * no earlier line or destination disappears between trips.
 */
export function updateCinematicHistory(map,playlist,ms){
  const state=metadata.get(map);
  if(!state||typeof playlist.completedHistory!=='function')return;
  const history=playlist.completedHistory(ms);
  if(state.historyCount===history.count)return;
  map.getSource('cg-history-routes')?.setData(history.routes);
  map.getSource('cg-history-stops')?.setData(history.stops);
  state.historyCount=history.count;
}

/**
 * Presentation toggle only. Applied to archived paths, never to the vehicle
 * trajectory or flight camera. Pure MapLibre paint update; no GeoJSON churn.
 */
export function setCinematicRouteStacking(map,enabled){
  const state=metadata.get(map);
  if(!state)return false;
  state.stacking=Boolean(enabled);
  map.setPaintProperty('cg-history-route','line-offset',
    state.stacking?['coalesce',['get','stackOffset'],0]:0);
  return state.stacking;
}
