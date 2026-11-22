/**
 * WP3 chronological player. 178-trip metadata stays lightweight; route geometry
 * is compiled only for the current/nearby trip (3-scene LRU).
 */
import { normalizeTripForV61 } from '../utils/tripModel.js';
import { milesBetween } from '../utils/distanceUtils.js';
import { CINEMATIC_PRESET, buildCinematicScene, cinematicLegDurationMs } from './scene.js';
import {visualForTrip} from './visualIdentity.js';
import {coloredRouteFeatures,routeStackKey,stackOffsetForOccurrence} from './routeVisuals.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=x=>{const t=clamp(x,0,1);return t*t*t*(t*(t*6-15)+10);};
const dlon=(a,b)=>((b-a+540)%360)-180;
const BRIDGE_MS=3600, SHARED_STOP_BRIDGE_MS=650, MAX_SCENES=3;
// Same named cities can have subtly different stored coordinates; only join
// nearby equal-name stops. Coordinates alone must match within half a mile.
export function samePresentationLocation(a,b){
  if(!a||!b)return false;
  const miles=milesBetween(a,b);
  if(miles<=.5)return true;
  const norm=x=>String(x||'').trim().toLocaleLowerCase('en-US')
    .replace(/\s+/g,' ');
  return miles<=12&&Boolean(norm(a.name))&&norm(a.name)===norm(b.name);
}
const dateKey=t=>String(t.year||0).padStart(4,'0')+'-'+String(t.month||1).padStart(2,'0')+'-'+String(t.day||1).padStart(2,'0');

export function stopsForTrip(trip,locationMap){
  const route=normalizeTripForV61(trip).route;
  const raw=route.map((p,i)=>{
    const location=locationMap.get(p.locationId);
    if(!location||!Number.isFinite(Number(location.lat))||!Number.isFinite(Number(location.lon))) return null;
    return {id:p.pointId||String(trip.id)+'-'+i,name:String(location.name||p.locationId),
      lat:Number(location.lat),lon:Number(location.lon),
      modeFromPrevious:i ? (p.modeFromPrevious||'plane') : null,
      legIdFromPrevious:i ? (p.legId||null) : null};
  }).filter(Boolean);
  const result=[];
  for(const item of raw){
    if(!result.length || milesBetween(result[result.length-1],item)>0.001) result.push(item);
  }
  return result;
}

function durationFor(stops,preset){
  let total=preset.introMs+preset.outroMs+
    (preset.firstHoldMs ?? preset.holdMs)+(preset.lastHoldMs ?? preset.holdMs)+
    Math.max(0,stops.length-2)*preset.holdMs;
  for(let i=1;i<stops.length;i++)total+=cinematicLegDurationMs(milesBetween(stops[i-1],stops[i]),stops[i].modeFromPrevious);
  return total;
}

// Three-dimensional unit-vector slerp, safe across the antimeridian.
function globeBetween(a,b,u){
  const vec=([lon,lat])=>{const x=lon*Math.PI/180,y=lat*Math.PI/180;
    return [Math.cos(y)*Math.cos(x),Math.cos(y)*Math.sin(x),Math.sin(y)];};
  const av=vec(a),bv=vec(b);
  const dot=clamp(av.reduce((n,x,i)=>n+x*bv[i],0),-1,1);
  const theta=Math.acos(dot);
  if(theta<0.00001||Math.abs(Math.sin(theta))<0.00001)
    return [a[0]+dlon(a[0],b[0])*u,a[1]+(b[1]-a[1])*u];
  const x=Math.sin((1-u)*theta)/Math.sin(theta);
  const y=Math.sin(u*theta)/Math.sin(theta);
  const v=av.map((w,i)=>w*x+bv[i]*y);
  return [Math.atan2(v[1],v[0])*180/Math.PI,Math.atan2(v[2],Math.hypot(v[0],v[1]))*180/Math.PI];
}

