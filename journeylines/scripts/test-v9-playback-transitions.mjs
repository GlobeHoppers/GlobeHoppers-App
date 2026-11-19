import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { flattenLegs } from '../src/utils/tripExpansion.js';
import { playbackLegsConnect, nextPlaybackTransition, resolveTimelineSeek, matchesConfiguredPlaybackLeg } from '../src/utils/playbackTransitions.js';

const a = { id: 'A', lat: 32.715, lon: -117.16 };
const b = { id: 'B', lat: 34.05, lon: -118.24 };
const c = { id: 'C', lat: 35.1, lon: -119.4 };
const wrap = (tripId, legId, from, to) => ({ trip: { id: tripId }, legId, leg: { from, to } });

test('connected return legs require no camera relocation', () => {
  const entries = [wrap('one','leg1',a,b),wrap('one','leg2',b,a)];
  assert.equal(playbackLegsConnect(entries[0].leg, entries[1].leg), true);
  assert.deepEqual(nextPlaybackTransition(entries, 0), { kind: 'connected', nextIndex: 1 });
  assert.deepEqual(nextPlaybackTransition(entries, 1), { kind: 'complete', nextIndex: 2 });
});

test('disconnected trips trigger a deliberate relocation', () => {
  const entries = [wrap('one','leg1',a,b),wrap('two','leg1',c,a)];
  assert.deepEqual(nextPlaybackTransition(entries, 0), { kind: 'relocation', nextIndex: 1 });
  assert.equal(playbackLegsConnect(entries[0].leg, entries[1].leg), false);
});

test('shared location ID or nearby coordinates preserve continuity', () => {
  assert.equal(playbackLegsConnect({ to: b }, { from: { ...b, lat: b.lat + 1.0, lon: b.lon + 1.0 } }), true);
  const nearB = { id:'another', lat:b.lat + .015,lon:b.lon + .001 };
  assert.equal(playbackLegsConnect({ to: b }, { from: nearB }), true);
  const farB = { id:'another', lat:b.lat + .15,lon:b.lon + .15 };
  assert.equal(playbackLegsConnect({ to: b }, { from: farB }), false);
  assert.equal(playbackLegsConnect({ to: { id:'x',lat:NaN,lon:10 } }, { from: farB }), false);
});

test('timeline seeking maps exactly to a leg position including 100%', () => {
  assert.deepEqual(resolveTimelineSeek(0, 401), { index: 0, progress: 0 });
  assert.deepEqual(resolveTimelineSeek(1/401, 401), { index: 1, progress: 0 });
  assert.deepEqual(resolveTimelineSeek(1, 401), { index: 400, progress: 1 });
  assert.deepEqual(resolveTimelineSeek(4, 401), { index: 400, progress: 1 });
  assert.deepEqual(resolveTimelineSeek(-3, 401), { index: 0, progress: 0 });
  assert.deepEqual(resolveTimelineSeek(.5, 0), { index: -1, progress: 0 });
  const middle = resolveTimelineSeek((200.5)/401, 401);
  assert.equal(middle.index, 200);
  assert.ok(Math.abs(middle.progress-.5) < 1e-11);
});

test('legacy 178-trip history yields deterministic transition decisions', () => {
  const root = path.resolve(import.meta.dirname, '..', 'src/data');
  const read = filename => JSON.parse(fs.readFileSync(path.join(root, filename),'utf8'));
  const locations = read('locations.json');
  const legs = flattenLegs(read('trips.json'), Object.fromEntries(locations.map(loc=>[loc.id,loc])), read('homeBases.json'));
  assert.equal(legs.length, 401);
  const counts = { connected:0, relocation:0, complete:0 };
  for(let i=0;i<legs.length;i++) {
    const transition = nextPlaybackTransition(legs,i);
    counts[transition.kind] = (counts[transition.kind] || 0)+1;
    if (transition.kind === 'connected') assert.equal(playbackLegsConnect(legs[i].leg,legs[i+1].leg),true);
    if (transition.kind === 'relocation') assert.equal(playbackLegsConnect(legs[i].leg,legs[i+1].leg),false);
  }
  assert.equal(counts.complete,1);
  assert.equal(counts.connected + counts.relocation,400);
  assert.ok(counts.connected>0 && counts.relocation>0,JSON.stringify(counts));
  console.log('WP2 leg handoffs:', JSON.stringify(counts));
});

test('same-leg scrubs reuse the clock only when composite leg identity matches', () => {
  const first = { trip: { id:'trip-a' }, legId: 'legacy-leg-id', legIndex:0 };
  const duplicateInOtherTrip = { trip: { id:'trip-b' }, legId: 'legacy-leg-id', legIndex:0 };
  const metadata = { tripId: 'trip-a', legId:'legacy-leg-id', legIndex:0, generation:3 };
  assert.equal(matchesConfiguredPlaybackLeg(metadata, first), true);
  assert.equal(matchesConfiguredPlaybackLeg(metadata, duplicateInOtherTrip), false);
  assert.equal(matchesConfiguredPlaybackLeg({...metadata, legIndex:1}, first), false);
  assert.equal(matchesConfiguredPlaybackLeg({...metadata, legId:'other-leg'}, first), false);
  assert.equal(matchesConfiguredPlaybackLeg({}, first), false);
});
