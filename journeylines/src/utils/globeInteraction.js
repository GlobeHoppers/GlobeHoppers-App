export const DEFAULT_GLOBE_SPIN_SPEED = 0.32;
export const MIN_GLOBE_SPIN_SPEED = 0.05;
export const MAX_GLOBE_SPIN_SPEED = 1.25;

export function clampGlobeSpinSpeed(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_GLOBE_SPIN_SPEED;
  return Math.max(MIN_GLOBE_SPIN_SPEED, Math.min(MAX_GLOBE_SPIN_SPEED, Math.round(number * 100) / 100));
}

export function autoLevelGlobeCamera(camera = {}, options = {}) {
  const center = Array.isArray(camera.center) ? camera.center : [0, 0];
  const lon = normalizeLongitude(center[0]);
  const latValue = Number(center[1]);
  const lat = Number.isFinite(latValue) ? latValue : 0;
  const targetLat = Math.max(-34, Math.min(34, lat));
  const requestedZoom = Number(options.zoom);
  const cameraZoom = Number(camera.zoom);
  const zoom = Number.isFinite(requestedZoom)
    ? requestedZoom
    : Number.isFinite(cameraZoom) ? cameraZoom : 3.8;
  return {
    center: [lon, targetLat],
    zoom,
    pitch: 0,
    bearing: 0
  };
}

export function normalizeLongitude(value) {
  const number = Number(value) || 0;
  return ((number + 540) % 360) - 180;
}

export function captureCameraState(map) {
  if (!map) return null;
  try {
    const center = map.getCenter?.();
    return {
      center: [Number(center?.lng) || 0, Number(center?.lat) || 0],
      zoom: Number(map.getZoom?.() || 0),
      pitch: Number(map.getPitch?.() || 0),
      bearing: Number(map.getBearing?.() || 0)
    };
  } catch {
    return null;
  }
}

export function locationIdsVisitedByTrip(trip = {}, tripLegs = []) {
  const ids = new Set();
  for (const item of tripLegs || []) {
    const id = item?.leg?.to?.id || item?.to?.id;
    if (id) ids.add(id);
  }
  if (trip?.toLocationId) ids.add(trip.toLocationId);
  for (const point of Array.isArray(trip?.route) ? trip.route.slice(1) : []) {
    if (point?.locationId) ids.add(point.locationId);
  }
  return [...ids];
}

export function shouldEnterIdleMode({ isPlaying, isRelocating, adminOpen, destinationSelectionActive }) {
  return !isPlaying && !isRelocating && !adminOpen && !destinationSelectionActive;
}