function bridgeCamera(a,b,u,sharedLocation=false){
  const t=smooth(u),far=Math.min(4.25,a.zoom,b.zoom);
  // Shared-city handoffs stay at the destination lens. Never execute the
  // normal globe-scale zoom-out envelope for a same-place transition.
  const base=a.zoom+(b.zoom-a.zoom)*t;
  const lift=sharedLocation?0:Math.sin(Math.PI*u)**2;
  return {center:globeBetween(a.center,b.center,t),
    zoom:base+(far-base)*lift,
    pitch:a.pitch+(b.pitch-a.pitch)*t,
    bearing:a.bearing+dlon(a.bearing,b.bearing)*t,
    segmentType:'bridge',stopIndex:-1,legIndex:-1,travelProgress:t};
}

export function createHistoryPlaylist(trips,locations,overrides={}){
  const preset={...CINEMATIC_PRESET,...overrides};
  const byId=new Map((Array.isArray(locations)?locations:[]).map(l=>[l.id,l]));
  const source=[...(Array.isArray(trips)?trips:[])].sort((a,b)=>dateKey(a).localeCompare(dateKey(b))||
    String(a.sortKey||'').localeCompare(String(b.sortKey||''))||String(a.id||'').localeCompare(String(b.id||'')));
  // Pre-index all valid itineraries so home-base seams can be recognized
  // before assigning durations. No underlying trip, leg, or history is merged.
  const valid=source.map(trip=>({trip,stops:stopsForTrip(trip,byId)}))
    .filter(item=>item.stops.length>=2);
  if(!valid.length)throw Error('No valid trips in history');
  const entries=[];
  let elapsed=0;
  for(let i=0;i<valid.length;i++){
    const {trip,stops}=valid[i];
    const previous=valid[i-1]?.stops,following=valid[i+1]?.stops;
    const sharedStart=Boolean(previous&&samePresentationLocation(previous.at(-1),stops[0]));
    const sharedEnd=Boolean(following&&samePresentationLocation(stops.at(-1),following[0]));
    const sceneOverrides={
      ...(sharedStart?{introMs:100,introZoomStart:preset.arrivalZoom,
        introPitchStart:preset.arrivalPitch,firstHoldMs:0}:{}),
      ...(sharedEnd?{outroMs:100,outroZoomEnd:preset.arrivalZoom,
        outroPitchEnd:preset.arrivalPitch,lastHoldMs:0}:{})
    };
    const durationMs=durationFor(stops,{...preset,...sceneOverrides});
    const bridgeDurationMs=i===valid.length-1?0:sharedEnd?SHARED_STOP_BRIDGE_MS:BRIDGE_MS;
    const entry={id:String(trip.id),title:String(trip.label||'Travel memory'),
      date:String(trip.displayDate||dateKey(trip)),stops,
      visual:visualForTrip(trip),notes:String(trip.notes||trip.occasion||''),
      mode:String(trip.mode||stops[1]?.modeFromPrevious||'plane'),
      year:Number(trip.year)||null,
      sharedStart,sharedEnd,sceneOverrides,bridgeDurationMs,
      legCount:stops.length-1,startMs:elapsed,endMs:elapsed+durationMs,
      durationMs,bridgeEndMs:elapsed+durationMs+bridgeDurationMs};
    entries.push(entry);elapsed=entry.bridgeEndMs;
  }
  const totalMs=entries.at(-1).endMs;
  const cache=new Map();
  let builds=0,reviewedLegs=0;
  // Independent, lightweight STATIC historical display archive. Does not
  // compile playback scenes and therefore never expands the 3-scene LRU.
  let archiveBuilt=0,archiveRoutes=[],archiveStops=[],seenHistoryStops=new Set();
  let routeOffsets=[0],legOffsets=[0],stopOffsets=[0],lastHistory=null;
  let stackedCorridors=new Map(),archiveLegCount=0;
  const asCollection=features=>({type:'FeatureCollection',features});
  function historicalGeometry(from,to,mode){
    const supplied=to.geometryFromPrevious;
    if(mode!=='plane'&&Array.isArray(supplied)&&supplied.length>=2){
      const points=supplied.map(p=>[p[0],p[1]]);
      points[0]=[from.lon,from.lat];
      points[points.length-1]=[to.lon,to.lat];
      return points;
    }
    return Array.from({length:49},(_,i)=>
      globeBetween([from.lon,from.lat],[to.lon,to.lat],i/48));
  }
  function archiveNextEntry(){
    const entry=entries[archiveBuilt];
    if(!entry)return;
    for(let i=1;i<entry.stops.length;i++){
      const from=entry.stops[i-1],to=entry.stops[i];
      const mode=to.modeFromPrevious||'plane';
      const corridor=routeStackKey(from,to);
      const occurrence=stackedCorridors.get(corridor)||0;
      stackedCorridors.set(corridor,occurrence+1);
      archiveRoutes.push(...coloredRouteFeatures(
        historicalGeometry(from,to,mode),entry.visual,{
          tripId:entry.id,legId:to.legIdFromPrevious||i,
          mode,history:true
        },stackOffsetForOccurrence(occurrence)));
      archiveLegCount++;
    }
    for(const stop of entry.stops){
      const key=stop.lon.toFixed(5)+','+stop.lat.toFixed(5);
      if(seenHistoryStops.has(key))continue;
      seenHistoryStops.add(key);
      archiveStops.push({type:'Feature',properties:{
        id:key,name:stop.name,history:true
      },geometry:{type:'Point',coordinates:[stop.lon,stop.lat]}});
    }
    routeOffsets.push(archiveRoutes.length);
    legOffsets.push(archiveLegCount);
    stopOffsets.push(archiveStops.length);
    archiveBuilt++;
  }
  function completedHistory(ms){
    const time=clamp(Number.isFinite(ms)?ms:0,0,totalMs);
    const i=indexAt(time);
    const count=time>=totalMs?entries.length:
      time>=entries[i].endMs?i+1:i;
    if(lastHistory?.count===count)return lastHistory;
    while(archiveBuilt<count)archiveNextEntry();
    lastHistory={count,routeCount:legOffsets[count],stopCount:stopOffsets[count],
      routes:asCollection(archiveRoutes.slice(0,routeOffsets[count])),
      stops:asCollection(archiveStops.slice(0,stopOffsets[count]))};
    return lastHistory;
  }
  function hydrateSurfaceRoutes(payload) {
    const routes=payload?.routes;
    if(!routes || typeof routes!=='object')return 0;
    let matched=0;
    for(const entry of entries){
      for(const stop of entry.stops.slice(1)){
        const key=entry.id+'::'+stop.legIdFromPrevious;
        const source=routes[key];
        if(source?.mode !== stop.modeFromPrevious || !Array.isArray(source.geometry) ||
           source.geometry.length<2)continue;
        stop.geometryFromPrevious=source.geometry;
        matched++;
      }
    }
    // Geometry is immutable within a compiled scene. Invalidate all cached
    // scenes when the snapshot arrives, before continuing playback.
    cache.clear();
    archiveBuilt=0;archiveRoutes=[];archiveStops=[];
    seenHistoryStops=new Set();routeOffsets=[0];legOffsets=[0];
    stopOffsets=[0];stackedCorridors=new Map();archiveLegCount=0;lastHistory=null;
    reviewedLegs=matched;
    return matched;
  }
  function sceneFor(index){
    if(!Number.isInteger(index)||index<0||index>=entries.length)return null;
    if(cache.has(index)){const x=cache.get(index);cache.delete(index);cache.set(index,x);return x;}
    const scene=buildCinematicScene(entries[index].stops,
      {...overrides,...entries[index].sceneOverrides});
    // Attach appearance metadata, never change motion/geometry or clock.
    scene.visual=entries[index].visual;
    if(Math.abs(scene.totalMs-entries[index].durationMs)>.0001)throw Error('Playlist scene timing mismatch');
    builds++;cache.set(index,scene);
    while(cache.size>MAX_SCENES)cache.delete(cache.keys().next().value);
    return scene;
  }
  function indexAt(ms){
    const t=clamp(Number.isFinite(ms)?ms:0,0,totalMs);
    let a=0,b=entries.length-1;
    while(a<b){const m=(a+b)>>1;if(t<entries[m].bridgeEndMs)b=m;else a=m+1;}
    return a;
  }
  function locate(ms){
    const t=clamp(Number.isFinite(ms)?ms:0,0,totalMs),index=indexAt(t),entry=entries[index];
    if(t>=entry.endMs&&index+1<entries.length){
      const a=sceneFor(index),b=sceneFor(index+1);
      return {kind:'bridge',entry,index,scene:null,localMs:a.totalMs,nextEntry:entries[index+1],
        pose:{...bridgeCamera(a.sample(a.totalMs),b.sample(0),
          clamp((t-entry.endMs)/Math.max(1,entry.bridgeDurationMs),0,1),
          entry.sharedEnd),elapsedMs:t}};
    }
    const scene=sceneFor(index),localMs=clamp(t-entry.startMs,0,scene.totalMs);
    return {kind:'trip',entry,index,scene,localMs,nextEntry:entries[index+1]||null,pose:scene.sample(localMs)};
  }
  const currentStops=ms=>{const s=locate(ms);return s.kind==='bridge'?s.nextEntry.stops:s.entry.stops;};
  function context(ms){
    const s=locate(ms),entry=s.kind==='bridge'?s.nextEntry:s.entry;
    const stops=entry.stops,pose=s.pose;
    const i=clamp(s.kind==='bridge'?0:pose.segmentType==='travel'?pose.legIndex+1:pose.stopIndex,0,stops.length-1);
    return {tripIndex:s.kind==='bridge'?s.index+1:s.index,tripCount:entries.length,
      tripId:entry.id,title:entry.title,date:entry.date,kind:s.kind,
      sharedStart:entry.sharedStart,visual:entry.visual,
      stops,stop:stops[i]};
  }
  return {
    entries,totalMs,tripCount:entries.length,
    legCount:entries.reduce((n,e)=>n+e.legCount,0),
    stopCount:entries.reduce((n,e)=>n+e.stops.length,0),
    locate,sceneFor,context,currentStops,hydrateSurfaceRoutes,completedHistory,
    currentStopTimes:ms=>{
      const s=locate(ms),entry=s.kind==='bridge'?s.nextEntry:s.entry;
      const scene=s.scene||sceneFor(indexAt(entry.startMs));
      const times=scene.stopTimesMs.map(t=>t+entry.startMs);
      return entry.sharedStart?times.slice(1):times;
    },
    sample:ms=>locate(ms).pose,
    planeAt:ms=>{const s=locate(ms);return s.scene?.planeAt(s.localMs)||null;},
    arrivalAt:ms=>{const s=locate(ms);return s.scene?.arrivalAt(s.localMs)||null;},
    visibleStops:ms=>{const s=locate(ms);return s.scene?.visibleStops(s.localMs)||[];},
    visibleRoutes:ms=>{const s=locate(ms);return s.scene?.visibleRoutes(s.localMs)||[];},
    primeNear(ms){const i=indexAt(ms);sceneFor(i);if(i+1<entries.length)sceneFor(i+1);if(i>0)sceneFor(i-1);},
    stats:()=>({trips:entries.length,cachedScenes:cache.size,builds,
      sharedStopSeams:entries.filter(e=>e.sharedStart).length,
      reviewedSurfaceLegs:reviewedLegs,maxCachedScenes:MAX_SCENES})
  };
}

