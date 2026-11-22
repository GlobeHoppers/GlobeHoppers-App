/**
 * WP3 destination imagery preflight.
 *
 * Uses browser HTTP cache to warm a bounded 3x3 set of satellite tiles near
 * an upcoming destination, before the camera begins its close approach.
 * No second WebGL map and no unbounded crawl of a provider's tile pyramid.
 */
import { EOX_SENTINEL_2016_TILES, NASA_BLUE_MARBLE_TILES } from './earthStyles.js';

const MAX_DESTINATIONS = 3;
const MAX_CONCURRENT = 4;
const MAX_WAIT_MS = 7500;
const degrees = Math.PI/180;
function tileXY(lon,lat,zoom){
  const n=2**zoom, x=Math.floor(((lon+180)/360)*n);
  const clipped=Math.max(-85.051128,Math.min(85.051128,lat));
  const y=Math.floor((1-Math.log(Math.tan(clipped*degrees)+1/Math.cos(clipped*degrees))/Math.PI)/2*n);
  return {x:(x+n)%n,y:Math.max(0,Math.min(n-1,y)),n};
}
function tileUrl(base,z,x,y){return base.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));}
export function destinationTiles(stop,preset='earth'){
  if(!stop||preset==='midnight')return [];
  const urls=new Set();
  const add=(template,z,size)=>{
    const {x,y,n}=tileXY(stop.lon,stop.lat,z);
    for(let row=-size;row<=size;row++)for(let col=-size;col<=size;col++){
      const yy=y+row;if(yy<0||yy>=n)continue;
      urls.add(tileUrl(template,z,(x+col+n)%n,yy));
    }
  };
  // Warm the zoom-OUT background first. The old warmup fetched only z7/z8,
  // so regional pullbacks exposed uncached low-zoom raster tiles.
  add(NASA_BLUE_MARBLE_TILES,4,1); // broad Earth backdrop, 9 tiles
  add(EOX_SENTINEL_2016_TILES,6,1); // regional satellite, 9 tiles
  add(EOX_SENTINEL_2016_TILES,8,1); // arrival imagery, 9 tiles
  add(EOX_SENTINEL_2016_TILES,9,0); // surface-follow center, 1 tile
  return [...urls]; // max 28, never prefetch a global tile pyramid
}

export function createImageryPreflight(fetchTile = (url,signal) => fetch(url,
  {cache:'force-cache',mode:'cors',signal}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.arrayBuffer();})) {
  const jobs=new Map();
  const keyFor=(stop,preset)=>String(stop?.id||'')+'|'+String(preset);
  function schedule(stop,preset='earth'){
    if(!stop||preset==='midnight')return {status:'ready',promise:Promise.resolve(true)};
    const key=keyFor(stop,preset);
    if(jobs.has(key))return jobs.get(key);
    const urls=destinationTiles(stop,preset);
    const job={status:'loading',attempted:urls.length,passed:0,failed:0,promise:null};
    jobs.set(key,job);
    while(jobs.size>MAX_DESTINATIONS)jobs.delete(jobs.keys().next().value);
    job.promise=(async()=>{
      let index=0;
      const worker=async()=>{
        while(index<urls.length){
          const url=urls[index++];
          const abort=new AbortController();
          const timeout=setTimeout(()=>abort.abort(),MAX_WAIT_MS);
          try{await fetchTile(url,abort.signal);job.passed++;}
          catch{job.failed++;}
          finally{clearTimeout(timeout);}
        }
      };
      await Promise.all(Array.from({length:Math.min(MAX_CONCURRENT,urls.length)},worker));
      job.status=job.passed >= Math.ceil(urls.length*0.6) ? 'ready' : 'degraded';
      return job.status==='ready';
    })();
    return job;
  }
  return {
    schedule,
    status(stop,preset='earth'){
      if(!stop||preset==='midnight')return 'ready';
      return jobs.get(keyFor(stop,preset))?.status||'not-started';
    },
    stats(){return [...jobs.entries()].map(([key,j])=>({key,status:j.status,
      attempted:j.attempted,passed:j.passed,failed:j.failed}));},
    clear(){jobs.clear();}
  };
}
