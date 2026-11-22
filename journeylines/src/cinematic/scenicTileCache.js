/**
 * Persistent, bounded client cache for EOX 2016 cinematic satellite imagery.
 *
 * CacheStorage is origin-scoped and survives ordinary page reloads. The free
 * 2016 EOX service remains the provider; never scrape or ship bulk pyramids.
 * Browser quota/eviction are non-deterministic, so cache hits are best-effort.
 */
import { EOX_SENTINEL_2016_TILES } from './earthStyles.js';

export const SCENIC_PROTOCOL='cg-scenic';
export const SCENIC_TILE_CACHE='gh-cinematic-eox2016-v1';
export const MAX_SCENIC_CACHED_TILES=1152;
export const SCENIC_TILE_TTL_MS=14*24*60*60*1000;
const allowed=/^https:\/\/tiles\.maps\.eox\.at\/wmts\/1\.0\.0\/s2cloudless_3857\/default\/g\/(?:[0-9]{1,2})\/[0-9]+\/[0-9]+\.jpg$/;
const stats={hits:0,misses:0,network:0,failed:0,cacheWrites:0};
let registered=false;
let writes=0;

export const scenicRemoteTileURL=(z,x,y)=>{
  if(!Number.isInteger(z)||z<3||z>8||!Number.isInteger(x)||
      !Number.isInteger(y)||x<0||x>=2**z||y<0||y>=2**z)
    throw Error('Scenic tile out of bounds');
  return EOX_SENTINEL_2016_TILES.replace('{z}',String(z))
    .replace('{y}',String(y)).replace('{x}',String(x));
};
export const scenicProtocolTileURL=(z,x,y)=>
  SCENIC_PROTOCOL+'://'+z+'/'+x+'/'+y;

export function getScenicCacheStatus(){
  return {...stats,maxCachedTiles:MAX_SCENIC_CACHED_TILES,
    cacheName:SCENIC_TILE_CACHE};
}

async function evictOverflow(cache){
  const keys=await cache.keys();
  if(keys.length<=MAX_SCENIC_CACHED_TILES)return;
  for(const key of keys.slice(0,keys.length-MAX_SCENIC_CACHED_TILES))
    await cache.delete(key);
}
const jpegBytes=b=>b.length>=4&&b[0]===255&&b[1]===216;

// MapLibre and preflight use the same cache path; cache failures never break
// rendering, and a recently cached stale tile may cover network outages.
export async function loadScenicTile(url,{signal,fetchImpl=fetch,
  cacheStorage=globalThis.caches,now=Date.now}={}){
  if(!allowed.test(url))throw Error('Unapproved scenic satellite tile URL');
  let cache=null,cached=null,storedAt=0;
  if(cacheStorage?.open){
    try{
      cache=await cacheStorage.open(SCENIC_TILE_CACHE);
      cached=await cache.match(url);
      storedAt=Number(cached?.headers?.get('x-gh-cached-at'))||0;
      if(cached&&now()-storedAt<SCENIC_TILE_TTL_MS){
        const bytes=new Uint8Array(await cached.arrayBuffer());
        if(jpegBytes(bytes)){stats.hits++;return bytes;}
      }
    }catch{cache=null;cached=null;}
  }
  stats.misses++;
  try{
    const response=await fetchImpl(url,{mode:'cors',cache:'force-cache',signal});
    if(!response.ok)throw Error('EOX satellite HTTP '+response.status);
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!jpegBytes(bytes)||bytes.byteLength>1024*1024)
      throw Error('EOX satellite did not return a bounded JPEG tile');
    stats.network++;
    if(cache){
      try{
        await cache.put(url,new Response(bytes,{
          status:200,headers:{'content-type':'image/jpeg','x-gh-cached-at':String(now())}
        }));
        stats.cacheWrites++;
        if(++writes%16===0)await evictOverflow(cache);
      }catch{/* Private browsing or quota restriction: continue without persistence. */}
    }
    return bytes;
  }catch(error){
    stats.failed++;
    if(cached){
      try{
        const bytes=new Uint8Array(await cached.arrayBuffer());
        if(jpegBytes(bytes)){stats.hits++;return bytes;}
      }catch{/* Fall through to NASA-backed world map. */}
    }
    throw error;
  }
}

export function registerScenicTileProtocol(maplibregl){
  if(registered)return;
  maplibregl.addProtocol(SCENIC_PROTOCOL,async params=>{
    const match=/^cg-scenic:\/\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if(!match)throw Error('Invalid scenic protocol URL');
    const url=scenicRemoteTileURL(...match.slice(1).map(Number));
    const bytes=await loadScenicTile(url);
    return {data:bytes.buffer};
  });
  registered=true;
}
