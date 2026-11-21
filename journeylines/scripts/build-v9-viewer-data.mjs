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
import { applyRouteDetailsToEntries, routeDetailsGeometryCache } from '../src/utils/routeDetails.js';

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

// Semantic parity is a release gate, not a rough size/shape comparison.
// Every leg must resolve to identical geometry, stacking metadata and
// route-cache references after projection. The same cache must produce
// every original geometry (including direction-independent surface routes).
const trips = read('trips.json');
const locations = read('locations.json');
const homeBases = read('homeBases.json');
const locById = Object.fromEntries(locations.map(loc => [loc.id, loc]));
const legs = flattenLegs(trips, locById, homeBases);
const legacy = applyRouteDetailsToEntries(legs, full);
const slim = applyRouteDetailsToEntries(legs, viewer);
assert.equal(legs.length, 401, 'baseline expected 401 playable legs');
assert.equal(slim.length, legacy.length);
const matchFields = [
  'routeDetailsKey', 'routeCacheKey', 'routeStackOffset', 'routeStackBaseOffset',
  'routeStackDirectionSign', 'routeStackCount', 'routeStackIndex',
  'routeEndpointPairKey', 'routeGeometry'
];
for (let i = 0; i < legs.length; i++) {
  const a = legacy[i]?.leg;
  const b = slim[i]?.leg;
  for (const field of matchFields) {
    assert.deepEqual(b[field], a[field],
      `Viewer route parity failed: ${legs[i]?.trip?.id}::${legs[i]?.legId}, field ${field}`);
  }
}
const fullCache = routeDetailsGeometryCache(full);
const slimCache = routeDetailsGeometryCache(viewer);
assert.deepEqual(slimCache, fullCache, 'surface canonical route cache changed in viewer projection');

const payload = JSON.stringify(viewer) + '\n';
const payloadBytes = Buffer.from(payload);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const assetName = 'route-details.json';
const manifest = {
  schema: 'globehoppers.viewer-routes.v1',
  sourceSha256: sha256(sourceBytes),
  routeCount: Object.keys(full.routes || {}).length,
  legCount: legs.length,
  cacheEntries: Object.keys(slimCache).length,
  asset: assetName,
  bytes: payloadBytes.length,
  sha256: sha256(payloadBytes)
};
assert.equal(manifest.routeCount, 401);
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(path.join(destination, assetName), payloadBytes);
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`PASS WP4: ${manifest.legCount} legs, ${manifest.routeCount} routes, ${manifest.cacheEntries} geometry-cache entries; exact reader/cache parity`);
console.log(`Full route source ${sourceBytes.length} bytes; viewer ${payloadBytes.length} bytes; saved ${(100 * (1 - payloadBytes.length / sourceBytes.length)).toFixed(1)}%`);
