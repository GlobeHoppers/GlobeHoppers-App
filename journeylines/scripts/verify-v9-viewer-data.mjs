/**
 * WP4 verify the exact viewer asset packaged in the built application.
 * The build compiler also checks every original trip/leg/route field.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] || path.join(root, 'dist/data/v9-viewer'));
const manifest = JSON.parse(fs.readFileSync(path.join(target, 'manifest.json'), 'utf8'));
assert.equal(manifest.schema,'globehoppers.viewer-routes.v1');
assert.equal(manifest.asset,'route-details.json');
assert.equal(manifest.routeCount,401);
assert.equal(manifest.legCount,401);
const bytes = fs.readFileSync(path.join(target, manifest.asset));
const source = fs.readFileSync(path.join(root, 'src/data/routeDetails.json'));
const sha = x => createHash('sha256').update(x).digest('hex');
assert.equal(bytes.length, manifest.bytes, 'Viewer payload byte count mismatch');
assert.equal(sha(bytes), manifest.sha256, 'Viewer payload SHA-256 mismatch');
assert.equal(sha(source), manifest.sourceSha256, 'Viewer payload out of date with canonical source');
assert.ok(bytes.length < source.length * .5, 'Viewer asset must remove at least 50% of route source size');
const viewer=JSON.parse(bytes.toString('utf8'));
assert.equal(Object.keys(viewer.routes||{}).length,401);
for(const [key,route] of Object.entries(viewer.routes)){
  assert.ok(route.tripId && route.legId, `invalid route key ${key}`);
  assert.equal(key,`${route.tripId}::${route.legId}`,`route key changed ${key}`);
  assert.ok(Array.isArray(route.geometry) && route.geometry.length>=2,`missing path ${key}`);
}
console.log(`PASS WP4: 401 immutable routes verified; source ${source.length} bytes -> viewer ${bytes.length} bytes (${(100*(1-bytes.length/source.length)).toFixed(1)}% smaller)`);
