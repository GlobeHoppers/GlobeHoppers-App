const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function createStableId(prefix = 'id') {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    }
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint32Array(12);
      crypto.getRandomValues(bytes);
      return `${prefix}-${Array.from(bytes, value => ID_ALPHABET[value % ID_ALPHABET.length]).join('')}`;
    }
  } catch {}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deterministicLegacyId(prefix, ...parts) {
  const input = parts.map(value => String(value ?? '')).join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return `${prefix}-${unsigned.toString(36).padStart(7, '0')}`;
}

export function activeHomeLocationId(homeBases = [], trip = {}) {
  const year = Number(trip?.year) || new Date().getFullYear();
  const month = Number(trip?.month) || 1;
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const sorted = [...(homeBases || [])].sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
  const match = sorted.find(base => String(base.start || '') <= key && (!base.end || String(base.end) >= key));
  return match?.locationId || sorted[0]?.locationId || null;
}

export function normalizeTripForV61(trip = {}, homeBases = []) {
  const tripId = trip?.id || deterministicLegacyId('trip', trip?.year, trip?.month, trip?.day, trip?.label);
  const sourceRoute = Array.isArray(trip?.route) && trip.route.length > 1
    ? trip.route
    : buildLegacyRoute(trip, homeBases);

  const normalizedRoute = [];
  for (let index = 0; index < sourceRoute.length; index++) {
    const point = sourceRoute[index] || {};
    const locationId = point.locationId || null;
    if (!locationId) continue;
    const previous = normalizedRoute[normalizedRoute.length - 1];
    const modeFromPrevious = index === 0 ? null : (point.modeFromPrevious || trip.mode || 'plane');
    const pointId = point.pointId || deterministicLegacyId('point', tripId, index, locationId);
    const legId = index === 0
      ? null
      : (point.legId || deterministicLegacyId('leg', tripId, index, previous?.locationId, locationId, modeFromPrevious));
    normalizedRoute.push({
      ...point,
      pointId,
      ...(index > 0 ? { legId } : {}),
      locationId,
      modeFromPrevious
    });
  }

  return {
    ...trip,
    id: tripId,
    routeModelVersion: 2,
    route: normalizedRoute
  };
}

export function normalizeTripsForV61(trips = [], homeBases = []) {
  return (trips || []).map(trip => normalizeTripForV61(trip, homeBases));
}

export function legIdentityFromRoutePoint(trip, routePoint, index = 0) {
  const tripId = trip?.id || null;
  return {
    tripId,
    legId: routePoint?.legId || deterministicLegacyId('leg', tripId, index),
    legIndex: index
  };
}

export function validDateParts(year, month, day = null) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return false;
  if (!Number.isInteger(m) || m < 1 || m > 12) return false;
  if (day == null || day === '') return true;
  const d = Number(day);
  if (!Number.isInteger(d) || d < 1) return false;
  const max = new Date(y, m, 0).getDate();
  return d <= max;
}

export function compareDateParts(a = {}, b = {}) {
  const av = dateValue(a.year, a.month, a.day);
  const bv = dateValue(b.year, b.month, b.day);
  return av - bv;
}

export function dateValue(year, month, day = 1) {
  return (Number(year) || 0) * 10000 + (Number(month) || 0) * 100 + (Number(day) || 1);
}

export function isResolvedLocation(location) {
  if (!location) return false;
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (location.needsGeocoding) return false;
  return !(Math.abs(lat) < 1e-9 && Math.abs(lon) < 1e-9 && String(location.id || '').startsWith('custom-'));
}

export function geometrySignature(geometry = []) {
  if (!Array.isArray(geometry) || geometry.length < 2) return 'none';
  const first = geometry[0] || [];
  const last = geometry[geometry.length - 1] || [];
  return [
    geometry.length,
    Number(first[0]).toFixed(4),
    Number(first[1]).toFixed(4),
    Number(last[0]).toFixed(4),
    Number(last[1]).toFixed(4)
  ].join(':');
}

function buildLegacyRoute(trip, homeBases) {
  const startId = trip?.fromLocationId || activeHomeLocationId(homeBases, trip);
  const destinationId = trip?.toLocationId;
  const route = [];
  if (startId) route.push({ locationId: startId, modeFromPrevious: null });
  if (destinationId) route.push({ locationId: destinationId, modeFromPrevious: trip?.mode || 'plane' });
  if (trip?.roundTrip && startId && destinationId && startId !== destinationId) {
    route.push({ locationId: startId, modeFromPrevious: trip?.returnMode || trip?.mode || 'plane' });
  }
  return route;
}