/**
 * WP4 loop closure: camera travels from the end of the final trip back to
 * the very first frame, entirely at the globe level. End and start have
 * exactly the same pose, so rewinding playback time produces no visual cut.
 */
export const EXHIBITION_WRAP_MS = 3600;

export function withExhibitionLoop(base, wrapMs = EXHIBITION_WRAP_MS) {
  if (!base || !Number.isFinite(base.totalMs) || base.totalMs <= 0 ||
      !Number.isFinite(wrapMs) || wrapMs < 500 || wrapMs > 30000) {
    throw new Error('Invalid exhibition playlist or wrap duration');
  }
  const naturalEnd = base.totalMs;
  const totalMs = naturalEnd + wrapMs;
  const last = base.sample(naturalEnd);
  const first = base.sample(0);
  const finalEntry = base.entries[base.entries.length - 1];
  const firstEntry = base.entries[0];
  function locate(ms) {
    const time = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    if (time < naturalEnd) return base.locate(time);
    const u = clamp((time - naturalEnd) / wrapMs, 0, 1);
    const pose = u >= 1 ? { ...first, elapsedMs: time } :
      { ...bridgeCamera(last, first, u), elapsedMs: time };
    return { kind: 'bridge', index: base.entries.length - 1,
      entry: finalEntry, nextEntry: firstEntry,
      scene: null, localMs: finalEntry.durationMs, pose };
  }
  const isWrap = ms => Number(ms) >= naturalEnd;
  const inTrip = (method, ms, fallback) =>
    isWrap(ms) ? fallback : base[method](ms);
  return {
    ...base,
    totalMs,
    naturalEndMs: naturalEnd,
    wrapMs,
    locate,
    sample: ms => locate(ms).pose,
    planeAt: ms => inTrip('planeAt', ms, null),
    arrivalAt: ms => inTrip('arrivalAt', ms, null),
    visibleStops: ms => inTrip('visibleStops', ms, []),
    visibleRoutes: ms => inTrip('visibleRoutes', ms, []),
    currentStops: ms => inTrip('currentStops', ms, firstEntry.stops),
    currentStopTimes: ms => inTrip('currentStopTimes', ms, []),
    completedHistory: ms => base.completedHistory(
      isWrap(ms)?naturalEnd:ms),
    context(ms) {
      if (!isWrap(ms)) return base.context(ms);
      return {
        ...base.context(0),
        kind: 'bridge', tripIndex: 0, tripCount: base.tripCount,
        title: firstEntry.title, date: firstEntry.date,
        stop: firstEntry.stops[0], stops: firstEntry.stops
      };
    },
    stats() { return { ...base.stats(), loopClosureMs: wrapMs }; }
  };
}

