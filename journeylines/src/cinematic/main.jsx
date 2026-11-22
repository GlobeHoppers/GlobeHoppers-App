import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PlaybackEngine } from '../utils/playbackEngine.js';
import { demoStops } from './demoStops.js';
import { createHistoryPlaylist, createEightStopPlaylist } from './historyPlaylist.js';
import tripHistory from '../data/trips.json';
import locations from '../data/locations.json';
import { installCinematicLayers, updateCinematicRoute, clearCinematicRoute } from './mapLayers.js';
import { updateCinematicActors } from './actorOverlay.js';
import { createImageryPreflight } from './imageryPreflight.js';
import { EARTH_PRESETS, DEFAULT_EARTH_PRESET, validEarthPreset,
  installCinematicEarth, setCinematicEarthPreset, getCinematicEarthState } from './earthStyles.js';
import airplanePng from '../Icons/Airplanes/Airplane - Blue.png?url';
import carPng from '../Icons/Cars/Car - Blue.png?url';
import boatPng from '../Icons/Boats/Boat - Blue.png?url';
import trainPng from '../Icons/Trains/Train - Blue.png?url';
import './cinematic.css';

const query = new URLSearchParams(window.location.search);
const DEMO_MODE = query.get('demo') === '1';
const CAPTURE_MODE = query.get('capture') === '1';
const MAP_STORAGE_KEY = 'cinematic-globehoppers-earth-preset-v1';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/fiord';
const VEHICLE_IMAGES = { plane: airplanePng, drive: carPng, boat: boatPng, train: trainPng };
const playlist = DEMO_MODE ? createEightStopPlaylist(demoStops) :
  createHistoryPlaylist(tripHistory, locations);
const warmup = createImageryPreflight();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const formatClock = ms => {
  const seconds=Math.max(0,Math.floor(ms/1000));
  const hours=Math.floor(seconds/3600);
  const minutes=Math.floor(seconds%3600/60);
  const tail=String(seconds%60).padStart(2,'0');
  return hours ? hours+':'+String(minutes).padStart(2,'0')+':'+tail :
    String(minutes).padStart(2,'0')+':'+tail;
};
function initialPreset() {
  const requested=query.get('map');
  if(validEarthPreset(requested))return requested;
  try{const saved=localStorage.getItem(MAP_STORAGE_KEY);
    if(validEarthPreset(saved))return saved;}catch{}
  return DEFAULT_EARTH_PRESET;
}

