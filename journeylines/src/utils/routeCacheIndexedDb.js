const DB_NAME = 'globehoppers-routing-v6';
const DB_VERSION = 1;
const STORE = 'routes';

let dbPromise = null;
const memoryFallback = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' });
        store.createIndex('routingVersion', 'routingVersion', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch(() => null);
  return dbPromise;
}

export async function getCachedRoute(key, routingVersion) {
  const memory = memoryFallback.get(key);
  if (memory && (!routingVersion || memory.routingVersion === routingVersion)) return memory.geometry;
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const row = req.result;
      if (!row || (routingVersion && row.routingVersion !== routingVersion)) {
        resolve(null);
        return;
      }
      memoryFallback.set(key, row);
      resolve(Array.isArray(row.geometry) ? row.geometry : null);
    };
    req.onerror = () => resolve(null);
  });
}

export async function putCachedRoute(key, geometry, routingVersion, metadata = {}) {
  if (!key || !Array.isArray(geometry) || geometry.length < 2) return;
  const row = {
    key,
    geometry,
    routingVersion,
    updatedAt: Date.now(),
    metadata
  };
  memoryFallback.set(key, row);
  const db = await openDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(row);
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
}

export async function getCachedRoutes(keys = [], routingVersion) {
  const entries = await Promise.all((keys || []).map(async key => [key, await getCachedRoute(key, routingVersion)]));
  return Object.fromEntries(entries.filter(([, geometry]) => Array.isArray(geometry) && geometry.length > 1));
}

export async function pruneOldRoutingVersions(routingVersion) {
  const db = await openDb();
  if (!db) return;
  await new Promise(resolve => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (cursor.value?.routingVersion !== routingVersion) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = resolve;
    tx.onerror = resolve;
    tx.onabort = resolve;
  });
}

export function routeCacheKeyV6(leg, routingVersion = 'natural-earth-v6.0') {
  const from = leg?.from?.id || `${leg?.from?.lon},${leg?.from?.lat}`;
  const to = leg?.to?.id || `${leg?.to?.lon},${leg?.to?.lat}`;
  return `${routingVersion}:${from}->${to}:${leg?.mode || 'plane'}`;
}
