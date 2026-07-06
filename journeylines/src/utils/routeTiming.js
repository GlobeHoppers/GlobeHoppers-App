export function legDurationMs(miles, speed = 1) {
  const s = Math.max(0.25, Number(speed) || 1);
  let seconds = 5;
  if (miles < 100) seconds = 3.5;
  else if (miles < 500) seconds = 5;
  else if (miles < 2000) seconds = 7;
  else if (miles < 6000) seconds = 10;
  else seconds = 13;
  return (seconds * 1000) / s;
}
