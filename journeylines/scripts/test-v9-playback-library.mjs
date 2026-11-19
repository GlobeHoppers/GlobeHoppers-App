import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { compilePlaybackLeg } from '../src/utils/compiledPlaybackPlan.js';
import { CompiledPlaybackLibrary, compiledPlaybackEntryKey, isV9CompiledPlaybackRequested } from '../src/utils/compiledPlaybackLibrary.js';

const from = { id: 'san-diego', pointId: 'point-a', lon: -117.161, lat: 32.715 };
const to = { id: 'las-vegas', pointId: 'point-b', lon: -115.139, lat: 36.17 };
const routeGeometry = [[from.lon, from.lat], [to.lon, to.lat]];
const makeEntry = (overrides = {}) => ({
  trip: { id: 'trip-1' }, legIndex: 0, legId: 'leg-1',
  leg: { from, to, miles: 260, mode: 'plane', routeGeometry }, ...overrides
});

function bundleFixture({ malformedHash = false, tamper = false, delayed = false } = {}) {
  const entry = makeEntry();
  const compiled = compilePlaybackLeg(entry.leg);
  const row = {
    key: compiledPlaybackEntryKey(entry),
    legIndex: 0, legId: 'leg-1', mode: 'plane', miles: 260,
    fromLocationId: from.id, toLocationId: to.id,
    fromPointId: from.pointId, toPointId: to.pointId,
    coordinates: { from: [from.lon, from.lat], to: [to.lon, to.lat] },
    geometrySha256: createHash('sha256').update(JSON.stringify(routeGeometry)).digest('hex'),
    plan: compiled
  };
  const original = JSON.stringify({ schema: 'globehoppers.trip-playback.v1', tripId: 'trip-1', legs: [row] }) + '\n';
  const expectedSha = createHash('sha256').update(original).digest('hex');
  const manifest = {
    schema: 'globehoppers.playback.v1', sourceHash: 'fixture-hash',
    trips: [{ id: 'trip-1', file: 'trips/trip-1.json', sha256: malformedHash ? '0'.repeat(64) : expectedSha,
      legCount: 1, bytes: Buffer.byteLength(original) }]
  };
  const text = tamper ? original.replace('"mode":"plane"', '"mode":"boat"') : original;
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    if (delayed) await new Promise(resolve => setTimeout(resolve, 1));
    const body = url.endsWith('/manifest.json') ? JSON.stringify(manifest) : url.endsWith('/trips/trip-1.json') ? text : null;
    return { ok: body !== null, status: body === null ? 404 : 200, text: async () => body };
  };
  const library = new CompiledPlaybackLibrary({ fetchImpl, subtle: webcrypto.subtle, baseUrl: 'https://example.test/GlobeHoppers-App/' });
  return { entry, library, requests };
}

test('flag is explicit and disabled by default', () => {
  assert.equal(isV9CompiledPlaybackRequested(''), false);
  assert.equal(isV9CompiledPlaybackRequested('?v9Playback=1'), true);
  assert.equal(isV9CompiledPlaybackRequested('?v9Playback=0'), false);
});

test('manifest and trip package load lazily once with verified SHA-256 and typed arrays', async () => {
  const { entry, library, requests } = bundleFixture({ delayed: true });
  assert.equal(requests.length, 0);
  const [first, second] = await Promise.all([library.getPlan(entry), library.getPlan(entry)]);
  assert.equal(requests.length, 2, 'only one manifest and one trip request');
  assert.deepEqual(requests, [
    'https://example.test/GlobeHoppers-App/data/v9-playback/manifest.json',
    'https://example.test/GlobeHoppers-App/data/v9-playback/trips/trip-1.json'
  ]);
  assert.ok(first.positions instanceof Float32Array);
  assert.ok(first.camera instanceof Float32Array);
  assert.equal(first.compiled, true);
  assert.deepEqual(first.positions, second.positions);
  await library.getPlan(entry);
  assert.equal(requests.length, 2, 'repeated playback uses in-memory package');
});

test('edited endpoint, point ID, mode or distance rejects stale compiled plan', async () => {
  const { entry, library } = bundleFixture();
  assert.ok(await library.getPlan(entry));
  for (const changed of [
    { ...entry, leg: { ...entry.leg, to: { ...to, lat: to.lat + 0.4 } } },
    { ...entry, leg: { ...entry.leg, from: { ...from, pointId: 'new-point' } } },
    { ...entry, leg: { ...entry.leg, mode: 'boat' } },
    { ...entry, leg: { ...entry.leg, miles: 300 } },
    { ...entry, leg: { ...entry.leg, routeGeometry: [[from.lon, from.lat], [-116, 34], [to.lon, to.lat]] } },
    { ...entry, legIndex: 1 },
    { ...entry, trip: { id: 'another-trip' } }
  ]) {
    assert.equal(await library.getPlan(changed), null);
  }
});

test('tampered package never reaches renderer and falls back', async () => {
  const { entry, library, requests } = bundleFixture({ tamper: true });
  assert.equal(await library.getPlan(entry), null);
  assert.equal(await library.getPlan(entry), null);
  assert.equal(requests.length, 2, 'failed bundle is not retried every frame');
  assert.ok(library.stats.failed >= 1);
});

test('incorrect manifest digest never reaches renderer', async () => {
  const { entry, library } = bundleFixture({ malformedHash: true });
  assert.equal(await library.getPlan(entry), null);
});

test('missing package is a normal null fallback, not a thrown playback error', async () => {
  const { entry, library } = bundleFixture();
  const missing = { ...entry, trip: { id: 'no-such-trip' } };
  assert.equal(await library.getPlan(missing), null);
  assert.equal(await library.getPlan(entry) !== null, true);
});
