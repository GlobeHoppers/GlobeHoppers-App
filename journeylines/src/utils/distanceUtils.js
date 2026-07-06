const R = 3958.8;
export function milesBetween(a, b) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(shortestLonDelta(b.lon - a.lon));
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function routeMiles(points) {
  return points.slice(1).reduce((sum, p, i) => sum + milesBetween(points[i], p), 0);
}

function shortestLonDelta(delta) {
  return ((delta + 540) % 360) - 180;
}
