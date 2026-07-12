import { milesBetween } from './distanceUtils.js';
import { normalizeTripForV61 } from './tripModel.js';

export function activeHomeBase(homeBases, trip) {
  const key = `${trip.year}-${String(trip.month || 1).padStart(2, '0')}`;
  return homeBases.find(h => h.start <= key && (!h.end || h.end >= key)) || homeBases[0];
}

export function getTravelerKey(trip, hopSquads = []) {
  const ids = [...new Set(trip.travelers || [])].filter(Boolean);
  const key = ids.slice().sort().join('|');
  const squad = hopSquads.find(s => [...new Set(s.hopperIds || [])].filter(Boolean).sort().join('|') === key);
  if (squad) return squad.id;
  if (ids.includes('joey') && ids.includes('bonnie')) return 'both';
  if (ids.length === 1) return ids[0];
  if (ids.includes('bonnie')) return 'bonnie';
  if (ids.includes('joey')) return 'joey';
  return ids[0] || 'joey';
}

export function expandTrip(trip, locationsById, homeBases) {
  const normalizedTrip = normalizeTripForV61(trip, homeBases);
  const route = (normalizedTrip.route || [])
    .map((point, index) => normalizeRoutePoint(
      locationsById[point.locationId],
      index === 0 ? null : point.modeFromPrevious || normalizedTrip.mode,
      normalizedTrip,
      point.locationId,
      point
    ))
    .filter(Boolean);

  const legs = [];
  for (let idx = 1; idx < route.length; idx++) {
    const from = route[idx - 1];
    const to = route[idx];
    if (!isValidLocationForLeg(from) || !isValidLocationForLeg(to)) {
      warnInvalidLeg(normalizedTrip, from, to);
      continue;
    }
    const legId = to.legId || normalizedTrip.route?.[idx]?.legId || `${normalizedTrip.id}-leg-${idx}`;
    legs.push({
      id: legId,
      legId,
      from,
      to,
      mode: to.modeFromPrevious || normalizedTrip.mode || 'plane',
      miles: milesBetween(from, to)
    });
  }
  return { ...normalizedTrip, route, legs };
}

function normalizeRoutePoint(location, modeFromPrevious, trip, locationId, routePoint = {}) {
  if (!location) {
    warnInvalidLocation(trip, locationId);
    return null;
  }
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    warnInvalidLocation(trip, locationId || location.id);
    return null;
  }
  return { ...location, lat, lon, modeFromPrevious, pointId: routePoint.pointId || null, legId: routePoint.legId || null };
}

function isValidLocationForLeg(location) {
  return Boolean(location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lon)));
}

function warnInvalidLocation(trip, locationId) {
  if (typeof console === 'undefined') return;
  console.warn('[GlobeHoppers] Skipping invalid/missing location while expanding trip.', {
    tripId: trip?.id,
    label: trip?.label,
    locationId
  });
}

function warnInvalidLeg(trip, from, to) {
  if (typeof console === 'undefined') return;
  console.warn('[GlobeHoppers] Skipping invalid leg while expanding trip.', {
    tripId: trip?.id,
    label: trip?.label,
    from: from?.id || from?.name,
    to: to?.id || to?.name
  });
}


export function buildHomeMoveTrips(homeBases, locationsById) {
  return [...homeBases]
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))
    .slice(1)
    .map((home, index, arr) => {
      const sorted = [...homeBases].sort((a, b) => String(a.start).localeCompare(String(b.start)));
      const prev = sorted[index];
      const from = locationsById[prev.locationId];
      const to = locationsById[home.locationId];
      const [year, month] = String(home.start || '').split('-').map(Number);
      return {
        id: `home-move-${home.locationId}-${home.start}`,
        year: year || 2000,
        month: month || null,
        day: null,
        displayDate: formatHomeMoveDate(home.start),
        sortKey: `${home.start || year}-000-home-move`,
        label: `Moved to ${to?.name || home.name}`,
        travelers: ['joey', 'bonnie'],
        mode: 'move',
        roundTrip: false,
        isHomeMove: true,
        route: [
          { locationId: from?.id || prev.locationId, modeFromPrevious: null },
          { locationId: to?.id || home.locationId, modeFromPrevious: 'move' }
        ],
        notes: 'New home base',
        occasion: ''
      };
    });
}

