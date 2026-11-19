/**
 * Verify generated v9 playback packages after offline compilation.
 * Usage: node scripts/verify-v9-playback.mjs /path/to/output
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const output = path.resolve(process.argv[2] || '.v9-playback-build');
const read = file => fs.readFileSync(path.join(output, file));
const manifest = JSON.parse(read('manifest.json'));
assert.equal(manifest.schema, 'globehoppers.playback.v1');
assert.equal(manifest.counts.trips, 178, 'unexpected baseline trip count');
assert.equal(manifest.counts.legs, 401, 'unexpected baseline leg count');
assert.equal(manifest.trips.length, manifest.counts.trips);
assert.equal(manifest.counts.modes.plane, 330);
assert.equal(manifest.counts.modes.drive, 54);
assert.equal(manifest.counts.modes.boat, 13);
assert.equal(manifest.counts.modes.train, 4);

let totalLegs = 0;
const legKeys = new Set();
const finite = arr => arr.every(Number.isFinite);
for (const record of manifest.trips) {
  assert.match(record.file, /^trips\/[a-zA-Z0-9_-]+\.json$/);
  const bytes = read(record.file);
  assert.equal(bytes.length, record.bytes, `bytes changed: ${record.id}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `hash mismatch: ${record.id}`);
  const bundle = JSON.parse(bytes);
  assert.equal(bundle.schema, 'globehoppers.trip-playback.v1');
  assert.equal(bundle.tripId, record.id);
  assert.equal(bundle.legs.length, record.legCount);
  for (const leg of bundle.legs) {
    totalLegs++;
    assert.ok(leg.key.startsWith(`${record.id}::`), 'leg key must include trip ID');
    assert.ok(!legKeys.has(leg.key), `duplicate composite leg key: ${leg.key}`);
    legKeys.add(leg.key);
    const p = leg.plan;
    assert.ok(p.sampleCount >= 72 && p.sampleCount <= 320, 'invalid playback sample count');
    assert.equal(p.positions.length, p.sampleCount * 2, `invalid position plan: ${leg.key}`);
    assert.equal(p.camera.length, p.sampleCount * 2, `invalid camera plan: ${leg.key}`);
    assert.equal(p.headings.length, p.sampleCount, `invalid headings: ${leg.key}`);
    assert.equal(p.cumulative.length, p.sampleCount, `invalid cumulative: ${leg.key}`);
    for (const name of ['positions','headings','camera','cumulative','overview','regional','presentation']) {
      assert.ok(Array.isArray(p[name]) && p[name].length > 0 && finite(p[name]), `non-finite or empty ${name}: ${leg.key}`);
    }
    assert.ok(p.durationMs > 0 && Number.isFinite(p.durationMs), `invalid duration: ${leg.key}`);
    assert.ok(Number.isFinite(p.totalMiles) && p.totalMiles >= 0, `invalid miles: ${leg.key}`);
    assert.ok(p.cumulative.every((d, i) => i === 0 || d + 0.0001 >= p.cumulative[i - 1]), `distance reversed: ${leg.key}`);
  }
}
assert.equal(totalLegs, manifest.counts.legs);
console.log(`PASS: v9 playback package checks for ${manifest.trips.length} trips / ${totalLegs} legs`);
console.log(`Coverage: ${JSON.stringify(manifest.counts.coverage)}`);
