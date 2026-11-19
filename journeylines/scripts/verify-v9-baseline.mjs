/**
 * GlobeHoppers v9 WP0: protect pre-account v7.5.15 data during refactoring.
 * No external dependencies; run from journeylines/: node scripts/verify-v9-baseline.mjs .
 * --skip-frozen-blobs is only for deliberate fixture/migration tests, never CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = path.resolve(process.argv[2] || '.');
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const manifest = read('QA/v9-baseline-manifest.json');
const trips = read('src/data/trips.json');
const locations = read('src/data/locations.json');
const hoppers = read('src/data/hoppers.json').hoppers;
const bases = read('src/data/homeBases.json');

if (!process.argv.includes('--skip-frozen-blobs')) {
  for (const [file, expected] of Object.entries(manifest.frozenDataBlobs)) {
    const bytes = fs.readFileSync(path.join(root, file));
    const actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(actual, expected, `History/route source changed: ${file}. Approve and document changes explicitly.`);
  }
}

let assertions = 0;
function check(ok, message) {
  assert.ok(ok, message);
  assertions += 1;
}
function uniqueIdSet(records, name) {
  check(Array.isArray(records), `${name} must be an array`);
  const ids = new Set();
  for (const item of records) {
    check(typeof item?.id === 'string' && !!item.id.trim(), `${name} missing ID`);
    check(!ids.has(item.id), `${name} duplicate ID: ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}
function checkDate(year, month, day, label) {
  check(Number.isInteger(Number(year)) && Number(year) >= 1900 && Number(year) <= 2200, `${label}: invalid year`);
  check(Number.isInteger(Number(month)) && Number(month) >= 1 && Number(month) <= 12, `${label}: invalid month`);
  if (day == null || day === '') return;
  const max = new Date(Number(year), Number(month), 0).getDate();
  check(Number.isInteger(Number(day)) && Number(day) >= 1 && Number(day) <= max, `${label}: invalid day`);
}

const locationIds = uniqueIdSet(locations, 'locations');
const tripIds = uniqueIdSet(trips, 'trips');
const hopperIds = uniqueIdSet(hoppers, 'hoppers');
uniqueIdSet(bases, 'home bases');

check(manifest.tripIds.length === manifest.tripCount, 'invalid baseline manifest trip count');
check(new Set(manifest.tripIds).size === manifest.tripCount, 'duplicate IDs in baseline manifest');
for (const id of manifest.tripIds) check(tripIds.has(id), `original trip removed: ${id}`);
check(trips.length >= manifest.tripCount, 'baseline trip count decreased');
check(locations.length >= manifest.locationCount, 'baseline locations decreased');
check(hoppers.length >= manifest.hopperCount, 'baseline hopper count decreased');
check(bases.length >= manifest.homeBaseCount, 'baseline home bases decreased');

for (const loc of locations) {
  check(Number.isFinite(Number(loc.lat)) && Math.abs(Number(loc.lat)) <= 90, `invalid latitude: ${loc.id}`);
  check(Number.isFinite(Number(loc.lon)) && Math.abs(Number(loc.lon)) <= 180, `invalid longitude: ${loc.id}`);
}
for (const base of bases) check(locationIds.has(base.locationId), `missing home-base location ${base.locationId}`);

let legs = 0;
let crossTripLegacyLegIdRepeats = 0;
const globalLegOwners = new Map();
const modes = {};
for (const trip of trips) {
  check(Array.isArray(trip.route) && trip.route.length >= 2, `trip has no route: ${trip.id}`);
  checkDate(trip.year, trip.month, trip.day, `trip ${trip.id}`);
  if (trip.endYear != null && trip.endMonth != null) checkDate(trip.endYear, trip.endMonth, trip.endDay, `trip ${trip.id} end`);
  for (const hopper of trip.travelers || []) check(hopperIds.has(hopper), `trip ${trip.id}: unknown hopper ${hopper}`);
  const ownPoints = new Set();
  const ownLegs = new Set();
  for (const [index, point] of trip.route.entries()) {
    check(locationIds.has(point.locationId), `trip ${trip.id}: missing location ${point.locationId}`);
    check(typeof point.pointId === 'string' && !!point.pointId, `trip ${trip.id}: missing pointId`);
    check(!ownPoints.has(point.pointId), `trip ${trip.id}: reused pointId ${point.pointId}`);
    ownPoints.add(point.pointId);
    if (index === 0) continue;
    legs += 1;
    check(typeof point.legId === 'string' && !!point.legId, `trip ${trip.id}: missing legId at ${index}`);
    check(!ownLegs.has(point.legId), `trip ${trip.id}: reused legId ${point.legId}`);
    ownLegs.add(point.legId);
    const existingOwner = globalLegOwners.get(point.legId);
    if (existingOwner && existingOwner !== trip.id) crossTripLegacyLegIdRepeats += 1;
    else globalLegOwners.set(point.legId, trip.id);
    check(['plane', 'drive', 'car', 'boat', 'train'].includes(point.modeFromPrevious), `trip ${trip.id}: invalid travel mode`);
    modes[point.modeFromPrevious] = (modes[point.modeFromPrevious] || 0) + 1;
  }
}
check(legs >= manifest.legCount, 'baseline leg count decreased');
for (const [mode, original] of Object.entries(manifest.modeCounts)) {
  check((modes[mode] || 0) >= original, `baseline mode ${mode} count decreased`);
}
console.log(`PASS: ${assertions} WP0 baseline assertions`);
console.log(`Trips ${trips.length}, legs ${legs}, locations ${locations.length}, hoppers ${hoppers.length}`);
console.log(`Modes ${JSON.stringify(modes)}; repeated cross-trip leg IDs ${crossTripLegacyLegIdRepeats}`);
