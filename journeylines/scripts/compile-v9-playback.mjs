/**
 * GlobeHoppers v9 WP1 experimental offline compiler.
 *
 * Does not modify source travel data or runtime behavior.
 * Run: node scripts/compile-v9-playback.mjs --out /tmp/globehoppers-v9
 * Output: small independently cacheable trip packages and a deterministic index.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { flattenLegs } from '../src/utils/tripExpansion.js';
import { compilePlaybackLeg } from '../src/utils/compiledPlaybackPlan.js';

const root = path.resolve(import.meta.dirname, '..');
const outputFlag = process.argv.indexOf('--out');
const outputRoot = path.resolve(outputFlag >= 0 && process.argv[outputFlag + 1]
  ? process.argv[outputFlag + 1]
  : path.join(root, '.v9-playback-build'));
const readFile = name => fs.readFileSync(path.join(root, 'src/data', name));
const sourceData = {};
for (const name of ['trips.json', 'locations.json', 'homeBases.json', 'routeDetails.json']) {
  sourceData[name] = readFile(name);
}
const parse = name => JSON.parse(sourceData[name].toString('utf8'));
const trips = parse('trips.json');
const locations = parse('locations.json');
const homeBases = parse('homeBases.json');
const details = parse('routeDetails.json');
const entries = flattenLegs(trips, Object.fromEntries(locations.map(loc => [loc.id, loc])), homeBases);
const sourceHash = createHash('sha256');
for (const name of Object.keys(sourceData)) sourceHash.update(name).update(sourceData[name]);
const sourceDigest = sourceHash.digest('hex');

function closeCoordinates(a, b, limit = .0002) {
  return Array.isArray(a) && Math.abs(Number(a[0]) - Number(b[0])) <= limit && Math.abs(Number(a[1]) - Number(b[1])) <= limit;
}
function validatedDetail(entry) {
  const leg = entry.leg;
  const tripId = String(entry.trip.id);
  const legId = String(entry.legId);
  const candidates = [
    details.routes?.[`${tripId}::${legId}`],
    details.routes?.[`${tripId}::leg-${entry.legIndex}`]
  ];
  return candidates.find(detail => detail
    && String(detail.tripId || tripId) === tripId
    && String(detail.legId || legId) === legId
    && String(detail.fromLocationId) === String(leg.from.id)
    && String(detail.toLocationId) === String(leg.to.id)
    && String(detail.mode) === String(leg.mode)
    && closeCoordinates(detail.coordinates?.from, [leg.from.lon, leg.from.lat])
    && closeCoordinates(detail.coordinates?.to, [leg.to.lon, leg.to.lat])) || null;
}

const byTrip = new Map(trips.map(trip => [trip.id, []]));
const coverage = { detailed: 0, simple: 0, generated: 0, missing: 0 };
const modeCounts = {};
for (const entry of entries) {
  const detail = validatedDetail(entry);
  const supplied = Array.isArray(detail?.geometry) && detail.geometry.length > 1 ? detail.geometry : null;
  const isDetailed = supplied && detail?.geometrySource !== 'simpleFallback';
  if (isDetailed) coverage.detailed++;
  else if (supplied) coverage.simple++;
  else coverage.missing++;
  const record = {
    key: `${entry.trip.id}::${entry.legId}`,
    legIndex: entry.legIndex,
    legId: entry.legId,
    mode: entry.leg.mode,
    miles: entry.leg.miles,
    fromLocationId: entry.leg.from.id,
    toLocationId: entry.leg.to.id,
    geometrySource: supplied ? (detail.geometrySource || 'saved') : 'generated-fallback',
    plan: compilePlaybackLeg(entry.leg, supplied)
  };
  byTrip.get(entry.trip.id).push(record);
  modeCounts[entry.leg.mode] = (modeCounts[entry.leg.mode] || 0) + 1;
}

const outputIndex = {
  schema: 'globehoppers.playback.v1',
  sourceHash: sourceDigest,
  counts: { trips: trips.length, legs: entries.length, modes: modeCounts, coverage },
  trips: []
};
fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(path.join(outputRoot, 'trips'), { recursive: true });
for (const trip of trips) {
  if (!/^[a-zA-Z0-9_-]+$/.test(trip.id)) throw new Error(`Invalid trip file name: ${trip.id}`);
  const bundle = { schema: 'globehoppers.trip-playback.v1', tripId: trip.id, legs: byTrip.get(trip.id) || [] };
  if (!bundle.legs.length) throw new Error(`Trip has no compiled legs: ${trip.id}`);
  const bytes = JSON.stringify(bundle) + '\n';
  const filename = `trips/${trip.id}.json`;
  fs.writeFileSync(path.join(outputRoot, filename), bytes);
  outputIndex.trips.push({
    id: trip.id, file: filename, legCount: bundle.legs.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: Buffer.byteLength(bytes)
  });
}
fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(outputIndex, null, 2) + '\n');
console.log(`GlobeHoppers v9 compiled ${trips.length} trips, ${entries.length} legs`);
console.log(`Detail coverage: ${JSON.stringify(coverage)}; output: ${outputRoot}`);