function CinematicApp(){
  const mapContainer=useRef(null);
  const mapRef=useRef(null);
  const layersReady=useRef(false);
  const planeRef=useRef(null),planeImageRef=useRef(null);
  const arrivalRef=useRef(null),arrivalNameRef=useRef(null);
  const engineRef=useRef(null);
  if(!engineRef.current)engineRef.current=new PlaybackEngine();
  const elapsedRef=useRef(0);
  const routeUpdatedRef=useRef(-Infinity);
  const routeSegmentRef=useRef('');
  const previousTripRef=useRef(-1);
  const uiRef=useRef(0);
  const gateRef=useRef({key:null,active:false,token:0});
  const [display,setDisplay]=useState({playing:false,ms:0,fps:60,quality:'high'});
  const [speed,setSpeed]=useState(1);
  const [mapPreset,setMapPreset]=useState(initialPreset);
  const presetRef=useRef(mapPreset);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [diagnostics,setDiagnostics]=useState(false);
  const [warming,setWarming]=useState(false);

  const updateAt=useCallback((ms,force=false)=>{
    const clip=playlist.locate(ms),pose=clip.pose;
    const map=mapRef.current;
    if(!map||!layersReady.current)return pose;
    // v9 clock owns camera and vehicle together, independent from GeoJSON cadence.
    map.jumpTo({center:pose.center,zoom:pose.zoom,pitch:pose.pitch,bearing:pose.bearing});
    updateCinematicActors(map,playlist,ms,{
      planeRoot:planeRef.current,planeVisual:planeImageRef.current,
      arrivalRoot:arrivalRef.current,arrivalName:arrivalNameRef.current,
      vehicleImages:VEHICLE_IMAGES
    });
    if(force||Math.abs(ms-routeUpdatedRef.current)>=65||
       pose.segmentType!==routeSegmentRef.current){
      if(clip.kind==='trip')updateCinematicRoute(map,clip.scene,clip.localMs);
      else clearCinematicRoute(map);
      routeUpdatedRef.current=ms;routeSegmentRef.current=pose.segmentType;
    }
    return pose;
  },[]);

  useEffect(()=>{
    let map;
    try{
      const start=playlist.sample(0);
      map=new maplibregl.Map({
        container:mapContainer.current,style:MAP_STYLE,projection:{type:'globe'},
        center:start.center,zoom:start.zoom,pitch:start.pitch,bearing:start.bearing,
        minZoom:1.5,maxZoom:14,antialias:true,attributionControl:true
      });
    }catch(e){setError('Unable to initialize WebGL. Check browser GPU acceleration.');return;}
    mapRef.current=map;
    const manual=()=>{if(engineRef.current.snapshot().playing)engineRef.current.pause();};
    map.on('mousedown',manual);map.on('touchstart',manual);map.on('wheel',manual);
    map.on('move',()=>{
      if(!layersReady.current||engineRef.current.snapshot().playing)return;
      updateCinematicActors(map,playlist,elapsedRef.current,{
        planeRoot:planeRef.current,planeVisual:planeImageRef.current,
        arrivalRoot:arrivalRef.current,arrivalName:arrivalNameRef.current,
        vehicleImages:VEHICLE_IMAGES
      });
    });
    map.on('load',()=>{
      try{
        installCinematicEarth(map,presetRef.current);
        installCinematicLayers(map,playlist.locate(0).scene);
        layersReady.current=true;
        updateAt(elapsedRef.current,true);
        setReady(true);
      }catch(e){setError('Unable to initialize cinematic map layers: '+(e?.message||String(e)));}
    });
    map.on('error',e=>{
      if(e.error&&!layersReady.current)setError('Base map could not load. Check your connection.');
    });
    return ()=>{layersReady.current=false;mapRef.current=null;map.remove();};
  },[updateAt]);

  useEffect(()=>{
    const engine=engineRef.current;
    const unsubscribe=engine.subscribe(state=>{
      const ms=clamp(state.progress,0,1)*playlist.totalMs;
      const clip=playlist.locate(ms);
      if(clip.index!==previousTripRef.current){
        previousTripRef.current=clip.index;
        if(!DEMO_MODE){
          const compile=()=>playlist.primeNear(ms);
          if(window.requestIdleCallback)window.requestIdleCallback(compile,{timeout:1500});
          else window.setTimeout(compile,150);
        }
      }
      if(clip.kind==='trip'&&clip.pose.segmentType==='travel'){
        const leg=clip.scene.legs[clip.pose.legIndex];
        const key=clip.entry.id+':'+leg.index+':'+presetRef.current;
        const job=warmup.schedule(leg.to,presetRef.current);
        const phase=(clip.localMs-leg.startMs)/leg.durationMs;
        if(state.playing&&phase>=0.63&&phase<0.79&&
           job.status==='loading'&&gateRef.current.key!==key){
          const token=gateRef.current.token+1;
          gateRef.current={key,active:true,token};
          engine.pause();setWarming(true);
          Promise.race([job.promise,new Promise(resolve=>setTimeout(resolve,4500))])
            .finally(()=>{
              if(!gateRef.current.active||gateRef.current.token!==token)return;
              gateRef.current.active=false;setWarming(false);engine.play();
            });
          return;
        }
      }else if(clip.kind==='trip'){
        const next=Math.min(clip.scene.stops.length-1,Math.max(1,clip.pose.stopIndex+1));
        warmup.schedule(clip.scene.stops[next],presetRef.current);
      }
      elapsedRef.current=ms;
      updateAt(ms,!state.playing);
      const now=performance.now();
      if(!state.playing||now-uiRef.current>65){
        uiRef.current=now;
        setDisplay({playing:state.playing,ms,
          fps:Math.round(1000/Math.max(1,state.frameMs)),quality:state.quality});
      }
    });
    engine.configure({duration:playlist.totalMs,progress:0});
    return ()=>{engine.pause();unsubscribe();gateRef.current.active=false;};
  },[updateAt]);

  const cancelGate=()=>{
    gateRef.current.active=false;
    gateRef.current.token++;
    setWarming(false);
  };
  const seek=ms=>{
    cancelGate();
    routeUpdatedRef.current=-Infinity;
    engineRef.current.seek(clamp(ms,0,playlist.totalMs)/playlist.totalMs);
  };
  const choosePreset=id=>{
    if(!validEarthPreset(id))return;
    if(mapRef.current&&layersReady.current)setCinematicEarthPreset(mapRef.current,id);
    presetRef.current=id;setMapPreset(id);
    try{localStorage.setItem(MAP_STORAGE_KEY,id);}catch{}
  };
  const togglePlay=()=>{
    if(gateRef.current.active){cancelGate();return;}
    const clock=engineRef.current;
    if(clock.snapshot().playing)clock.pause();
    else{if(clock.snapshot().progress>=1)clock.stop(0);clock.play();}
  };
  const changeSpeed=value=>{
    const next=Number(value);
    if(![.5,1,1.5,2].includes(next))return;
    const clock=engineRef.current;
    clock.configure({duration:playlist.totalMs/next,progress:clock.snapshot().progress});
    setSpeed(next);
  };

  useEffect(()=>{
    const api=Object.freeze({
      version:'cinematic-globehoppers.wp3',
      durationMs:playlist.totalMs,stopCount:playlist.stopCount,
      tripCount:playlist.tripCount,legCount:playlist.legCount,
      seekMs(ms){
        const time=clamp(Number(ms)||0,0,playlist.totalMs);
        gateRef.current.active=false;gateRef.current.token++;
        setWarming(false);
        engineRef.current.pause();
        engineRef.current.seek(time/playlist.totalMs);
        return playlist.sample(time);
      },
      sampleAtMs:ms=>playlist.sample(ms),
      projectAircraftAtMs(ms){
        const actor=playlist.planeAt(ms),map=mapRef.current;
        if(!actor||!map||!layersReady.current)return null;
        const point=map.project(actor.coordinates);return{x:point.x,y:point.y};
      },
      getPresentationAtMs(ms){
        return{visibleStops:playlist.visibleStops(ms).map(s=>s.id),
          visibleRouteCount:playlist.visibleRoutes(ms).length,
          plane:playlist.planeAt(ms),arrival:playlist.arrivalAt(ms)};
      },
      getMapDetails:()=>mapRef.current?getCinematicEarthState(mapRef.current):null,
      setMapPreset(id){if(!validEarthPreset(id))return false;choosePreset(id);return true;},
      getPlaylistDetails(){return{...playlist.stats(),durationMs:playlist.totalMs,
        tripCount:playlist.tripCount,legCount:playlist.legCount,stopCount:playlist.stopCount,
        current:playlist.context(elapsedRef.current),preflight:warmup.stats()};},
      getState(){return{elapsedMs:elapsedRef.current,ready:layersReady.current,
        mapPreset:presetRef.current,buffering:gateRef.current.active};}
    });
    window.__CINEMATIC_GLOBEHOPPERS__=api;
    return()=>{delete window.__CINEMATIC_GLOBEHOPPERS__;};
  },[]);

  const pose=playlist.sample(display.ms);
  const info=playlist.context(display.ms);
  const currentStop=info.stop;
  const currentStops=info.stops;
  const stopTimes=playlist.currentStopTimes(display.ms);
  const arrival=playlist.arrivalAt(display.ms);
  return (
    <div className="cg-app" data-capture={CAPTURE_MODE?'true':'false'} data-map-preset={mapPreset}>
      <div ref={mapContainer} className="cg-map" aria-label="Cinematic globe with chronological travel history"/>
      <div className="cg-vignette" aria-hidden="true"/>
      <div className="cg-actors" aria-hidden="true">
        <div className="cg-aircraft" ref={planeRef} style={{visibility:'hidden'}}>
          <img ref={planeImageRef} className="cg-aircraft-img"
            src={airplanePng} alt="" draggable={false}/>
        </div>
        <div className="cg-arrival-anchor" ref={arrivalRef} style={{visibility:'hidden'}}>
          <div className="cg-arrival-label">
            <strong ref={arrivalNameRef} className="cg-arrival-place"/>
            <span className="cg-arrival-stem"/>
          </div>
        </div>
      </div>
      {warming&&<div className="cg-preloading" role="status">Preparing destination imagery…</div>}
      {!CAPTURE_MODE&&<>
        <header className="cg-topbar">
          <div className="cg-brand">
            <span className="cg-brand-icon" aria-hidden="true">✦</span>
            <div><div className="cg-kicker">GLOBEHOPPERS · CINEMATIC VIEWER</div>
              <h1>Cinematic <span>GlobeHoppers</span></h1></div>
          </div>
          <div className="cg-meta">
            <span className="cg-dataset">{DEMO_MODE?'8 stops · demo route':
              playlist.tripCount+' trips · '+playlist.legCount+' legs'}</span>
            <label className="cg-map-selector">
              <span>Globe</span>
              <select value={mapPreset} aria-label="Globe appearance"
                onChange={e=>choosePreset(e.target.value)}>
                {EARTH_PRESETS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <button type="button" onClick={()=>setDiagnostics(v=>!v)} aria-pressed={diagnostics}>Diagnostics</button>
          </div>
        </header>
        {error&&<div className="cg-alert" role="alert">{error}</div>}
        {!ready&&!error&&<div className="cg-loading" role="status">Preparing cinematic globe…</div>}
        <div className={'cg-flyout'+(arrival?' is-arriving':'')} aria-live="off">
          <div className="cg-flyout-kicker">
            {info.kind==='bridge'?'NEXT JOURNEY':pose.segmentType==='travel'?'NOW TRAVELING TO':'EXPLORING'}
          </div>
          <div className="cg-flyout-place">{currentStop?.name||'GlobeHoppers'}</div>
          <div className="cg-flyout-sub">{DEMO_MODE?'Cinematic flight path':info.date+' · '+info.title}</div>
        </div>
        {diagnostics&&<aside className="cg-diagnostics" aria-label="Camera diagnostics">
          <div>Camera {pose.segmentType}</div>
          <div>Zoom {pose.zoom.toFixed(2)} · Pitch {pose.pitch.toFixed(1)}°</div>
          <div>Bearing {pose.bearing.toFixed(1)}° (north ±45°)</div>
          <div>Vehicle {playlist.planeAt(display.ms)?.mode||'hidden'}</div>
          <div>Trip {info.tripIndex+1} / {playlist.tripCount}</div>
          <div>Cached scenes {playlist.stats().cachedScenes}</div>
          <div>Visible stops {playlist.visibleStops(display.ms).length} / {currentStops.length}</div>
          <div>Frame {display.fps} FPS · {display.quality}</div>
          <div>Clock {Math.round(display.ms)} ms</div>
          <div>Map {mapPreset} · Imagery {warming?'preparing':'active'}</div>
        </aside>}
        <section className="cg-console" aria-label="Cinematic playback controls">
          <div className="cg-controls">
            <button className="cg-play" type="button" disabled={!ready}
              onClick={togglePlay} aria-label={display.playing?'Pause playback':'Play cinematic route'}>
              {display.playing?'Ⅱ':'▶'}
            </button>
            <button className="cg-restart" type="button" disabled={!ready}
              onClick={()=>{engineRef.current.pause();seek(0);}}
              aria-label="Restart cinematic route">↺</button>
            <div className="cg-clock">{formatClock(display.ms)}
              <span> / {formatClock(playlist.totalMs)}</span>
            </div>
            <label className="cg-speed">Speed
              <select value={speed} aria-label="Playback speed" onChange={e=>changeSpeed(e.target.value)}>
                <option value=".5">0.5×</option><option value="1">1×</option>
                <option value="1.5">1.5×</option><option value="2">2×</option>
              </select>
            </label>
          </div>
          <input className="cg-scrubber" type="range" min="0" max={playlist.totalMs}
            step="25" value={display.ms} disabled={!ready} aria-label="Seek cinematic playback"
            onChange={e=>seek(Number(e.target.value))}/>
          <div className="cg-stoplist" aria-label={DEMO_MODE?'Eight demo stops':'Stops in current trip'}>
            {currentStops.map((stop,index)=>
              <button key={stop.id} type="button" disabled={!ready}
                className={'cg-stop'+(currentStop?.id===stop.id?' is-current':'')}
                onClick={()=>{engineRef.current.pause();seek(stopTimes[index]??display.ms);}}>
                <span className="cg-stop-num">{String(index+1).padStart(2,'0')}</span>
                <span>{stop.name}</span>
              </button>)}
          </div>
          {!DEMO_MODE&&<div className="cg-history-transport">
            <button type="button" disabled={!ready||info.tripIndex===0}
              onClick={()=>{engineRef.current.pause();seek(playlist.entries[Math.max(0,info.tripIndex-1)].startMs);}}>
              Previous trip</button>
            <span>{info.date} · Trip {info.tripIndex+1} of {playlist.tripCount}</span>
            <button type="button" disabled={!ready||info.tripIndex>=playlist.entries.length-1}
              onClick={()=>{engineRef.current.pause();seek(playlist.entries[Math.min(playlist.entries.length-1,info.tripIndex+1)].startMs);}}>
              Next trip</button>
          </div>}
        </section>
        <footer className="cg-footnote">NASA Blue Marble · EOX Sentinel-2 Cloudless · MapLibre / OpenFreeMap · No Mult.dev calls</footer>
      </>}
    </div>
  );
}
createRoot(document.getElementById('cinematic-root')).render(<CinematicApp/>);
