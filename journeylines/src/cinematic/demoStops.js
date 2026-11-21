/** Initial eight-stop cinematic demo from GlobeHoppers' own location catalog.
 * Intentionally not the user's trip database. Replace through the adapter after WP1 QA.
 */
import locations from '../data/locations.json';

export const DEMO_LOCATION_IDS = Object.freeze([
  'san-diego-ca',
  'los-angeles-ca',
  'las-vegas-nv',
  'miami-fl',
  'new-york-ny',
  'augusta-ga',
  'new-orleans-la',
  'chicago-il'
]);

export const demoStops = DEMO_LOCATION_IDS.map(id => {
  const item = locations.find(location => location.id === id);
  if (!item) throw new Error('Cinematic demo location not found: ' + id);
  return { id: item.id, name: item.name, lat: item.lat, lon: item.lon };
});
