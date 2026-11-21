/**
 * v9 release-default runtime for precompiled travel playback.
 *
 * The original routing worker remains the fallback until parity is proven.
 * One index is loaded lazily, and each active/nearby trip is fetched once.
 * No precompiled geometry enters the renderer unless the bundle hash, schema,
 * leg identity, endpoints, mode and distance match the currently loaded trip.
 */

import { isV9FeatureEnabled } from './v9ReleaseFlags.js';

const PACKAGES = 'data/v9-playback/';
const MAX_TRIPS_IN_MEMORY = 8;
const ARRAY_FIELDS = ['positions', 'headings', 'camera', 'cumulative', 'overview', 'regional', 'presentation'];

export function isV9CompiledPlaybackRequested(search = typeof window === 'undefined' ? '' : window.location.search) {
  return isV9FeatureEnabled(search, 'v9Playback');
}

export function compiledPlaybackEntryKey(entry) {
  const tripId = String(entry?.trip?.id || '');
  const legId = String(entry?.legId || entry?.leg?.legId || '');
  return tripId && legId ? `${tripId}::${legId}` : '';
}

const numberNear = (a, b, tolerance = 0.0002) =>
  Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= tolerance;

function planForRuntime(source) {
  if (!source || !Number.isInteger(source.sampleCount) || source.sampleCount < 2) throw new Error('Invalid compiled sample count');
  const plan = {
    sampleCount: source.sampleCount,
    totalMiles: source.totalMiles,
    durationMs: source.durationMs,
    compiled: true
  };
  for (const field of ARRAY_FIELDS) {
    const values = source[field];
    if (!Array.isArray(values) || !values.length || !values.every(Number.isFinite)) throw new Error(`Invalid compiled ${field}`);
    plan[field] = Float32Array.from(values);
  }
  if (plan.positions.length !== plan.sampleCount * 2 || plan.camera.length !== plan.sampleCount * 2 ||
      plan.headings.length !== plan.sampleCount || plan.cumulative.length !== plan.sampleCount ||
      !(Number.isFinite(plan.totalMiles) && plan.totalMiles >= 0)) {
    throw new Error('Compiled playback sample geometry is inconsistent');
  }
  return plan;
}

function matchesEntry(record, entry) {
  const leg = entry?.leg;
  if (!record || !leg?.from || !leg?.to) return false;
  if (record.key !== compiledPlaybackEntryKey(entry) ||
      record.legIndex !== entry.legIndex ||
      record.mode !== leg.mode ||
      record.fromLocationId !== leg.from.id ||
      record.toLocationId !== leg.to.id ||
      !numberNear(record.miles, leg.miles, Math.max(0.01, Number(leg.miles || 0) * .0001))) return false;

  // A leg with the same ID but edited endpoints must NEVER consume stale data.
  return numberNear(record.coordinates?.from?.[0], leg.from.lon) &&
    numberNear(record.coordinates?.from?.[1], leg.from.lat) &&
    numberNear(record.coordinates?.to?.[0], leg.to.lon) &&
    numberNear(record.coordinates?.to?.[1], leg.to.lat) &&
    record.fromPointId === (leg.from.pointId || null) &&
    record.toPointId === (leg.to.pointId || null);
}

export class CompiledPlaybackLibrary {
  constructor({ fetchImpl, subtle, baseUrl, maxCachedTrips = MAX_TRIPS_IN_MEMORY } = {}) {
    this.fetchImpl = fetchImpl || globalThis.fetch?.bind(globalThis);
    this.subtle = subtle || globalThis.crypto?.subtle;
    const root = baseUrl || (typeof window === 'undefined' ? 'http://localhost/' : window.location.href);
    const base = typeof import.meta.env === 'undefined' ? './' : (import.meta.env.BASE_URL || './');
    this.folderUrl = new URL(PACKAGES, new URL(base, root)).href;
    this.maxCachedTrips = maxCachedTrips;
    this.manifestPromise = null;
    this.pending = new Map();
    this.cached = new Map();
    this.failures = new Set();
    this.stats = { requested: 0, validated: 0, skipped: 0, failed: 0 };
  }

