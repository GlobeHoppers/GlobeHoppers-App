const featureCollection = features => ({ type: 'FeatureCollection', features });

export function installCinematicLayers(map, scene) {
  if (map.getSource('cg-route-full')) return;
  const routes = featureCollection(scene.legs.map(leg => ({
    type: 'Feature',
    properties: { index: leg.index },
    geometry: { type: 'LineString', coordinates: leg.path }
  })));
  const stops = featureCollection(scene.stops.map((stop, index) => ({
    type: 'Feature',
    properties: { id: stop.id, name: stop.name, index: index + 1 },
    geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] }
  })));
  map.addSource('cg-route-full', { type: 'geojson', data: routes });
  map.addSource('cg-route-revealed', { type: 'geojson', data: featureCollection([]) });
  map.addSource('cg-stops', { type: 'geojson', data: stops });

  map.addLayer({ id: 'cg-route-faint', type: 'line', source: 'cg-route-full',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#8cd8e6', 'line-width': 1.25, 'line-opacity': 0.25 } });
  map.addLayer({ id: 'cg-route-glow', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#51e5ec', 'line-width': 9, 'line-blur': 8, 'line-opacity': 0.48 } });
  map.addLayer({ id: 'cg-route-head', type: 'line', source: 'cg-route-revealed',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#bcfbff', 'line-width': 2.8, 'line-opacity': 0.96 } });
  map.addLayer({ id: 'cg-stop-halo', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#091c27', 'circle-radius': 8, 'circle-opacity': 0.82,
             'circle-stroke-color': '#99ecf1', 'circle-stroke-width': 1.4 } });
  map.addLayer({ id: 'cg-stop-point', type: 'circle', source: 'cg-stops',
    paint: { 'circle-color': '#f6e0a4', 'circle-radius': 3.2,
             'circle-stroke-color': '#122a39', 'circle-stroke-width': 0.6 } });
  map.addLayer({ id: 'cg-stop-label', type: 'symbol', source: 'cg-stops',
    layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.8],
              'text-anchor': 'top', 'text-allow-overlap': false },
    paint: { 'text-color': '#effbff', 'text-halo-color': '#142733',
             'text-halo-width': 1.7, 'text-halo-blur': 0.5 } });
}

export function updateCinematicRoute(map, scene, ms) {
  map.getSource('cg-route-revealed')?.setData(scene.revealedRoute(ms));
}
