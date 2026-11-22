/**
 * A complete, packaged NASA Blue Marble atlas for the MapLibre globe.
 *
 * The app downloads ONE first-party JPEG at startup (built into /data/cinematic)
 * and converts it into a bounded local z0–z5 raster pyramid before playback.
 * There are no subsequent HTTP imagery requests in this map mode.
 *
 * This keeps the tested MapLibre camera, route and vehicle architecture intact.
 */
export const LOCAL_EARTH_SCHEME = 'cg-local-earth';
export const LOCAL_EARTH_MAX_ZOOM = 5;
export const SCENIC_EARTH_MAX_ZOOM = 4;
export const SCENIC_EARTH_TILE_COUNT =
  Array.from({length:SCENIC_EARTH_MAX_ZOOM+1},(_,z)=>4**z).reduce((a,b)=>a+b,0);
export const LOCAL_EARTH_TILE_SIZE = 256;
export const LOCAL_EARTH_TILE_COUNT =
  Array.from({length: LOCAL_EARTH_MAX_ZOOM+1},(_,z)=>4**z).reduce((a,b)=>a+b,0);
export const LOCAL_EARTH_STYLE = Object.freeze({
  version: 8,
  name: 'GlobeHoppers Local Earth',
  sources: {},
  layers: [{id:'cg-space',type:'background',
    paint:{'background-color':'#07111e'}}]
});
const store = new Map();
let preparePromise = null;
let protocolRegistered = false;
const key = (z,x,y) => z+'/'+x+'/'+y;
const radToDeg = 180/Math.PI;
export const mercatorRowLatitude = (z,y) => Math.atan(Math.sinh(
  Math.PI*(1-2*y/(2**z*LOCAL_EARTH_TILE_SIZE))))*radToDeg;
export const localEarthTileURL = (z,x,y) =>
  LOCAL_EARTH_SCHEME+'://'+z+'/'+x+'/'+y;

function encodeJpeg(canvas){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob => blob?resolve(blob.arrayBuffer().then(buffer=>new Uint8Array(buffer))):
      reject(new Error('Local Earth tile encode failed')),'image/jpeg',.85);
  });
}

async function rasterize(bitmap,onProgress,targetMaxZoom){
  const canvas=document.createElement('canvas');
  canvas.width=LOCAL_EARTH_TILE_SIZE;
  canvas.height=LOCAL_EARTH_TILE_SIZE;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Local Earth requires 2D canvas support');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  let complete=store.size;
  const targetCount=targetMaxZoom===SCENIC_EARTH_MAX_ZOOM?
    SCENIC_EARTH_TILE_COUNT:LOCAL_EARTH_TILE_COUNT;
  for(let z=0;z<=targetMaxZoom;z++){
    const n=2**z;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      if(store.has(key(z,x,y)))continue; // Reuse existing planet tiles.
      ctx.fillStyle='#07101e';
      ctx.fillRect(0,0,256,256);
      const sx=x*bitmap.width/n, sw=bitmap.width/n;
      // Piecewise latitude re-projection: equirectangular → Web Mercator.
      // Small strips give accurate mid-latitudes and continuous tile edges
      // without a second GPU renderer or a giant worldwide tile bundle.
      for(let row=0;row<256;row+=4){
        const north=mercatorRowLatitude(z,y*256+row);
        const south=mercatorRowLatitude(z,y*256+Math.min(256,row+4));
        const top=(90-north)/180*bitmap.height;
        const bottom=(90-south)/180*bitmap.height;
        ctx.drawImage(bitmap,sx,top,sw,Math.max(.001,bottom-top),
          0,row,256,Math.min(4,256-row));
      }
      store.set(key(z,x,y),await encodeJpeg(canvas));
      complete++;
      if(complete%16===0){
        onProgress?.(complete,targetCount);
        // Yield to the browser so the loading indicator remains responsive.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
  }
  onProgress?.(complete,targetCount);
}

export function getLocalEarthStatus(preset='local') {
  const total=preset==='scenic'?SCENIC_EARTH_TILE_COUNT:LOCAL_EARTH_TILE_COUNT;
  return {ready:store.size>=total,
    cachedTiles:Math.min(store.size,total),totalTiles:total,
    residentTiles:store.size,remoteRequestsDuringPlayback:0};
}

/**
 * Browser-side only. A failed preparation clears partial state so retry can
 * recover. The protocol is registered once per document across map rebuilds.
 */
export async function prepareLocalEarth(maplibregl,url,onProgress,preset='local'){
  const targetMaxZoom=preset==='scenic'?SCENIC_EARTH_MAX_ZOOM:LOCAL_EARTH_MAX_ZOOM;
  const targetCount=preset==='scenic'?SCENIC_EARTH_TILE_COUNT:LOCAL_EARTH_TILE_COUNT;
  if(store.size>=targetCount)return getLocalEarthStatus(preset);
  if(preparePromise){
    await preparePromise;
    return prepareLocalEarth(maplibregl,url,onProgress,preset);
  }
  preparePromise=(async()=>{
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw Error('Local NASA texture unavailable: HTTP '+response.status);
    const blob=await response.blob();
    if(!blob.type.startsWith('image/') || blob.size<100000)
      throw Error('Invalid packaged Earth texture');
    // Scenic needs only z0–z4: 341 tiles and a 4K working image.
    // Strict Local Earth retains z0–z5: 1365 tiles and its full 8K image.
    // Switching to offline mode builds only the missing highest-detail level.
    const dimension=preset==='scenic'?4096:8192;
    const bitmap=await createImageBitmap(blob,{
      resizeWidth:dimension,resizeHeight:dimension/2,resizeQuality:'high'
    });
    try {
      await rasterize(bitmap,onProgress,targetMaxZoom);
    } finally {bitmap.close?.();}
    if(!protocolRegistered){
      maplibregl.addProtocol(LOCAL_EARTH_SCHEME,async params=>{
        const match=new RegExp('^'+LOCAL_EARTH_SCHEME+':\\/\\/(\\d+)\\/(\\d+)\\/(\\d+)').exec(params.url);
        if(!match)throw Error('Invalid local Earth tile URL');
        const tile=store.get(key(Number(match[1]),Number(match[2]),Number(match[3])));
        if(!tile)throw Error('Local Earth tile out of bounds');
        // A copy is necessary: a MapLibre worker may transfer the buffer.
        return {data:tile.slice().buffer};
      });
      protocolRegistered=true;
    }
    return getLocalEarthStatus(preset);
  })().catch(error=>{
    store.clear();
    throw error;
  }).finally(()=>{preparePromise=null;});
  return preparePromise;
}


/** Soft zoom ceiling matched to an 8K global texture. */
export function localEarthCameraPose(pose,preset='local'){
  if(preset!=='local'&&preset!=='scenic')return pose;
  // Preserve real close-up camera moves where bounded regional tiles exist.
  const start=preset==='scenic'?8.25:6.15;
  const span=preset==='scenic'?.75:1.05;
  const zoom=pose.zoom<=start?pose.zoom:
    start+span*(1-Math.exp(-(pose.zoom-start)/span));
  return {...pose,zoom};
}
