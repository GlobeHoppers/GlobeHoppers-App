/**
 * Future data-source boundary. No authentication, database, or editor state lives
 * in the cinematic player. Call this with a permitted, read-only trip snapshot.
 */
import { normalizeTripForV61 } from '../utils/tripModel.js';
import { normalizeCinematicStops } from './scene.js';

export function cinematicStopsFromTrip(trip, locations, homeBases = []) {
  const normalized = normalizeTripForV61(trip, homeBases);
  const byId = new Map((Array.isArray(locations) ? locations : []).map(p => [p.id, p]));
  const points = normalized.route.map(routePoint => {
    const location = byId.get(routePoint.locationId);
    if (!location) throw new Error('Missing trip location: ' + routePoint.locationId);
    return { id: routePoint.pointId, name: location.name,
             lat: location.lat, lon: location.lon };
  });
  return normalizeCinematicStops(points);
}
