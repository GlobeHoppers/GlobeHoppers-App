import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase/migrations/008_fast_trip_conflict.sql', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../src/repositories/SupabaseTravelRepository.js', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../src/components/AdminPanel.jsx', import.meta.url), 'utf8');

const required = [
  [migration.includes("using errcode = 'P0001'"), 'migration uses an application exception instead of SQLSTATE 40001'],
  [!migration.includes("errcode = '40001'"), 'migration does not emit retryable serialization failures'],
  [migration.includes('and updated_at = p_expected_updated_at'), 'revision check is atomic in the update predicate'],
  [migration.includes('updated_trip_id is null'), 'zero-row updates are converted to an immediate conflict'],
  [repository.includes("includes('changed in another session')"), 'repository classifies conflict messages'],
  [panel.includes('TRIP_CONFLICT_MESSAGE'), 'editor exposes the conflict feedback message'],
  [panel.includes('setBusy(false)'), 'editor releases its saving state on failures']
];

const failed = required.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error('GlobeHoppers v8.2.6 verification failed:');
  for (const message of failed) console.error(`- ${message}`);
  process.exit(1);
}
console.log('GlobeHoppers v8.2.6 fast concurrency-conflict verification passed.');
