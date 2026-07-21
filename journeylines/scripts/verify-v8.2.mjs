import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const required = [
  'src/repositories/JsonTravelRepository.js',
  'src/repositories/SupabaseTravelRepository.js',
  'src/repositories/createTravelRepository.js',
  'src/adapters/supabaseToTravelMap.js',
  'supabase/migrations/004_account_travel_data_columns.sql',
  'QA/v8.2-WP1-read-only-cloud-loading.md'
];

for (const relative of required) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`Missing v8.2 file: ${relative}`);
}

const app = fs.readFileSync(path.join(root, 'src/App.jsx'), 'utf8');
for (const marker of ['VITE_ENABLE_CLOUD_TRAVEL_DATA', 'VITE_ENABLE_CLOUD_TRAVEL_WRITES', 'createTravelRepository']) {
  if (!app.includes(marker)) throw new Error(`App.jsx is missing ${marker}`);
}

const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const marker of ['VITE_ENABLE_CLOUD_TRAVEL_DATA', 'VITE_ENABLE_CLOUD_TRAVEL_WRITES']) {
  if (!env.includes(marker)) throw new Error(`.env.example is missing ${marker}`);
}

console.log('GlobeHoppers v8.2 Work Package 1 verification passed.');
