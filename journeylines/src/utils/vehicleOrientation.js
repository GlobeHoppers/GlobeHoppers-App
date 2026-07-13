const SPRITE_OFFSETS = Object.freeze({
  plane: 0,
  move: 0,
  drive: 0,
  car: 0,
  boat: 0,
  train: 180
});

export function vesselSpriteRotationOffset(mode) {
  return SPRITE_OFFSETS[String(mode || '').toLowerCase()] ?? 0;
}

export function normalizeHeading(value) {
  return ((Number(value || 0) + 540) % 360) - 180;
}

export function applyVesselSpriteOffset(heading, mode) {
  return normalizeHeading(Number(heading || 0) + vesselSpriteRotationOffset(mode));
}
