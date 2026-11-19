/**
 * GlobeHoppers v9 WP2 camera ownership contract.
 *
 * Exactly one subsystem may issue cinematic camera commands at a time.
 * The map's physical user gestures remain an explicit manual override within
 * playback; the renderer cannot reclaim the camera until gesture return.
 */
export function resolveCameraOwner({
  playing = false, intro = false, relocating = false, overview = false,
  idle = false, tuning = false
} = {}) {
  // Completing a pending relocation or intro takes priority over a tuning
  // overlay; otherwise its camera may stall before signaling completion.
  if (relocating) return 'relocation';
  if (intro) return 'intro';
  if (tuning) return 'tuning';
  if (idle) return 'idle';
  if (overview) return 'overview';
  return playing ? 'playback' : 'scene';
}

export class CameraDirector {
  constructor() {
    this.owner = 'scene';
    this.generation = 0;
    this.epoch = 0;
  }

  reconcile(context = {}, playbackGeneration = 0) {
    const owner = resolveCameraOwner(context);
    const generation = Number(playbackGeneration) || 0;
    if (owner !== this.owner || (owner === 'playback' && generation !== this.generation)) {
      this.owner = owner;
      this.epoch += 1;
    }
    this.generation = generation;
    return this.epoch;
  }

  allows(owner, generation = null) {
    return this.owner === owner &&
      (owner !== 'playback' || generation == null || Number(generation) === this.generation);
  }

  ticket(owner) {
    return this.allows(owner) ? { owner, epoch: this.epoch } : null;
  }

  valid(ticket) {
    return Boolean(ticket) && this.owner === ticket.owner && this.epoch === ticket.epoch;
  }
}

/** Convert the original v7.5 per-camera-update damping into elapsed-time damping.
 * The camera should traverse the same fraction per second at 28, 35 or 44 ms.
 */
export function timeBasedCameraAlpha(alphaAtReference, elapsedMs, referenceMs = 28) {
  const base = Math.max(0, Math.min(1, Number(alphaAtReference) || 0));
  const dt = Math.max(0, Math.min(250, Number(elapsedMs) || 0));
  if (!dt) return 0;
  return 1 - Math.pow(1 - base, dt / Math.max(1, Number(referenceMs) || 28));
}