export function createEightStopPlaylist(stops){
  const scene=buildCinematicScene(stops);
  const entry={id:'demo',title:'Eight-stop demonstration',date:'Demo route',
    stops:scene.stops,legCount:scene.legs.length,durationMs:scene.totalMs,startMs:0,
    endMs:scene.totalMs,bridgeEndMs:scene.totalMs};
  const locate=ms=>{const t=clamp(Number.isFinite(ms)?ms:0,0,scene.totalMs);
    return {kind:'trip',entry,index:0,scene,localMs:t,nextEntry:null,pose:scene.sample(t)};};
  return {entries:[entry],totalMs:scene.totalMs,tripCount:1,
    legCount:scene.legs.length,stopCount:scene.stops.length,
    locate,sample:ms=>locate(ms).pose,sceneFor:()=>scene,
    hydrateSurfaceRoutes:()=>0,
    completedHistory:()=>({
      count:0,routeCount:0,stopCount:0,
      routes:{type:'FeatureCollection',features:[]},
      stops:{type:'FeatureCollection',features:[]}
    }),
    planeAt:ms=>scene.planeAt(ms),arrivalAt:ms=>scene.arrivalAt(ms),
    visibleStops:ms=>scene.visibleStops(ms),visibleRoutes:ms=>scene.visibleRoutes(ms),
    currentStops:()=>scene.stops,currentStopTimes:()=>scene.stopTimesMs,
    context(ms){const p=scene.sample(ms),i=clamp(p.segmentType==='travel'?p.legIndex+1:p.stopIndex,0,scene.stops.length-1);
      return {tripIndex:0,tripCount:1,tripId:'demo',title:entry.title,date:entry.date,
        kind:'trip',stops:scene.stops,stop:scene.stops[i]};},
    primeNear(){},stats:()=>({trips:1,cachedScenes:1,builds:1,maxCachedScenes:1})
  };
}
