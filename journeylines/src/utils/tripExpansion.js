import { milesBetween } from './distanceUtils.js';

export function activeHomeBase(homeBases, trip) {
  const key = `${trip.year}-${String(trip.month || 1).padStart(2, '0')}`;
  return homeBases.find(h => h.start <= key && (!h.end || h.end >= key)) || homeBases[0];
}

export function getTravelerKey(trip) {
  const ids = trip.travelers || [];
  if (ids.includes('joey') && ids.includes('bonnie')) return 'both';
  if (ids.includes('bonnie')) return 'bonnie';
  return 'joey';
}

export function expandTrip(trip, locationsById, homeBases) {
  let route = [];
  if (trip.route?.length) {
    route = trip.route.map((r, idx) => ({ ...locationsById[r.locationId], modeFromPrevious: idx === 0 ? null : r.modeFromPrevious || trip.mode }));
  } else {
    const home = locationsById[trip.fromLocationId || activeHomeBase(homeBases, trip)?.locationId];
    const to = locationsById[trip.toLocationId];
    route = [home, { ...to, modeFromPrevious: trip.mode }];
    if (trip.roundTrip) route.push({ ...home, modeFromPrevious: trip.mode });
  }
  const legs = route.slice(1).map((to, idx) => {
    const from = route[idx];
    return { from, to, mode: to.modeFromPrevious || trip.mode || 'plane', miles: milesBetween(from, to) };
  });
  return { ...trip, route, legs };
}

export function flattenLegs(trips, locationsById, homeBases) {
  return trips.flatMap(trip => expandTrip(trip, locationsById, homeBases).legs.map((leg, legIndex) => ({ trip, leg, legIndex })));
}
