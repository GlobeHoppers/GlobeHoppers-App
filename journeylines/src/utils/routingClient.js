import { enforceRouteCacheLimit, getCachedRoute, putCachedRoute, pruneOldRoutingVersions, routeCacheKeyV6 } from './routeCacheIndexedDb.js';

export const ROUTING_VERSION = 'natural-earth-v6.0';
const listeners = new Set();
const pending = new Map();
const memoryRoutes = new Map();
const memoryPlans = new Map();
const inFlightRoutes = new Map();
const inFlightPlans = new Map();
const WORKER_INIT_TIMEOUT_MS = 30000;
const WORKER_REQUEST_TIMEOUT_MS = 45000;

let worker = null;
let workerEpoch = 0;
let nextId = 1;
let initialized = false;
let initPromise = null;
let status = {
  state: 'idle',
  label: 'Routing engine idle',
  detail: 'Detailed routing will load in the background.',
  ready: false,
  queued: 0,
  activeJob: null,
  completed: 0,
  routingVersion: ROUTING_VERSION,
  dataVersion: null,
  loadedAt: null,
  error: null
};

function emit(patch = {}) {
  status = { ...status, ...patch, queued: pending.size };
  for (const listener of listeners) {
    try { listener(status); } catch {}
  }
  try {
    window.dispatchEvent(new CustomEvent('globehoppers-routing-status', { detail: status }));
  } catch {}
}

function dataUrl() {
  const base = String(import.meta.env.BASE_URL || './').replace(/\/?$/, '/');
  return new URL(`${base}data/naturalEarthRouting.json`, window.location.href).href;
}

function workerTimeoutFor(type) {
  return type === 'init' ? WORKER_INIT_TIMEOUT_MS : WORKER_REQUEST_TIMEOUT_MS;
}

function rejectPending(error) {
  const failure = error instanceof Error ? error : new Error(String(error || 'Routing worker reset.'));
  for (const [, record] of pending) {
    window.clearTimeout(record.timer);
    try { record.reject(failure); } catch {}
  }
  pending.clear();
}

function disposeWorker(reason = 'Routing worker reset.', rejectJobs = true) {
  const instance = worker;
  worker = null;
  workerEpoch += 1;
  initialized = false;
  initPromise = null;
  if (instance) {
    instance.onmessage = null;
    instance.onerror = null;
    instance.onmessageerror = null;
    try { instance.terminate(); } catch {}
  }
  if (rejectJobs) rejectPending(new Error(reason));
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/routingWorker.js', import.meta.url), { type: 'module', name: 'globehoppers-routing' });
  const epoch = ++workerEpoch;
  worker.onmessage = event => {
    if (epoch !== workerEpoch) return;
    const message = event.data || {};
    if (message.type === 'status') {
      emit(message.status || {});
      return;
    }
    const record = pending.get(message.id);
    if (!record) return;
    pending.delete(message.id);
    window.clearTimeout(record.timer);
    emit({ queued: pending.size, activeJob: pending.size ? status.activeJob : null });
    if (message.ok) record.resolve(message.result);
    else record.reject(new Error(message.error || 'Routing worker failed.'));
  };
  worker.onerror = event => {
    if (epoch !== workerEpoch) return;
    const error = event?.message || 'Routing worker crashed.';
    disposeWorker(error, true);
    emit({ state: 'error', label: 'Routing engine error', detail: error, ready: false, activeJob: null, error });
  };
  worker.onmessageerror = () => {
    if (epoch !== workerEpoch) return;
    const error = 'Routing worker returned an unreadable message.';
    disposeWorker(error, true);
    emit({ state: 'error', label: 'Routing engine error', detail: error, ready: false, activeJob: null, error });
  };
  return worker;
}

