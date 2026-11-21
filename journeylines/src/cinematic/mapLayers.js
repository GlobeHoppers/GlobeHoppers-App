/**
 * Cinematic map presentation only. The scene planner owns all decisions.
 * Geographic markers, aircraft and arrival rings are time-derived GeoJSON.
 */
const collection = features => ({ type: 'FeatureCollection', features });
const point = (coordinates, properties) => ({
  type: 'Feature', properties, geometry: { type: 'Point', coordinates }
});
const mapCounts = new WeakMap();

function createAircraftIcon() {
  // Independently drawn vector silhouette, rasterized locally into an atlas image.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to draw aircraft icon');
  ctx.translate(64, 64);
  ctx.shadowColor = '#2ceaf5';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#e9fcff';
  ctx.strokeStyle = '#13394d';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  // Nose points north. MapLibre rotates the silhouette to the local track tangent.
  ctx.beginPath();
  ctx.moveTo(0, -53);
  ctx.bezierCurveTo(7, -53, 9, -40, 10, -20);
  ctx.lineTo(49, 10);
  ctx.quadraticCurveTo(53, 15, 46, 19);
  ctx.lineTo(12, 11);
  ctx.lineTo(10, 35);
  ctx.lineTo(23, 44);
  ctx.lineTo(23, 51);
  ctx.lineTo(0, 46);
  ctx.lineTo(-23, 51);
  ctx.lineTo(-23, 44);
  ctx.lineTo(-10, 35);
  ctx.lineTo(-12, 11);
  ctx.lineTo(-46, 19);
  ctx.quadraticCurveTo(-53, 15, -49, 10);
  ctx.lineTo(-10, -20);
  ctx.bezierCurveTo(-9, -40, -7, -53, 0, -53);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.fillStyle = '#45d8e9';
  ctx.beginPath();
  ctx.ellipse(0, -31, 4.2, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, 128, 128);
}

function stopFeatures(stops) {
  return collection(stops.map((stop, index) =>
    point([stop.lon, stop.lat], { id: stop.id, name: stop.name, index: index + 1 })));
}

function routeFeatures(legs) {
  return collection(legs.map(leg => ({
    type: 'Feature', properties: { index: leg.index },
    geometry: { type: 'LineString', coordinates: leg.path }
  })));
}

function arrivalFeatures(arrival) {
  if (!arrival) return collection([]);
  return collection([0, 1].flatMap(ring => {
    const ageMs = arrival.ageMs - ring * 200;
    if (ageMs < 0) return [];
    const progress = Math.min(1, ageMs / 1260);
    if (progress >= 1) return [];
    return [point([arrival.stop.lon, arrival.stop.lat], {
      radius: 8 + 66 * progress,
      opacity: 0.87 * Math.pow(1 - progress, 1.35)
    })];
  }));
}

export function installCinematicLayers(map, scene) {
  if (map.getSource('cg-route-full')) return;
  mapCounts.set(map, { routes: -1, stops: -1 });
  map.addSource('cg-route-full', { type: 'geojson', data: collection([]) });
  map.addSource('cg-route-revealed', { type: 'geojson', data: collection([]) });
  map.addSource('cg-stops', { type: 'geojson', data: collection([]) });
  map.addSource('cg-arrival-rings', { type: 'geojson', data: collection([]) });
  map.addSource('cg-aircraft', { type: 'geojson', data: collection([]) });
  map.addImage('cg-aircraft-icon', createAircraftIcon(), { pixelRatio: 2 });

  map.addLayer({ id: 'cg-route-faint', type: 'line', source: 'cg-route-full',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8cd8e6', 'line-width': 1.3, 'line-opacity': 0.28 } });
  map.addLayer({ id: 'cg-route-glow', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#51e5ec', 'line-width': 9, 'line-blur': 7, 'line-opacity': 0.54 } });
  map.addLayer({ id: 'cg-route-head', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#d5fdff', 'line-width': 3, 'line-opacity': 0.97 } });

  // Pulse rings are geographic, so the effect stays attached to the destination.
  map.addLayer({ id: 'cg-arrival-rings', type: 'circle', source: 'cg-arrival-rings',
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': '#54e6f1',
      'circle-opacity': 0,
      'circle-stroke-color': '#d4feff',
      'circle-stroke-width': 2.6,
      'circle-stroke-opacity': ['get', 'opacity']
    } });
  map.addLayer({ id: 'cg-stop-halo', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#091c27', 'circle-radius': 8, 'circle-opacity': 0.82,
             'circle-stroke-color': '#99ecf1', 'circle-stroke-width': 1.4 } });
  map.addLayer({ id: 'cg-stop-point', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#f6e0a4', 'circle-radius': 3.2,
             'circle-stroke-color': '#122a39', 'circle-stroke-width': 0.6 } });
  map.addLayer({ id: 'cg-stop-label', type: 'symbol', source: 'cg-stops',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12,
              'text-offset': [0, 1.85], 'text-anchor': 'top',
              'text-allow-overlap': false },
    paint: { 'text-color': '#effbff', 'text-halo-color': '#142733',
             'text-halo-width': 1.7, 'text-halo-blur': 0.5 } });

  // The icon is viewport-facing and follows its actual route tangent.
  map.addLayer({ id: 'cg-aircraft-symbol', type: 'symbol', source: 'cg-aircraft',
    layout: { 'icon-image': 'cg-aircraft-icon', 'icon-size': 0.77,
              'icon-rotate': ['get', 'bearing'],
              'icon-rotation-alignment': 'map',
              'icon-pitch-alignment': 'viewport',
              'icon-allow-overlap': true, 'icon-ignore-placement': true } });
}

export function updateCinematicRoute(map, scene, ms) {
  const counts = mapCounts.get(map);
  if (!counts) return;
  const visibleRoutes = scene.visibleRoutes(ms);
  const visibleStops = scene.visibleStops(ms);
  if (visibleRoutes.length !== counts.routes) {
    map.getSource('cg-route-full')?.setData(routeFeatures(visibleRoutes));
    counts.routes = visibleRoutes.length;
  }
  if (visibleStops.length !== counts.stops) {
    map.getSource('cg-stops')?.setData(stopFeatures(visibleStops));
    counts.stops = visibleStops.length;
  }
  map.getSource('cg-route-revealed')?.setData(scene.revealedRoute(ms));
  const aircraft = scene.planeAt(ms);
  map.getSource('cg-aircraft')?.setData(collection(aircraft
    ? [point(aircraft.coordinates, { bearing: aircraft.bearing })] : []));
  map.getSource('cg-arrival-rings')?.setData(arrivalFeatures(scene.arrivalAt(ms)));
}
