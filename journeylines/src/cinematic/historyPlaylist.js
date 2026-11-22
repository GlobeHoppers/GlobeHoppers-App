/**
 * WP3 chronological player. 178-trip metadata stays lightweight; route geometry
 * is compiled only for the current/nearby trip (3-scene LRU).
 */
import { normalizeTripForV61 } from '../utils/tripModel.js';
import { milesBetween } from '../utils/distanceUtils.js';
import { CINEMATIC_PRESET, buildCinematicScene, cinematicLegDurationMs } from './scene.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=x=>{const t=clamp(x,0,1);return t*t*t*(t*(t*6-15)+10);};
const dlon=(a,b)=>((b-a+540)%360)-180;
const BRIDGE_MS=3200, MAX_SCENES=3;
const dateKey=t=>String(t.year||0).padStart(4,'0')+'-'+String(t.month||1).padStart(2,'0')+'-'+String(t.day||1).padStart(2,'0');

export function stopsForTrip(trip,locationMap){
  const route=normalizeTripForV61(trip).route;
  const raw=route.map((p,i)=>{
    const location=locationMap.get(p.locationId);
    if(!location||!Number.isFinite(Number(location.lat))||!Number.isFinite(Number(location.lon))) return null;
    return {id:p.pointId||String(trip.id)+'-'+i,name:String(location.name||p.locationId),
      lat:Number(location.lat),lon:Number(location.lon),
      modeFromPrevious:i ? (p.modeFromPrevious||'plane') : null};
  }).filter(Boolean);
  const result=[];
  for(const item of raw){
    if(!result.length || milesBetween(result[result.length-1],item)>0.001) result.push(item);
  }
  return result;
}

function durationFor(stops,preset){
  let total=preset.introMs+preset.outroMs+stops.length*preset.holdMs;
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

function bridgeCamera(a,b,u){
  const t=smooth(u), far=Math.min(2.25,a.zoom,b.zoom);
  return {center:globeBetween(a.center,b.center,t),
    zoom:u<.5?a.zoom+(far-a.zoom)*smooth(u*2):far+(b.zoom-far)*smooth((u-.5)*2),
    pitch:a.pitch+(b.pitch-a.pitch)*t,
    bearing:a.bearing+dlon(a.bearing,b.bearing)*t,
    segmentType:'bridge',stopIndex:-1,legIndex:-1,travelProgress:t};
}

export function createHistoryPlaylist(trips,locations,overrides={}){
  const preset={...CINEMATIC_PRESET,...overrides};
  const byId=new Map((Array.isArray(locations)?locations:[]).map(l=>[l.id,l]));
  const source=[...(Array.isArray(trips)?trips:[])].sort((a,b)=>dateKey(a).localeCompare(dateKey(b))||
    String(a.sortKey||'').localeCompare(String(b.sortKey||''))||String(a.id||'').localeCompare(String(b.id||'')));
  const entries=[];
  let elapsed=0;
  for(const trip of source){
    const stops=stopsForTrip(trip,byId);
    if(stops.length<2)continue;
    const durationMs=durationFor(stops,preset);
    const entry={id:String(trip.id),title:String(trip.label||'Travel memory'),
      date:String(trip.displayDate||dateKey(trip)),stops,
      legCount:stops.length-1,startMs:elapsed,endMs:elapsed+durationMs,
      durationMs,bridgeEndMs:elapsed+durationMs+BRIDGE_MS};
    entries.push(entry); elapsed=entry.bridgeEndMs;
  }
  if(!entries.length)throw Error('No valid trips in history');
  entries[entries.length-1].bridgeEndMs=entries.at(-1).endMs;
  const totalMs=entries.at(-1).endMs;
  const cache=new Map();
  let builds=0;
  function sceneFor(index){
    if(!Number.isInteger(index)||index<0||index>=entries.length)return null;
    if(cache.has(index)){const x=cache.get(index);cache.delete(index);cache.set(index,x);return x;}
    const scene=buildCinematicScene(entries[index].stops,overrides);
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
        pose:{...bridgeCamera(a.sample(a.totalMs),b.sample(0),clamp((t-entry.endMs)/BRIDGE_MS,0,1)),elapsedMs:t}};
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
      stops,stop:stops[i]};
  }
  return {
    entries,totalMs,tripCount:entries.length,
    legCount:entries.reduce((n,e)=>n+e.legCount,0),
    stopCount:entries.reduce((n,e)=>n+e.stops.length,0),
    locate,sceneFor,context,currentStops,
    currentStopTimes:ms=>{const s=locate(ms);return s.scene?s.scene.stopTimesMs.map(t=>t+s.entry.startMs):[];},
    sample:ms=>locate(ms).pose,
    planeAt:ms=>{const s=locate(ms);return s.scene?.planeAt(s.localMs)||null;},
    arrivalAt:ms=>{const s=locate(ms);return s.scene?.arrivalAt(s.localMs)||null;},
    visibleStops:ms=>{const s=locate(ms);return s.scene?.visibleStops(s.localMs)||[];},
    visibleRoutes:ms=>{const s=locate(ms);return s.scene?.visibleRoutes(s.localMs)||[];},
    primeNear(ms){const i=indexAt(ms);sceneFor(i);if(i+1<entries.length)sceneFor(i+1);if(i>0)sceneFor(i-1);},
    stats:()=>({trips:entries.length,cachedScenes:cache.size,builds,maxCachedScenes:MAX_SCENES})
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
    planeAt:ms=>scene.planeAt(ms),arrivalAt:ms=>scene.arrivalAt(ms),
    visibleStops:ms=>scene.visibleStops(ms),visibleRoutes:ms=>scene.visibleRoutes(ms),
    currentStops:()=>scene.stops,currentStopTimes:()=>scene.stopTimesMs,
    context(ms){const p=scene.sample(ms),i=clamp(p.segmentType==='travel'?p.legIndex+1:p.stopIndex,0,scene.stops.length-1);
      return {tripIndex:0,tripCount:1,tripId:'demo',title:entry.title,date:entry.date,
        kind:'trip',stops:scene.stops,stop:scene.stops[i]};},
    primeNear(){},stats:()=>({trips:1,cachedScenes:1,builds:1,maxCachedScenes:1})
  };
}