function request(type, payload = {}, transfer = []) {
  const instance = ensureWorker();
  const id = nextId++;
  const timeoutMs = workerTimeoutFor(type);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      const message = `Routing worker ${type} request timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
      disposeWorker(message, true);
      emit({ state: 'error', label: 'Routing engine timed out', detail: message, ready: false, activeJob: null, error: message });
    }, timeoutMs);
    pending.set(id, { resolve, reject, type, timer });
    emit({
      state: status.ready ? 'working' : 'loading',
      label: status.ready ? 'Routing job running' : 'Loading routing engine',
      activeJob: type,
      queued: pending.size
    });
    try {
      instance.postMessage({ id, type, payload }, transfer);
    } catch (error) {
      window.clearTimeout(timer);
      pending.delete(id);
      disposeWorker(error?.message || 'Routing worker postMessage failed.', true);
      emit({ state: 'error', label: 'Routing engine error', detail: error?.message || String(error), ready: false, activeJob: null, error: error?.message || String(error) });
      reject(error);
    }
  });
}

export function subscribeRoutingStatus(listener) {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

export function getRoutingStatus() {
  return status;
}

export async function restartRoutingEngine(reason = 'manual retry') {
  disposeWorker(`Routing engine restarted (${reason}).`, true);
  emit({ state: 'loading', label: 'Restarting routing engine', detail: `Creating a fresh routing worker (${reason}).`, ready: false, activeJob: null, error: null });
  return prewarmRoutingEngine(reason);
}

export async function prewarmRoutingEngine(reason = 'idle') {
  if (initialized && status.ready) return status;
  if (initPromise) return initPromise;
  initialized = true;
  emit({
    state: 'loading',
    label: 'Loading routing engine',
    detail: `Preparing detailed Natural Earth routing in the background (${reason}).`,
    ready: false,
    error: null
  });
  initPromise = request('init', { dataUrl: dataUrl(), routingVersion: ROUTING_VERSION, reason })
    .then(result => {
      emit({
        state: 'ready',
        label: 'Routing engine ready',
        detail: `${Number(result?.nodeCount || 0).toLocaleString()} water nodes indexed · worker active`,
        ready: true,
        dataVersion: result?.dataVersion || null,
        loadedAt: Date.now(),
        completed: status.completed,
        error: null
      });
      pruneOldRoutingVersions(ROUTING_VERSION);
      return getRoutingStatus();
    })
    .catch(error => {
    disposeWorker(error?.message || 'Routing engine initialization failed.', false);
      emit({ state: 'error', label: 'Routing engine unavailable', detail: error.message, ready: false, error: error.message });
      throw error;
    });
  return initPromise;
}

export async function routeLegInWorker(leg, options = {}) {
  if (!leg?.from || !leg?.to) return null;
  const key = routeCacheKeyV6(leg, ROUTING_VERSION);
  if (memoryRoutes.has(key)) return memoryRoutes.get(key);
  if (inFlightRoutes.has(key)) return inFlightRoutes.get(key);

  const job = (async () => {
    const cached = await getCachedRoute(key, ROUTING_VERSION);
    if (cached?.length > 1) {
      memoryRoutes.set(key, cached);
      return cached;
    }

    await prewarmRoutingEngine(options.reason || 'route request');
    emit({
      state: 'working',
      label: 'Calculating route',
      detail: `${leg.from.name || 'Origin'} → ${leg.to.name || 'Destination'} · ${leg.mode}`,
      activeJob: key
    });
    const result = await request('route', {
      leg: {
        id: leg.legId || leg.id || null,
        legId: leg.legId || leg.id || null,
        mode: leg.mode,
        from: { id: leg.from.id, name: leg.from.name, lon: Number(leg.from.lon), lat: Number(leg.from.lat) },
        to: { id: leg.to.id, name: leg.to.name, lon: Number(leg.to.lon), lat: Number(leg.to.lat) },
        miles: Number(leg.miles || 0)
      },
      routingVersion: ROUTING_VERSION
    });
    const geometry = result?.geometry;
    if (Array.isArray(geometry) && geometry.length > 1) {
      memoryRoutes.set(key, geometry);
      await putCachedRoute(key, geometry, ROUTING_VERSION, {
        mode: leg.mode,
        source: result?.source || 'worker',
        dataVersion: result?.dataVersion || status.dataVersion
      });
      enforceRouteCacheLimit(500).catch(() => {});
      emit({
        state: 'ready',
        label: 'Routing engine ready',
        detail: `Route cached · ${geometry.length.toLocaleString()} points`,
        activeJob: null,
        completed: Number(status.completed || 0) + 1,
        ready: true
      });
      return geometry;
    }
    return null;
  })();

  inFlightRoutes.set(key, job);
  try {
    return await job;
  } finally {
    inFlightRoutes.delete(key);
  }
}

export async function buildPlaybackPlanInWorker(leg, geometry, options = {}) {
  if (!leg?.from || !leg?.to) return null;
  const geometrySignature = Array.isArray(geometry) && geometry.length > 1
    ? `${geometry.length}:${geometry[0]?.join(',')}:${geometry[geometry.length - 1]?.join(',')}`
    : 'no-geometry';
  const key = `${routeCacheKeyV6(leg, ROUTING_VERSION)}:plan:${options.samples || 'auto'}:${geometrySignature}`;
  if (memoryPlans.has(key)) return memoryPlans.get(key);
  if (inFlightPlans.has(key)) return inFlightPlans.get(key);

  const job = (async () => {
    await prewarmRoutingEngine(options.reason || 'playback plan');
    const result = await request('playbackPlan', {
      leg: {
        id: leg.legId || leg.id || null,
        legId: leg.legId || leg.id || null,
        mode: leg.mode,
        from: { id: leg.from.id, lon: Number(leg.from.lon), lat: Number(leg.from.lat) },
        to: { id: leg.to.id, lon: Number(leg.to.lon), lat: Number(leg.to.lat) },
        miles: Number(leg.miles || 0)
      },
      geometry: Array.isArray(geometry) ? geometry : null,
      samples: options.samples || 0
    });
    if (result) {
      memoryPlans.set(key, result);
      if (memoryPlans.size > 120) {
        const oldestKey = memoryPlans.keys().next().value;
        memoryPlans.delete(oldestKey);
      }
    }
    return result;
  })();

  inFlightPlans.set(key, job);
  try {
    return await job;
  } finally {
    inFlightPlans.delete(key);
  }
}

export async function prefetchRoutingForLegs(entries = [], count = 4) {
  const queue = (entries || []).slice(0, Math.max(0, count));
  if (!queue.length) return;
  await prewarmRoutingEngine('playback prefetch');
  for (const entry of queue) {
    const leg = entry?.leg || entry;
    if (!leg?.from || !leg?.to) continue;
    try {
      const geometry = optionsGeometry(entry) || await routeLegInWorker(leg, { reason: 'prefetch' });
      if (geometry?.length > 1) await buildPlaybackPlanInWorker(leg, geometry, { reason: 'prefetch' });
    } catch {}
  }
}

function optionsGeometry(entry) {
  const geometry = entry?.leg?.routeGeometry || entry?.routeGeometry;
  return Array.isArray(geometry) && geometry.length > 1 ? geometry : null;
}

export function routingMemoryGeometry(leg) {
  return memoryRoutes.get(routeCacheKeyV6(leg, ROUTING_VERSION)) || null;
}

export function prewarmWhenIdle() {
  const run = () => prewarmRoutingEngine('browser idle').catch(() => {});
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 1800);
  }
}
