/**
 * Independent read-only geometry subset generated from reviewed v9 routes.
 * Never contacts a routing server during cinematic playback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifyReviewedSurfaceRoute } from '../src/cinematic/surfaceGeometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(fs.readFileSync(path.join(root,'src/data/routeDetails.json'),'utf8'));
const output=path.join(root,'public/data/cinematic/surface-routes.json');
const routes={};
let inputs=0,vertices=0;
const allowed=new Set(['drive','car','boat','train']);
for(const [key,entry] of Object.entries(source.routes||{})){
  if(!allowed.has(entry.mode))continue;
  const geometry=entry.geometry;
  if(!Array.isArray(geometry)||geometry.length<2)continue;
  inputs++;
  const reduced=simplifyReviewedSurfaceRoute(geometry,entry.mode);
  if(!Array.isArray(reduced)||reduced.length<2)continue;
  const clean=reduced.filter(p=>Array.isArray(p)&&p.length>=2&&
    Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[1])<=90);
  if(clean.length<2)continue;
  const row={mode:entry.mode,source:entry.source||'reviewed-snapshot',geometry:clean.map(p=>[
    Math.round(p[0]*1e6)/1e6,Math.round(p[1]*1e6)/1e6
  ])};
  routes[key]=row;vertices+=row.geometry.length;
}
const result={schema:'cinematic-globehoppers.surface-routes.v1',
  source:'v9-reviewed-routeDetails.json',version:source.cacheVersion||source.version,
  routes};
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(result)+'\n');
if(inputs<65||Object.keys(routes).length<inputs*0.95)
  throw Error('Surface route geometry lost during cinematic compilation');
console.log('PASS cinematic surface routes '+Object.keys(routes).length+'/'+inputs+
  ' routes, '+vertices+' points, '+fs.statSync(output).size+' bytes');
