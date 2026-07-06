export function legDurationMs(miles, speed = 1) {
  const s = Math.max(0.25, Number(speed) || 1);
  let seconds = 10;
  if (miles < 100) seconds = 8;
  else if (miles < 500) seconds = 11;
  else if (miles < 2000) seconds = 15;
  else if (miles < 6000) seconds = 20;
  else seconds = 26;
  return (seconds * 1000) / s;
}
