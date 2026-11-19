import { milesBetween } from './distanceUtils.js';

/**
 * Shared connection contract for the timeline, camera, and route renderer.
 * Matching place IDs are exact; nearby coordinates only count when both
 * endpoints are valid and within 3.5 miles (the v7.5 timeline threshold).
 */
export function playbackLegsConnect(previousLeg, nextLeg, toleranceMiles = 3.5) {
  if (!previousLeg?.to || !nextLeg?.from) return false;
  const from = previousLeg.to;
  const to = nextLeg.from;
  if (from.id && to.id && from.id === to.id) return true;
  if (![from.lat, from.lon, to.lat, to.lon].every(value => Number.isFinite(Number(value)))) return false;
  const distance = milesBetween(from, to);
  return Number.isFinite(distance) && distance <= toleranceMiles;
}

export function nextPlaybackTransition(entries, currentIndex) {
  if (!Array.isArray(entries) || !entries.length) return { kind: 'empty', nextIndex: -1 };
  const index = Math.max(0, Math.min(entries.length - 1, Math.trunc(Number(currentIndex) || 0)));
  const nextIndex = index + 1;
  if (nextIndex >= entries.length) return { kind: 'complete', nextIndex: entries.length };
  const connected = playbackLegsConnect(entries[index]?.leg, entries[nextIndex]?.leg);
  return { kind: connected ? 'connected' : 'relocation', nextIndex };
}

/**
 * The timeline has N equal-weight legs, unlike absolute wall-clock duration.
 * Exact 100% is the last leg at 100%, not a synthetic N+1 index.
 */
export function resolveTimelineSeek(fraction, legCount) {
  const count = Math.max(0, Math.trunc(Number(legCount) || 0));
  if (!count) return { index: -1, progress: 0 };
  const p = Math.max(0, Math.min(1, Number.isFinite(Number(fraction)) ? Number(fraction) : 0));
  if (p === 1) return { index: count - 1, progress: 1 };
  const position = p * count;
  const index = Math.max(0, Math.min(count - 1, Math.floor(position)));
  return { index, progress: Math.max(0, Math.min(1, position - index)) };
}
