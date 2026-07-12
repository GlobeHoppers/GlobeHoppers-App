import { sanitizeRouteGeometry } from './multimodalRouting.js';

export const DEFAULT_VALHALLA_ENDPOINTS = [
  'https://valhalla1.openstreetmap.de',
  'https://valhalla.openstreetmap.de'
];

export const DEFAULT_VALHALLA_TIMEOUT_MS = 18000;

export function normalizeValhallaEndpoint(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/route$/, '');
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function normalizeValhallaEndpoints(values = DEFAULT_VALHALLA_ENDPOINTS) {
  const input = Array.isArray(values) ? values : [values];
  return [...new Set(input.map(normalizeValhallaEndpoint).filter(Boolean))].slice(0, 4);
}

export function buildValhallaRoutePayload(leg = {}) {
  const from = validateEndpoint(leg?.from, 'origin');
  const to = validateEndpoint(leg?.to, 'destination');
  const location = (point, type) => ({
    lat: point.lat,
    lon: point.lon,
    type,
    radius: 8000,
    minimum_reachability: 20,
    display_lat: point.lat,
    display_lon: point.lon,
    name: point.name || undefined
  });
  return {
    locations: [location(from, 'break'), location(to, 'break')],
    costing: 'auto',
    costing_options: {
      auto: {
        use_highways: 1,
        use_tolls: 0.5,
        use_ferry: 0.35,
        exclude_unpaved: false
      }
    },
    units: 'miles',
    language: 'en-US',
    directions_type: 'none',
    id: String(leg?.legId || leg?.id || 'globehoppers-route')
  };
}

export function decodeValhallaPolyline6(encoded = '') {
  const source = String(encoded || '');
  if (!source) return null;
  const coordinates = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < source.length) {
    const latResult = decodeSignedValue(source, index);
    if (!latResult) return null;
    index = latResult.nextIndex;
    lat += latResult.value;
    const lonResult = decodeSignedValue(source, index);
    if (!lonResult) return null;
    index = lonResult.nextIndex;
    lon += lonResult.value;
    coordinates.push([lon / 1e6, lat / 1e6]);
    if (coordinates.length > 500000) return null;
  }
  return sanitizeRouteGeometry(coordinates);
}

export function parseValhallaRouteResponse(payload = {}, leg = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('Valhalla returned an empty response.');
  if (payload.error || payload.error_code) {
    const code = payload.error_code || payload.error?.code || 'unknown';
    const message = payload.error || payload.error_message || payload.status_message || 'Route request failed.';
    throw new Error(`Valhalla ${code}: ${typeof message === 'string' ? message : JSON.stringify(message)}`);
  }
  const trip = payload.trip;
  if (!trip || Number(trip.status || 0) !== 0) {
    throw new Error(trip?.status_message || payload.status_message || 'Valhalla did not return a successful trip.');
  }
  const legs = Array.isArray(trip.legs) ? trip.legs : [];
  if (!legs.length) throw new Error('Valhalla returned no route legs.');
  const geometry = [];
  for (const routeLeg of legs) {
    const legGeometry = decodeValhallaPolyline6(routeLeg?.shape);
    if (!legGeometry) throw new Error('Valhalla returned unreadable route geometry.');
    for (const point of legGeometry) {
      const previous = geometry[geometry.length - 1];
      if (!previous || Math.abs(previous[0] - point[0]) > 1e-8 || Math.abs(previous[1] - point[1]) > 1e-8) geometry.push(point);
    }
  }
  const clean = sanitizeRouteGeometry(geometry);
  if (!clean) throw new Error('Valhalla returned no usable driving geometry.');
  const from = [Number(leg?.from?.lon), Number(leg?.from?.lat)];
  const to = [Number(leg?.to?.lon), Number(leg?.to?.lat)];
  const summary = trip.summary || {};
  const warnings = Array.isArray(trip.warnings)
    ? trip.warnings.map(item => item?.text || item?.message || String(item)).filter(Boolean)
    : [];
  return {
    geometry: clean,
    validation: {
      valhallaDistanceMiles: Number(summary.length || 0),
      valhallaDurationSeconds: Number(summary.time || 0),
      startEndpointGapMiles: haversineMiles(from, clean[0]),
      endEndpointGapMiles: haversineMiles(to, clean[clean.length - 1]),
      maxEndpointGapMiles: Math.max(haversineMiles(from, clean[0]), haversineMiles(to, clean[clean.length - 1])),
      hasFerry: Boolean(summary.has_ferry),
      hasHighway: Boolean(summary.has_highway),
      hasToll: Boolean(summary.has_toll),
      valhallaWarnings: warnings
    },
    distanceMiles: Number(summary.length || 0),
    durationSeconds: Number(summary.time || 0),
    warnings
  };
}

export async function requestValhallaDrivingRoute(leg, options = {}) {
  const endpoints = normalizeValhallaEndpoints(options.endpoints || DEFAULT_VALHALLA_ENDPOINTS);
  if (!endpoints.length) throw new Error('No valid Valhalla endpoint is configured.');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('This browser cannot make Valhalla route requests.');
  const timeoutMs = clampTimeout(options.timeoutMs);
  const payload = buildValhallaRoutePayload(leg);
  const errors = [];

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const params = new URLSearchParams({ json: JSON.stringify(payload) });
      const headers = { Accept: 'application/json' };
      if (options.sendClientHeader && options.clientId) headers['X-Client-Id'] = String(options.clientId).slice(0, 100);
      const response = await fetchImpl(`${endpoint}/route?${params.toString()}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store',
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 220) || response.statusText}`);
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('Valhalla returned unreadable JSON.'); }
      const result = parseValhallaRouteResponse(parsed, leg);
      return { ...result, endpoint };
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? `timed out after ${Math.round(timeoutMs / 1000)} seconds`
        : (error?.message || String(error));
      errors.push(`${endpoint}: ${message}`);
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  throw new Error(`Valhalla routing failed. ${errors.join(' | ')}`);
}

function validateEndpoint(endpoint = {}, label = 'endpoint') {
  const lat = Number(endpoint?.lat);
  const lon = Number(endpoint?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error(`The ${label} does not have valid coordinates.`);
  }
  return { lat, lon, name: String(endpoint?.name || '') };
}

function decodeSignedValue(source, startIndex) {
  let result = 0;
  let shift = 0;
  let index = startIndex;
  while (index < source.length) {
    const byte = source.charCodeAt(index++) - 63;
    if (byte < 0 || byte > 63) return null;
    result |= (byte & 0x1f) << shift;
    shift += 5;
    if (shift > 35) return null;
    if (byte < 0x20) {
      const value = (result & 1) ? ~(result >> 1) : (result >> 1);
      return { value, nextIndex: index };
    }
  }
  return null;
}

function clampTimeout(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_VALHALLA_TIMEOUT_MS;
  return Math.max(3000, Math.min(45000, Math.round(number)));
}

function haversineMiles(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const lon1 = Number(a[0]);
  const lat1 = Number(a[1]);
  const lon2 = Number(b[0]);
  const lat2 = Number(b[1]);
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Infinity;
  const radius = 3958.7613;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians((((lon2 - lon1) + 540) % 360) - 180);
  const p1 = toRadians(lat1);
  const p2 = toRadians(lat2);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}
