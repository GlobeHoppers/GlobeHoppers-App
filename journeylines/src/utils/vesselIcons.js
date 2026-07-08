import { useEffect, useState } from 'react';
import airplaneBlue from '../Icons/Airplanes/Airplane - Blue.png?url';
import carBlue from '../Icons/Cars/Car - Blue.png?url';
import boatBlue from '../Icons/Boats/Boat - Blue.png?url';
import trainBlue from '../Icons/Trains/Train - Blue.png?url';

const BASE_ICON_URLS = {
  plane: airplaneBlue,
  move: airplaneBlue,
  car: carBlue,
  drive: carBlue,
  boat: boatBlue,
  train: trainBlue
};

const BASE_ICON_PRELOAD_URLS = [...new Set(Object.values(BASE_ICON_URLS))];
const baseImagePreloadCache = new Map();

preloadBaseVesselIcons();

export function preloadBaseVesselIcons() {
  for (const src of BASE_ICON_PRELOAD_URLS) {
    if (baseImagePreloadCache.has(src)) continue;
    const promise = loadImage(src).catch(() => null);
    baseImagePreloadCache.set(src, promise);
  }
}

const iconPromiseCache = new Map();
const iconValueCache = new Map();

export function modeToVesselMode(mode) {
  if (mode === 'move') return 'plane';
  if (mode === 'drive') return 'car';
  if (mode === 'car') return 'car';
  if (mode === 'boat') return 'boat';
  if (mode === 'train') return 'train';
  return 'plane';
}

export function getBaseVesselIconUrl(mode) {
  return BASE_ICON_URLS[modeToVesselMode(mode)] || airplaneBlue;
}

export function getCachedRecoloredVesselIconUrl(mode, color) {
  const key = cacheKey(mode, color);
  return iconValueCache.get(key) || getBaseVesselIconUrl(mode);
}

export function primeRecoloredVesselIcon(mode, color) {
  const key = cacheKey(mode, color);
  if (iconValueCache.has(key)) return Promise.resolve(iconValueCache.get(key));
  if (iconPromiseCache.has(key)) return iconPromiseCache.get(key);
  const promise = recolorBlueIcon(getBaseVesselIconUrl(mode), color)
    .then((url) => {
      iconValueCache.set(key, url);
      iconPromiseCache.delete(key);
      return url;
    })
    .catch(() => {
      const fallback = getBaseVesselIconUrl(mode);
      iconValueCache.set(key, fallback);
      iconPromiseCache.delete(key);
      return fallback;
    });
  iconPromiseCache.set(key, promise);
  return promise;
}

export function useRecoloredVesselIcon(mode, color) {
  const [url, setUrl] = useState(() => getCachedRecoloredVesselIconUrl(mode, color));
  useEffect(() => {
    let cancelled = false;
    setUrl(getCachedRecoloredVesselIconUrl(mode, color));
    primeRecoloredVesselIcon(mode, color).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => { cancelled = true; };
  }, [mode, color]);
  return url;
}

function cacheKey(mode, color) {
  return `${modeToVesselMode(mode)}|${normalizeHex(color)}`;
}

function normalizeHex(color = '#00e5ff') {
  const c = String(color || '#00e5ff').trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + c.slice(1).split('').map((ch) => ch + ch).join('').toLowerCase();
  return '#00e5ff';
}

async function recolorBlueIcon(src, targetColor) {
  const img = await (baseImagePreloadCache.get(src) || loadImage(src));
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const target = hexToRgb(normalizeHex(targetColor));
  const targetHsl = rgbToHsl(target.r, target.g, target.b);

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 8) continue;
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const isBlue = hsl.s > 0.22 && hsl.l > 0.10 && hsl.l < 0.96 && hsl.h >= 0.50 && hsl.h <= 0.72;
    if (!isBlue) continue;
    const out = hslToRgb(targetHsl.h, Math.max(0.35, Math.min(1, targetHsl.s * 0.95 + hsl.s * 0.25)), Math.max(0.06, Math.min(0.94, hsl.l)));
    data[i] = out.r;
    data[i + 1] = out.g;
    data[i + 2] = out.b;
  }

  ctx.putImageData(frame, 0, 0);
  return canvas.toDataURL('image/png');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex).slice(1);
  return { r: parseInt(clean.slice(0, 2), 16), g: parseInt(clean.slice(2, 4), 16), b: parseInt(clean.slice(4, 6), 16) };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = 0; s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      default: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
