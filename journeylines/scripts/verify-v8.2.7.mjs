import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || '.';
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const required = [
  'supabase/migrations/009_delete_private_trip.sql',
  'src/repositories/SupabaseTravelRepository.js',
  'src/components/AdminPanel.jsx',
  'QA/v8.2-WP5-secure-delete-hop.md'
];
for (const file of required) if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`);
const migration=read(required[0]);
if (!migration.includes('delete_private_trip') || !migration.includes('updated_at = p_expected_updated_at')) throw new Error('Delete migration lacks secure concurrency checks.');
const repo=read(required[1]);
if (!repo.includes('async deleteTrip') || !repo.includes("rpc('delete_private_trip'")) throw new Error('Repository deleteTrip RPC is missing.');
const panel=read(required[2]);
for (const token of ['cloudTripDeleteEnabled','onCloudDeleteTrip','TRIP_DELETE_CONFLICT_MESSAGE','Reload trip']) if (!panel.includes(token)) throw new Error(`AdminPanel missing ${token}`);
if (panel.includes('if (isConflict) window.alert(message)')) throw new Error('Generic browser conflict alert remains.');
console.log('GlobeHoppers v8.2.7 Work Package 5 verification passed.');