function formatHomeMoveDate(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  if (!year) return 'Move';
  if (!month) return String(year);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function flattenLegs(trips, locationsById, homeBases) {
  // Home bases are context only. They define the auto-derived start/return
  // location for Hops, but they should not create playable timeline cards or
  // playback entries.
  const entries = [];
  for (const trip of trips || []) {
    try {
      const expanded = expandTrip(trip, locationsById, homeBases);
      expanded.legs.forEach((leg, legIndex) => {
        if (isValidLocationForLeg(leg?.from) && isValidLocationForLeg(leg?.to)) {
          entries.push({ trip: expanded, leg, legId: leg.legId || leg.id, legIndex });
        }
      });
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[GlobeHoppers] Skipping trip that could not be expanded.', { tripId: trip?.id, error: err });
    }
  }
  return applyRouteStackOffsets(entries);
}

function applyRouteStackOffsets(entries = []) {
  const groups = new Map();

  for (const entry of entries) {
    const key = routeStackKey(entry?.leg);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  for (const rows of groups.values()) {
    if (rows.length <= 1) continue;

    // Outbound and return legs for the same trip should share the same lane.
    // Separate trips with the same unordered endpoint pair still get their own lanes,
    // regardless of which travelers were on the trip.
    const laneEntries = [];
    const laneByTrip = new Map();
    for (const entry of rows) {
      const laneKey = String(entry?.trip?.id || `${entry?.trip?.year || ''}-${entry?.trip?.month || ''}-${entry?.trip?.label || entry?.trip?.title || ''}`);
      if (!laneByTrip.has(laneKey)) {
        laneByTrip.set(laneKey, laneEntries.length);
        laneEntries.push({ laneKey, entries: [] });
      }
      laneEntries[laneByTrip.get(laneKey)].entries.push(entry);
    }

    if (laneEntries.length <= 1) continue;

    const spacing = 3.1;
    laneEntries.forEach((lane, laneIndex) => {
      // First trip goes directly to the destination point. Later repeat trips
      // alternate to either side of that center lane: 2nd left, 3rd right,
      // 4th farther left, 5th farther right, etc. This keeps the first visit
      // visually honest instead of offsetting it just because future visits exist.
      const baseOffset = routeStackCenteredFirstOffset(laneIndex, spacing);
      lane.entries.forEach(entry => {
        // MapLibre line-offset is relative to the line's drawing direction.
        // A return leg has reversed coordinates, so the same numeric offset
        // appears on the opposite side of the route. Flip the sign by canonical
        // endpoint direction so outbound and return legs for the same trip land
        // on the exact same visual lane.
        const directionSign = routeStackDirectionSign(entry?.leg);
        entry.leg = {
          ...entry.leg,
          routeStackOffset: baseOffset * directionSign,
          routeStackBaseOffset: baseOffset,
          routeStackDirectionSign: directionSign,
          routeStackCount: laneEntries.length,
          routeStackIndex: laneIndex
        };
      });
    });
  }

  return entries;
}

function routeStackKey(leg) {
  const from = leg?.from?.id || leg?.from?.name;
  const to = leg?.to?.id || leg?.to?.name;
  if (!from || !to) return '';
  const pair = [String(from), String(to)].sort();
  return `${pair[0]}↔${pair[1]}`;
}

function routeStackDirectionSign(leg) {
  const from = leg?.from?.id || leg?.from?.name;
  const to = leg?.to?.id || leg?.to?.name;
  if (!from || !to) return 1;
  const pair = [String(from), String(to)].sort();
  return String(from) === pair[0] ? 1 : -1;
}

function routeStackCenteredFirstOffset(laneIndex, spacing = 3.1) {
  if (!laneIndex) return 0;
  const magnitude = Math.ceil(laneIndex / 2) * spacing;
  return laneIndex % 2 === 1 ? -magnitude : magnitude;
}

function timelineDateValue(item, isHomeMove = false) {
  const year = Number(item?.year) || 9999;
  const month = Number(item?.month) || (isHomeMove ? 1 : 13);
  const day = Number(item?.day) || (isHomeMove ? 0 : 99);
  return year * 10000 + month * 100 + day;
}
