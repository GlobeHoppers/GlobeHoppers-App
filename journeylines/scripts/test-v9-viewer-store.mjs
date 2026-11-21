import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { ViewerRouteStore, isV9ViewerRequested } from '../src/viewer/viewerRouteStore.js';
import fs from 'node:fs';
import path from 'node:path';

const doc = { version:'7.1', cacheVersion:'multimodal-v7.1', source:'v9-compiled-viewer-route-geometry',
  routes: Object.fromEntries(Array.from({ length:401 }, (_, i) => [`trip${i}::leg${i}`, { tripId:`trip${i}`, legId:`leg${i}`, mode:'plane',
    fromLocationId:'A',toLocationId:'B',coordinates:{from:[-117,32],to:[-73,40]},geometry:[[-117,32],[-73,40]] }])) };
const body = JSON.stringify(doc) + '\n';
const sha = createHash('sha256').update(body).digest('hex');
const manifest = { schema:'globehoppers.viewer-routes.v1',sourceSha256:'0'.repeat(64),
  routeCount:401,legCount:401,cacheEntries:0,asset:'route-details.json',
  bytes:Buffer.byteLength(body),sha256:sha };
const canonical = { ...doc, source:'canonical-editor', notes:'Full editor provenance' };

function factory({ editBody = null, editManifest = null, fail = false, delay = false } = {}) {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    if (delay) await new Promise(resolve => setTimeout(resolve, 1));
    if (fail) return { ok:false, status:404 };
    const text = url.endsWith('/manifest.json') ? JSON.stringify(editManifest || manifest)
      : url.endsWith('/route-details.json') ? editBody ?? body : '';
    return { ok:true, status:200, text:async () => text };
  };
  let fallbackLoads = 0;
  const store = new ViewerRouteStore({ fetchImpl, subtle:webcrypto.subtle,
    baseUrl:'https://localhost.test/GlobeHoppers-App/',
    assetBase:'./',
    importFull:async () => {fallbackLoads++;return { default:canonical };} });
  return { store, urls, get fallbackLoads(){return fallbackLoads;} };
}

test('viewer mode requires exact explicit opt-in', () => {
  assert.equal(isV9ViewerRequested(''),false);
  assert.equal(isV9ViewerRequested('?v9Renderer=1'),false);
  assert.equal(isV9ViewerRequested('?v9Viewer=1'),true);
  assert.equal(isV9ViewerRequested('?v9Viewer=0'),false);
});

test('compact route asset fetched lazily once and verified with SHA-256', async () => {
  const fixture = factory({ delay:true });
  assert.equal(fixture.urls.length,0);
  const [one,two] = await Promise.all([fixture.store.viewer(),fixture.store.viewer()]);
  assert.equal(one,two);
  assert.equal(fixture.urls.length,2);
  assert.deepEqual(fixture.urls,[
    'https://localhost.test/GlobeHoppers-App/data/v9-viewer/manifest.json',
    'https://localhost.test/GlobeHoppers-App/data/v9-viewer/route-details.json'
  ]);
  assert.equal(fixture.store.snapshot().mode,'viewer');
  assert.equal(fixture.store.snapshot().routeCount,401);
  assert.equal(fixture.fallbackLoads,0);
  await fixture.store.load(true);
  assert.equal(fixture.urls.length,2);
});

test('legacy mode loads original editor metadata without any viewer HTTP requests', async () => {
  const fixture = factory();
  const value = await fixture.store.load(false);
  assert.equal(value.notes,'Full editor provenance');
  assert.equal(fixture.urls.length,0);
  assert.equal(fixture.fallbackLoads,1);
});

test('corrupt route data falls back to original canonical metadata, never a blank globe', async () => {
  const fixture = factory({ editBody:body.replace('trip0::leg0','trip0::tampered') });
  const loaded = await fixture.store.load(true);
  assert.equal(loaded.notes,'Full editor provenance');
  assert.equal(fixture.store.snapshot().mode,'full-fallback');
  assert.equal(fixture.store.snapshot().fallback,true);
  assert.equal(fixture.fallbackLoads,1);
});

test('missing deployed asset safely falls back to original complete source', async () => {
  const fixture = factory({ fail:true });
  const loaded = await fixture.store.load(true);
  assert.equal(loaded.routes['trip0::leg0'].legId,'leg0');
  assert.equal(fixture.store.snapshot().mode,'full-fallback');
  assert.equal(fixture.fallbackLoads,1);
});

test('wrong manifest inventory is rejected and falls back', async () => {
  const fixture = factory({ editManifest:{...manifest, routeCount:400} });
  assert.equal((await fixture.store.load(true)).notes, 'Full editor provenance');
  assert.equal(fixture.urls.length,1);
});

test('no eager 10MB route data import in App or TravelMap', () => {
  const app = fs.readFileSync(path.resolve(import.meta.dirname,'../src/App.jsx'),'utf8');
  const map = fs.readFileSync(path.resolve(import.meta.dirname,'../src/components/TravelMap.jsx'),'utf8');
  assert.doesNotMatch(app,/^import\s+.*routeDetails\.json['"]/m);
  assert.doesNotMatch(map,/^import\s+.*routeDetails\.json['"]/m);
  assert.ok(app.includes('<PlaybackViewer routeDetailsData='));
  assert.ok(app.includes('<StudioBoundary open={admin}'));
  assert.ok(!map.includes('baseRouteDetails'));
});

test('Studio stays async and retains canonical route data for commits', () => {
  const boundary=fs.readFileSync(path.resolve(import.meta.dirname,'../src/editor/StudioBoundary.jsx'),'utf8');
  const studio=fs.readFileSync(path.resolve(import.meta.dirname,'../src/components/AdminPanel.jsx'),'utf8');
  assert.match(boundary,/lazy\(\(\) => import\('\.\.\/components\/AdminPanel\.jsx'\)\)/);
  assert.match(studio,/import routeDetails from '\.\.\/data\/routeDetails\.json'/);
  assert.match(studio,/buildRouteDetailsPayload\(nextTrips, nextLocations, homeBases, routeDetailsRef\.current\)/);
});
