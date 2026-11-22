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

async function rasterize(bitmap,onProgress){
  const canvas=document.createElement('canvas');
  canvas.width=LOCAL_EARTH_TILE_SIZE;
  canvas.height=LOCAL_EARTH_TILE_SIZE;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw Error('Local Earth requires 2D canvas support');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  let complete=0;
  for(let z=0;z<=LOCAL_EARTH_MAX_ZOOM;z++){
    const n=2**z;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
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
        onProgress?.(complete,LOCAL_EARTH_TILE_COUNT);
        // Yield to the browser so the loading indicator remains responsive.
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
  }
  onProgress?.(complete,LOCAL_EARTH_TILE_COUNT);
}

export function getLocalEarthStatus() {
  return { ready:store.size===LOCAL_EARTH_TILE_COUNT,
    cachedTiles:store.size,totalTiles:LOCAL_EARTH_TILE_COUNT,
    remoteRequestsDuringPlayback:0 };
}

/**
 * Browser-side only. A failed preparation clears partial state so retry can
 * recover. The protocol is registered once per document across map rebuilds.
 */
export async function prepareLocalEarth(maplibregl,url,onProgress){
  if(store.size===LOCAL_EARTH_TILE_COUNT)return getLocalEarthStatus();
  if(preparePromise)return preparePromise;
  preparePromise=(async()=>{
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw Error('Local NASA texture unavailable: HTTP '+response.status);
    const blob=await response.blob();
    if(!blob.type.startsWith('image/') || blob.size<100000)
      throw Error('Invalid packaged Earth texture');
    // The NASA source is 21,600 × 10,800. Decode to a controlled 8K
    // working bitmap (128 MiB RGBA) before preparing 1,365 local tiles.
    // Retaining the full 21K source in graphics memory would be excessive.
    const bitmap=await createImageBitmap(blob,{
      resizeWidth:8192,resizeHeight:4096,resizeQuality:'high'
    });
    try {
      await rasterize(bitmap,onProgress);
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
    return getLocalEarthStatus();
  })().catch(error=>{
    store.clear();
    preparePromise=null;
    throw error;
  });
  return preparePromise;
}


/** Soft zoom ceiling matched to an 8K global texture. */
export function localEarthCameraPose(pose,preset='local'){
  if(preset!=='local')return pose;
  const start=6.15,span=1.05;
  const zoom=pose.zoom<=start?pose.zoom:
    start+span*(1-Math.exp(-(pose.zoom-start)/span));
  return {...pose,zoom};
}
