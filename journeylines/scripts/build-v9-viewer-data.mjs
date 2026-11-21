/**
 * WP4 build-time projection of canonical routeDetails.json into a read-only
 * viewer asset. Studio continues using the ORIGINAL full routeDetails.json.
 * Never mutate user files and never commit derived output.
 *
 * node scripts/build-v9-viewer-data.mjs --out public/data/v9-viewer
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { flattenLegs } from '../src/utils/tripExpansion.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = process.argv.indexOf('--out');
const destination = path.resolve(p < 0 ? path.join(root, 'public/data/v9-viewer') : process.argv[p + 1] || '');
const sourceBytes = fs.readFileSync(path.join(root, 'src/data/routeDetails.json'));
const full = JSON.parse(sourceBytes.toString('utf8'));
const read = n => JSON.parse(fs.readFileSync(path.join(root, 'src/data', n), 'utf8'));
const fields = Object.freeze([
  // These establish exact trip-scoped identity and endpoint validation.
  'tripId', 'legId', 'legIndex', 'fromLocationId', 'toLocationId',
  'fromName', 'toName', 'mode', 'routeCacheKey', 'endpointPairKey',
  'routeStackOffset', 'routeStackBaseOffset', 'routeStackDirectionSign',
  'routeStackCount', 'routeStackIndex', 'coordinates', 'geometry',
  'geometrySource', 'routingVersion'
]);
const viewer = {
  version: full.version,
  cacheVersion: full.cacheVersion,
  // The runtime route-reader uses these values for provenance/debugging.
  source: 'v9-compiled-viewer-route-geometry',
  routes: {}
};
for (const [key, row] of Object.entries(full.routes || {})) {
  const lite = {};
  for (const name of fields) if (row[name] !== undefined) lite[name] = row[name];
  viewer.routes[key] = lite;
}

// Semantic preservation is validated against each original source record.
// Node 24 does not support Vite's JSON import semantics for routeDetails.js,
// so the build script intentionally does NOT import browser-only utilities.
// These exact fields cover every input read by the viewer's existing route
// matcher, route stacker, and geometry cache. The original reader is unchanged.
const trips = read('trips.json');
const locations = read('locations.json');
const homeBases = read('homeBases.json');
const locById = Object.fromEntries(locations.map(loc => [loc.id, loc]));
const legs = flattenLegs(trips, locById, homeBases);
assert.equal(legs.length, 401, 'baseline expected 401 playable legs');
assert.equal(Object.keys(viewer.routes).length, Object.keys(full.routes).length);
const coordsMatch = (a, b) => Array.isArray(a) && Array.isArray(b)
  && a.length >= 2 && b.length >= 2
  && Math.abs(Number(a[0]) - Number(b[0])) <= 0.0002
  && Math.abs(Number(a[1]) - Number(b[1])) <= 0.0002;
let matched = 0;
let allGeometryPoints = 0;
for (const entry of legs) {
  const key = `${entry.trip.id}::${entry.legId}`;
  const legacyKey = `${entry.trip.id}::leg-${entry.legIndex}`;
  const original = full.routes[key] || full.routes[legacyKey];
  const reduced = viewer.routes[key] || viewer.routes[legacyKey];
  assert.ok(original && reduced, `Lost route for ${key}`);
  for (const field of fields) {
    assert.deepEqual(reduced[field], original[field], `Viewer detail changed ${key}.${field}`);
  }
  assert.equal(String(reduced.tripId), String(entry.trip.id), `Wrong trip ${key}`);
  assert.equal(String(reduced.legId), String(entry.legId), `Wrong leg ${key}`);
  assert.equal(String(reduced.fromLocationId), String(entry.leg.from.id), `Wrong start ${key}`);
  assert.equal(String(reduced.toLocationId), String(entry.leg.to.id), `Wrong end ${key}`);
  assert.equal(String(reduced.mode), String(entry.leg.mode), `Wrong mode ${key}`);
  assert.ok(coordsMatch(reduced.coordinates?.from, [entry.leg.from.lon, entry.leg.from.lat]), `Stale from coordinates ${key}`);
  assert.ok(coordsMatch(reduced.coordinates?.to, [entry.leg.to.lon, entry.leg.to.lat]), `Stale to coordinates ${key}`);
  assert.ok(!reduced.routingVersion || reduced.routingVersion === viewer.cacheVersion, `Stale routing version ${key}`);
  assert.ok(Array.isArray(reduced.geometry) && reduced.geometry.length >= 2, `Missing geometry ${key}`);
  allGeometryPoints += reduced.geometry.length;
  matched++;
}
assert.equal(matched, 401);
// Also protect the route records that might not be referenced by today's
// filtered timeline, and their source field order/shape.
for (const [key, original] of Object.entries(full.routes)) {
  const reduced = viewer.routes[key];
  assert.ok(reduced, `Missing route record ${key}`);
  for (const field of fields) assert.deepEqual(reduced[field], original[field], `Lost record field ${key}.${field}`);
}

const payload = JSON.stringify(viewer) + '\n';
const payloadBytes = Buffer.from(payload);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const assetName = 'route-details.json';
const manifest = {
  schema: 'globehoppers.viewer-routes.v1',
  sourceSha256: sha256(sourceBytes),
  routeCount: Object.keys(full.routes || {}).length,
  legCount: legs.length,
  geometryPoints: allGeometryPoints,
  asset: assetName,
  bytes: payloadBytes.length,
  sha256: sha256(payloadBytes)
};
assert.equal(manifest.routeCount, 401);
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, assetName), payloadBytes);
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`PASS WP4: ${manifest.legCount} legs, ${manifest.routeCount} routes, ${manifest.geometryPoints} original geometry points retained; all source matching fields verified`);
console.log(`Full route source ${sourceBytes.length} bytes; viewer ${payloadBytes.length} bytes; saved ${(100 * (1 - payloadBytes.length / sourceBytes.length)).toFixed(1)}%`);
