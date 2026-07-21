import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const required = [
  'supabase/migrations/007_update_private_trip.sql',
  'src/repositories/SupabaseTravelRepository.js',
  'src/components/AdminPanel.jsx',
  'src/App.jsx'
];
for (const rel of required) if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing ${rel}`);
const sql = read(required[0]);
for (const token of ['update_private_trip', 'p_expected_updated_at', 'for update', 'delete from public.trip_legs', 'delete from public.trip_hoppers']) if (!sql.includes(token)) throw new Error(`Migration missing ${token}`);
const repo = read(required[1]);
if (!repo.includes("rpc('update_private_trip'")) throw new Error('Repository update RPC missing');
const panel = read(required[2]);
if (!panel.includes('onCloudUpdateTrip') || !panel.includes('expectedUpdatedAt')) throw new Error('AdminPanel cloud edit integration missing');
const app = read(required[3]);
if (!app.includes('requireCloudTripEditAccess') || !app.includes('onCloudUpdateTrip')) throw new Error('App cloud edit integration missing');
console.log('GlobeHoppers v8.2 Work Package 4 verification passed.');