  async getManifest() {
    if (!this.manifestPromise) {
      this.manifestPromise = this.readText('manifest.json').then(JSON.parse).then(manifest => {
        if (manifest?.schema !== 'globehoppers.playback.v1' || !Array.isArray(manifest.trips) ||
            typeof manifest.sourceHash !== 'string') throw new Error('Unexpected compiled playback manifest');
        return manifest;
      });
    }
    return this.manifestPromise;
  }

  async readText(filename) {
    if (typeof this.fetchImpl !== 'function') throw new Error('No fetch available for compiled playback');
    const response = await this.fetchImpl(new URL(filename, this.folderUrl).href, { cache: 'force-cache' });
    if (!response?.ok) throw new Error(`Compiled playback request failed (${response?.status ?? 'offline'})`);
    return response.text();
  }

  async loadTrip(tripId) {
    const id = String(tripId || '');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
    if (this.failures.has(id)) return null;
    if (this.cached.has(id)) {
      const value = this.cached.get(id);
      this.cached.delete(id);
      this.cached.set(id, value);
      return value;
    }
    if (this.pending.has(id)) return this.pending.get(id);
    const promise = this.readTrip(id).then(bundle => {
      this.cached.set(id, bundle);
      while (this.cached.size > this.maxCachedTrips) this.cached.delete(this.cached.keys().next().value);
      this.stats.validated++;
      return bundle;
    }).catch(error => {
      this.failures.add(id);
      this.stats.failed++;
      if (typeof console !== 'undefined') console.warn('[GlobeHoppers v9] Using legacy playback:', id, error?.message || error);
      return null;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, promise);
    return promise;
  }

  async readTrip(id) {
    const manifest = await this.getManifest();
    const row = manifest.trips.find(item => item.id === id);
    if (!row || row.file !== `trips/${id}.json` || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw new Error('Trip not found in compiled manifest');
    }
    const source = await this.readText(row.file);
    const bytes = new TextEncoder().encode(source);
    if (bytes.byteLength !== row.bytes) throw new Error('Compiled package byte count mismatch');
    if (!this.subtle) throw new Error('SHA-256 verification is unavailable');
    const hash = new Uint8Array(await this.subtle.digest('SHA-256', bytes));
    const actual = Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== row.sha256) throw new Error('Compiled package hash mismatch');
    const bundle = JSON.parse(source);
    if (bundle?.schema !== 'globehoppers.trip-playback.v1' || bundle.tripId !== id ||
        !Array.isArray(bundle.legs) || bundle.legs.length !== row.legCount) {
      throw new Error('Compiled trip schema or leg count mismatch');
    }
    return bundle;
  }

  async matchesSourceGeometry(record, entry) {
    const geometry = entry?.leg?.routeGeometry;
    // If a trip acquired a detailed route after the last compile, rebuild it.
    if (record.geometrySha256 === null) return !Array.isArray(geometry) || geometry.length < 2;
    if (typeof record.geometrySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.geometrySha256) ||
        !Array.isArray(geometry) || geometry.length < 2 || !this.subtle) return false;
    const bytes = new TextEncoder().encode(JSON.stringify(geometry));
    const hash = new Uint8Array(await this.subtle.digest('SHA-256', bytes));
    const current = Array.from(hash, value => value.toString(16).padStart(2, '0')).join('');
    return current === record.geometrySha256;
  }

  async getPlan(entry) {
    const key = compiledPlaybackEntryKey(entry);
    if (!key) return null;
    this.stats.requested++;
    const bundle = await this.loadTrip(entry.trip.id);
    const row = bundle?.legs?.[entry.legIndex];
    if (!row || !matchesEntry(row, entry) || !(await this.matchesSourceGeometry(row, entry))) {
      this.stats.skipped++;
      return null;
    }
    try {
      return planForRuntime(row.plan);
    } catch (error) {
      this.stats.failed++;
      if (typeof console !== 'undefined') console.warn('[GlobeHoppers v9] Invalid compiled plan:', key, error?.message);
      return null;
    }
  }
}

export const compiledPlaybackLibrary = new CompiledPlaybackLibrary();
