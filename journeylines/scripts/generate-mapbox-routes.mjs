import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import trips from '../src/data/trips.json' with { type: 'json' };
import locations from '../src/data/locations.json' with { type: 'json' };
import homeBases from '../src/data/homeBases.json' with { type: 'json' };
import routingSettings from '../src/data/routingSettings.json' with { type: 'json' };
import { flattenLegs } from '../src/utils/tripExpansion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../src/data/generatedRoutes.json');
const token = (process.env.VITE_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || '').trim();

if (!token) {
  console.error('Missing VITE_MAPBOX_TOKEN. Cannot generate Mapbox driving route cache.');
  process.exit(1);
}
if (!token.startsWith('pk.')) {
  console.error('VITE_MAPBOX_TOKEN is present but does not start with pk. Use a Mapbox public token.');
  process.exit(1);
}

const locById = Object.fromEntries(locations.map((location) => [location.id, location]));
const legs = flattenLegs(trips, locById, homeBases).filter((entry) => entry?.leg?.mode === 'drive');
const version = routingSettings?.mapbox?.cacheVersion || 'v2.16';
const profile = routingSettings?.mapbox?.profile || 'mapbox/driving';
const geometries = routingSettings?.mapbox?.geometries || 'geojson';
const overview = routingSettings?.mapbox?.overview || 'full';

function routeCacheKey(leg) {
  return `${version}:${leg.from.id}->${leg.to.id}:${leg.mode}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRoute(leg, attempt = 1) {
  const coords = `${leg.from.lon},${leg.from.lat};${leg.to.lon},${leg.to.lat}`;
  const params = new URLSearchParams({
    alternatives: 'false',
    geometries,
    overview,
    steps: 'false',
    access_token: token
  });
  const url = `https://api.mapbox.com/directions/v5/${profile}/${coords}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      // Helps URL-restricted public Mapbox tokens validate when requests run from GitHub Actions.
      Referer: 'https://jonathanjoelneptune.github.io/JourneyLines/',
      Origin: 'https://jonathanjoelneptune.github.io'
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(750 * attempt);
      return fetchRoute(leg, attempt + 1);
    }
    throw new Error(`Mapbox Directions ${res.status} for ${leg.from.id}->${leg.to.id}: ${body.slice(0, 180)}`);
  }
  const data = await res.json();
  const geometry = data?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(geometry) || geometry.length < 2) {
    throw new Error(`Mapbox returned no usable geometry for ${leg.from.id}->${leg.to.id}`);
  }
  return geometry;
}

const unique = [];
const seen = new Set();
for (const entry of legs) {
  const key = routeCacheKey(entry.leg);
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(entry);
}

console.log(`JourneyLines route generation: ${unique.length} drive leg(s), cache=${version}, profile=${profile}.`);

const routes = {};
let failures = 0;
const concurrency = Math.max(1, Math.min(4, routingSettings?.mapbox?.concurrency || 3));
let cursor = 0;

async function worker() {
  while (cursor < unique.length) {
    const entry = unique[cursor++];
    const key = routeCacheKey(entry.leg);
    try {
      const coords = await fetchRoute(entry.leg);
      routes[key] = coords;
      console.log(`Generated ${key}: ${coords.length} points`);
    } catch (error) {
      failures += 1;
      console.warn(`Could not generate ${key}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));

const output = {
  version,
  generatedAt: new Date().toISOString(),
  source: 'github-actions-mapbox-directions-build-time-cache',
  routeCount: Object.keys(routes).length,
  failedRouteCount: failures,
  profile,
  routes
};

await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
console.log(`Generated ${output.routeCount} route(s); failed ${failures}.`);

if (unique.length > 0 && output.routeCount === 0) {
  console.error('No driving routes were generated. Failing so the deploy does not silently publish fallback-only driving routes.');
  process.exit(1);
}
