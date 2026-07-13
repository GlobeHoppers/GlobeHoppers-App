export function legDurationMs(miles, speed = 1, mode = 'plane') {
  const s = Math.max(0.25, Number(speed) || 1);
  const d = Math.max(0, Number(miles) || 0);

  // v7.5 cinematic baseline: air travel stays brisk, while long surface trips
  // receive enough screen time to communicate the very different journey.
  let airSeconds;
  if (d < 100) {
    airSeconds = 8.5 + d * 0.025;
  } else if (d < 500) {
    airSeconds = 11 + (d - 100) * 0.0125;
  } else if (d < 1500) {
    airSeconds = 16 + (d - 500) * 0.007;
  } else if (d < 3500) {
    airSeconds = 23 + (d - 1500) * 0.0035;
  } else if (d < 6500) {
    airSeconds = 30 + (d - 3500) * 0.003;
  } else {
    airSeconds = 39 + Math.min(18, (d - 6500) * 0.0022);
  }

  const normalizedMode = mode === 'car' ? 'drive' : String(mode || 'plane').toLowerCase();
  let seconds = airSeconds;
  if (normalizedMode === 'drive') {
    const multiplier = d < 300 ? 1.18 : d < 1000 ? 1.42 : 1.75;
    seconds = airSeconds * multiplier + (d > 900 ? 3 : 1.2);
  } else if (normalizedMode === 'train') {
    const multiplier = d < 300 ? 1.22 : d < 1000 ? 1.50 : 1.90;
    seconds = airSeconds * multiplier + (d > 900 ? 3 : 1.6);
  } else if (normalizedMode === 'boat') {
    const multiplier = d < 300 ? 1.30 : d < 1000 ? 1.65 : 2.10;
    seconds = airSeconds * multiplier + (d > 900 ? 4 : 2.2);
  } else if (d > 0 && d < 350) {
    seconds += 1.2;
  }

  const maximum = ['drive', 'train', 'boat'].includes(normalizedMode) ? 115 : 60;
  return (Math.max(8, Math.min(maximum, seconds)) * 1000) / s;
}
