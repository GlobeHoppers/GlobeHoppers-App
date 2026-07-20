import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '.');
for (const file of ['supabase/migrations/005_hopper_crud_hardening.sql','QA/v8.2-WP2-hopper-crud.md']) {
  if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`);
}
const app=fs.readFileSync(path.join(root,'src/App.jsx'),'utf8');
for (const marker of ['VITE_ENABLE_CLOUD_HOPPER_WRITES','replaceHoppers','Save Private Hoppers']) if (!app.includes(marker)) throw new Error(`Missing ${marker}`);
const repo=fs.readFileSync(path.join(root,'src/repositories/SupabaseTravelRepository.js'),'utf8');
if (!repo.includes('async replaceHoppers')) throw new Error('Supabase repository is missing replaceHoppers');
const env=fs.readFileSync(path.join(root,'.env.example'),'utf8');
if (!env.includes('VITE_ENABLE_CLOUD_HOPPER_WRITES')) throw new Error('Missing Hopper write environment flag');
console.log('GlobeHoppers v8.2 Work Package 2 verification passed.');
