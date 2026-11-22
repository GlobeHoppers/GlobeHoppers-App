/**
 * Packages one worldwide NASA Blue Marble texture into the deployed app.
 * Downloads occur at BUILD TIME ONLY. Local Earth playback makes no imagery
 * requests to NASA, EOX, OpenFreeMap, or any third-party tile provider.
 *
 * Credits: NASA Earth Observatory, Blue Marble: Next Generation.
 * https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'public/data/cinematic/earth-blue-marble.jpg');
const manifest = resolve(root, 'public/data/cinematic/earth-blue-marble.json');
const SOURCES = [
  // Official NASA NCCS 21,600 × 10,800 JPEG, about 19 MiB. The browser
  // resizes to an 8K working bitmap before building the local tile pyramid.
  'https://portal.nccs.nasa.gov/datashare/g6dev/BMNG/world.200407.3x21600x10800.jpg',
  'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg',
  'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/january/world.topo.200401.3x5400x2700.jpg',
  'https://raw.githubusercontent.com/rance1230/earth-wind-globe/main/public/assets/earth/blue-marble-5400x2700.jpg'
];
const isJpeg = bytes => bytes.length >= 250000 && bytes.length <= 45000000 &&
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function fetchImage(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(50000),
    headers: { 'User-Agent': 'CinematicGlobeHoppers-EarthAssetBuild/1.0' }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!isJpeg(bytes)) throw new Error('Unexpected content or JPEG size ' + bytes.length);
  return bytes;
}

await mkdir(dirname(file), { recursive: true });
let image;
let origin = 'previously-built';
try {
  const cached = await readFile(file);
  // Never allow an earlier 5,400-pixel cached artifact to lock us into
  // blurry results on subsequent builds. The image is downloaded at build
  // time, not during playback.
  if (isJpeg(cached)&&cached.length>=9500000) image = cached;
} catch {}
if (!image) {
  const errors = [];
  for (const url of SOURCES) {
    try {
      image = await fetchImage(url);
      origin = url;
      break;
    } catch (e) {
      errors.push(url + ' → ' + e.message);
    }
  }
  if (!image) {
    throw new Error('Unable to package NASA Blue Marble texture:\n' + errors.join('\n'));
  }
  await writeFile(file, image);
}
await writeFile(manifest, JSON.stringify({
  schema: 'cinematic-globehoppers.local-earth.v1',
  texture: 'earth-blue-marble.jpg',
  source: origin,
  credit: 'NASA Earth Observatory — Blue Marble: Next Generation',
  originalPublication: '2004',
  bytes: image.length,
  quality: image.length>=9500000?'high-resolution':'fallback-standard',
  sha256: sha256(image)
}, null, 2) + '\n');
console.log('PASS Local Earth texture: ' + image.length + ' bytes, SHA256 ' + sha256(image).slice(0, 14));
