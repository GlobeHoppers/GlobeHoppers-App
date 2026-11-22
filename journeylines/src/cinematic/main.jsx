import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PlaybackEngine } from '../utils/playbackEngine.js';
import { demoStops } from './demoStops.js';
import { createHistoryPlaylist, createEightStopPlaylist, withExhibitionLoop } from './historyPlaylist.js';
import { EXHIBITION_IDLE_MS, EXHIBITION_WATCHDOG_MS, exhibitionRetryDelay, createExhibitionUi } from './exhibition.js';
import tripHistory from '../data/trips.json';
import locations from '../data/locations.json';
import { installCinematicLayers, updateCinematicRoute, clearCinematicRoute } from './mapLayers.js';
import { updateCinematicActors } from './actorOverlay.js';
import { createImageryPreflight } from './imageryPreflight.js';
import { prepareLocalEarth, getLocalEarthStatus, LOCAL_EARTH_STYLE, localEarthCameraPose } from './localEarth.js';
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
const EXHIBITION_MODE = query.get('exhibition') === '1' && !CAPTURE_MODE;
const CHECKPOINT_KEY = 'cinematic-globehoppers-exhibition-checkpoint-v1';
const MAP_STORAGE_KEY = 'cinematic-globehoppers-earth-preset-v1';
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/fiord';
const VEHICLE_IMAGES = { plane: airplanePng, drive: carPng, boat: boatPng, train: trainPng };
const sourcePlaylist = DEMO_MODE ? createEightStopPlaylist(demoStops) :
  createHistoryPlaylist(tripHistory, locations);
const playlist = EXHIBITION_MODE ? withExhibitionLoop(sourcePlaylist) : sourcePlaylist;
function readCheckpoint() {
  if (!EXHIBITION_MODE || query.get('reset') === '1') return 0;
  try {
    const data=JSON.parse(localStorage.getItem(CHECKPOINT_KEY)||'null');
    if (data?.durationMs !== playlist.totalMs || data?.tripCount !== playlist.tripCount ||
        !Number.isFinite(data.ms) || data.ms < 0 || data.ms >= playlist.totalMs ||
        Date.now()-data.savedAt > 7*24*60*60*1000 || data.savedAt>Date.now()+60000) return 0;
    return data.ms;
  } catch { return 0; }
}
const START_MS=readCheckpoint();
function saveCheckpoint(ms) {
  if (!EXHIBITION_MODE) return;
  try { localStorage.setItem(CHECKPOINT_KEY,JSON.stringify({
    durationMs:playlist.totalMs,tripCount:playlist.tripCount,
    ms:clamp(ms,0,playlist.totalMs),savedAt:Date.now()
  })); } catch { /* Private browsing can disable storage. */ }
}
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
  // A dedicated screen starts with the self-contained globe regardless of
  // what someone previously selected in the interactive viewer.
  if(EXHIBITION_MODE)return 'local';
  try{const saved=localStorage.getItem(MAP_STORAGE_KEY);
    if(validEarthPreset(saved))return saved;}catch{}
  return DEFAULT_EARTH_PRESET;
}

function CinematicApp(){
  const appRoot=useRef(null);
  const mapContainer=useRef(null);
  const mapRef=useRef(null);
  const layersReady=useRef(false);
  const planeRef=useRef(null),planeImageRef=useRef(null);
  const arrivalRef=useRef(null),arrivalNameRef=useRef(null);
  const engineRef=useRef(null);
  if(!engineRef.current)engineRef.current=new PlaybackEngine();
  const elapsedRef=useRef(START_MS);
  const mapHeartbeat=useRef(0);
  const mapAttemptStarted=useRef(0);
  const recoverTimer=useRef(null);
  const recoverHandler=useRef(null);
  const recoveryAttempts=useRef(0);
  const recoveryShouldResume=useRef(false);
  const autoStarted=useRef(false);
  const visibilityPaused=useRef(false);
  const manuallyPaused=useRef(false);
  const checkpointMs=useRef(START_MS);
  const loopCount=useRef(0);
  const wakeLock=useRef(null);
  const routeUpdatedRef=useRef(-Infinity);
  const routeSegmentRef=useRef('');
  const previousTripRef=useRef(-1);
  const uiRef=useRef(0);
  const gateRef=useRef({key:null,active:false,token:0});
  const [display,setDisplay]=useState({playing:false,ms:START_MS,fps:60,quality:'high'});
  const [speed,setSpeed]=useState(1);
  const [mapPreset,setMapPreset]=useState(initialPreset);
  const presetRef=useRef(mapPreset);
  const styleResumeRef=useRef(false);
  const [localEarthProgress,setLocalEarthProgress]=useState({ready:false,done:0,total:341});
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  const [diagnostics,setDiagnostics]=useState(false);
  const [warming,setWarming]=useState(false);
  const [surfaceReady,setSurfaceReady]=useState(DEMO_MODE);
  const [surfaceRoutesCount,setSurfaceRoutesCount]=useState(0);
  const [controlsVisible,setControlsVisible]=useState(!EXHIBITION_MODE);
  const keyboardFocus=useRef(false);
  const [mapGeneration,setMapGeneration]=useState(0);
  const mapGenerationRef=useRef(0);
  const [recoveryMessage,setRecoveryMessage]=useState('');
  const [offline,setOffline]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);

  // Load reviewed v9 surface routes once from our own static snapshot.
  // Do not start the camera with placeholder straight car/boat lines.
  useEffect(()=>{
    if(DEMO_MODE)return;
    const abort=new AbortController();
    const url=new URL('../data/cinematic/surface-routes.json',window.location.href);
    fetch(url.toString(),{signal:abort.signal,cache:'force-cache'})
      .then(response=>{
        if(!response.ok)throw Error('Surface snapshot HTTP '+response.status);
        return response.json();
      })
      .then(data=>{
        if(abort.signal.aborted)return;
        if(data.schema!=='cinematic-globehoppers.surface-routes.v1')
          throw Error('Unrecognized route snapshot');
        setSurfaceRoutesCount(playlist.hydrateSurfaceRoutes(data));
        setSurfaceReady(true);
      })
      .catch(error=>{
        if(abort.signal.aborted)return;
        console.warn('[Cinematic GlobeHoppers] Using endpoint geometry fallback',error);
        setSurfaceReady(true);
      });
    return()=>abort.abort();
  },[]);

  const updateAt=useCallback((ms,force=false)=>{
    const clip=playlist.locate(ms),pose=localEarthCameraPose(clip.pose,presetRef.current);
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
    if(!surfaceReady)return;
    let map,canvas,disposed=false;
    // Rebuilds preserve the exact playback timestamp and don't replace v9's clock.
    const recover=(message)=>{
      if(!EXHIBITION_MODE){setError(message);return;}
      if(recoverTimer.current!=null)return;
      recoveryShouldResume.current = recoveryShouldResume.current ||
        engineRef.current.snapshot().playing ||
        (!autoStarted.current&&!manuallyPaused.current);
      if(gateRef.current.active){
        gateRef.current.active=false;gateRef.current.token++;
        setWarming(false);
      }
      if(engineRef.current.snapshot().playing)engineRef.current.pause();
      layersReady.current=false;
      setReady(false);
      setRecoveryMessage(message);
      const retryMs=exhibitionRetryDelay(recoveryAttempts.current++);
      recoverTimer.current=window.setTimeout(()=>{
        recoverTimer.current=null;
        setMapGeneration(value=>{mapGenerationRef.current=value+1;return value+1;});
      },retryMs);
    };
    recoverHandler.current=recover;
    const initialize=()=>{
    if(disposed)return;
    try{
      const start=localEarthCameraPose(playlist.sample(elapsedRef.current),presetRef.current);
      map=new maplibregl.Map({
        container:mapContainer.current,
        style:presetRef.current==='local'?LOCAL_EARTH_STYLE:MAP_STYLE,
        projection:{type:'globe'},
        center:start.center,zoom:start.zoom,pitch:start.pitch,bearing:start.bearing,
        minZoom:1.5,maxZoom:14,antialias:true,attributionControl:true,
        maxTileCacheSize:80
      });
    }catch(e){
      recover('Unable to initialize WebGL. Retrying the globe.');
      return;
    }
    mapRef.current=map;
    canvas=map.getCanvas();
    const contextLost=event=>{
      event.preventDefault();
      recover('Restoring the globe graphics context');
    };
    canvas.addEventListener('webglcontextlost',contextLost,false);
    mapHeartbeat.current=performance.now();
    mapAttemptStarted.current=performance.now();
    map.on('render',()=>{mapHeartbeat.current=performance.now();});
    const manual=()=>{
      if(engineRef.current.snapshot().playing){
        manuallyPaused.current=true;
        engineRef.current.pause();
      }
    };
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
        installCinematicLayers(map,playlist.locate(elapsedRef.current).scene || playlist.sceneFor(0));
        layersReady.current=true;
        routeUpdatedRef.current=-Infinity;
        updateAt(elapsedRef.current,true);
        setReady(true);
        setError('');
        setRecoveryMessage('');
        recoveryAttempts.current=0;
        if(styleResumeRef.current && !document.hidden){
          styleResumeRef.current=false;
          engineRef.current.play();
        }
        if(EXHIBITION_MODE&&!document.hidden&&!manuallyPaused.current &&
            (!autoStarted.current||recoveryShouldResume.current||visibilityPaused.current)){
          autoStarted.current=true;
          recoveryShouldResume.current=false;
          visibilityPaused.current=false;
          engineRef.current.play();
        }
      }catch(e){
        recover('Unable to restore cinematic map layers. Retrying.');
      }
    });
    map.on('error',e=>{
      if(e.error&&!layersReady.current)
        recover('Map data unavailable. Retrying when the connection allows.');
    });
    };
    if(presetRef.current==='local'){
      // Decode and prepare the complete Earth before creating the map or
      // starting the playback clock. No satellite tile requests afterwards.
      mapAttemptStarted.current=performance.now();
      const texture=new URL('../data/cinematic/earth-blue-marble.jpg',window.location.href);
      prepareLocalEarth(maplibregl,texture.toString(),(done,total)=>
        setLocalEarthProgress({ready:false,done,total}))
        .then(status=>{
          if(disposed)return;
          setLocalEarthProgress({ready:true,done:status.cachedTiles,total:status.totalTiles});
          initialize();
        })
        .catch(e=>{
          if(!disposed)recover('Unable to prepare local Earth: '+e.message);
        });
    }else initialize();
    return ()=>{
      disposed=true;
      if(canvas)canvas.removeEventListener('webglcontextlost',contextLost,false);
      layersReady.current=false;
      if(mapRef.current===map)mapRef.current=null;
      if(map)try{map.remove();}catch{ /* Context may already be lost. */ }
    };
  },[updateAt,mapGeneration,surfaceReady]);

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
      // Warm the lower-zoom backdrop before every between-trip transition.
      if(clip.kind==='bridge'&&clip.nextEntry)
        warmup.schedule(clip.nextEntry.stops[0],presetRef.current);
      if(clip.kind==='trip'&&clip.pose.segmentType==='outro'&&clip.nextEntry)
        warmup.schedule(clip.nextEntry.stops[0],presetRef.current);
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
              gateRef.current.active=false;setWarming(false);
              if(!EXHIBITION_MODE||!document.hidden)engine.play();
              else visibilityPaused.current=true;
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
    engine.configure({
      duration:playlist.totalMs,
      progress:START_MS/playlist.totalMs,
      onComplete:EXHIBITION_MODE?()=>{
        if(document.hidden||!layersReady.current||manuallyPaused.current)return;
        loopCount.current++;
        checkpointMs.current=0;
        saveCheckpoint(0);
        routeUpdatedRef.current=-Infinity;
        previousTripRef.current=-1;
        engine.stop(0);
        engine.play();
      }:null
    });
    return ()=>{
      engine.pause();unsubscribe();
      gateRef.current.active=false;gateRef.current.token++;
    };
  },[updateAt]);

  // Exhibition controls are intentionally hidden until real user activity.
  // No separate animation loop or polling of camera positions is introduced.
  useEffect(()=>{
    if(!EXHIBITION_MODE)return;
    const ui=createExhibitionUi({
      show:()=>setControlsVisible(true),
      hide:()=>{
        const focused=document.activeElement;
        if(keyboardFocus.current && focused?.closest?.('.cg-topbar,.cg-console'))return;
        setControlsVisible(false);
      },
      idleMs:EXHIBITION_IDLE_MS
    });
    const wake=()=>{
      keyboardFocus.current=false;
      ui.wake();
    };
    const keydown=event=>{
      keyboardFocus.current=true;
      ui.wake();
      if(event.code==='Space'&&
         !['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement?.tagName)){
        event.preventDefault();
        const clock=engineRef.current;
        if(clock.snapshot().playing){manuallyPaused.current=true;clock.pause();}
        else{
          manuallyPaused.current=false;
          if(clock.snapshot().progress>=1)clock.stop(0);
          clock.play();
        }
      }
    };
    window.addEventListener('pointermove',wake,{passive:true});
    window.addEventListener('pointerdown',wake,{passive:true});
    window.addEventListener('touchstart',wake,{passive:true});
    window.addEventListener('keydown',keydown);
    const focusin=()=>ui.wake();
    window.addEventListener('focusin',focusin);
    return ()=>{
      window.removeEventListener('pointermove',wake);
      window.removeEventListener('pointerdown',wake);
      window.removeEventListener('touchstart',wake);
      window.removeEventListener('keydown',keydown);
      window.removeEventListener('focusin',focusin);
      ui.close();
    };
  },[]);

  useEffect(()=>{
    if(!EXHIBITION_MODE)return;
    const onVisibility=()=>{
      const clock=engineRef.current;
      if(document.hidden){
        if(clock.snapshot().playing||gateRef.current.active){
          visibilityPaused.current=true;
          gateRef.current.active=false;gateRef.current.token++;
          setWarming(false);
          clock.pause();
        }
      }else if(visibilityPaused.current && layersReady.current){
        visibilityPaused.current=false;
        if(!manuallyPaused.current)clock.play();
      }
      if(!document.hidden && document.fullscreenElement &&
         !wakeLock.current && navigator.wakeLock?.request){
        navigator.wakeLock.request('screen').then(lock=>{
          wakeLock.current=lock;
          lock.addEventListener?.('release',()=>{
            if(wakeLock.current===lock)wakeLock.current=null;
          });
        }).catch(()=>{});
      }
    };
    const wentOffline=()=>setOffline(true);
    const cameOnline=()=>{
      setOffline(false);
      if(presetRef.current==='local')return;
      warmup.clear();
      // New MapLibre sources re-request missing tiles. Keep the precise
      // cinematic timestamp and resume only if the viewer was playing.
      recoverHandler.current?.('Connection restored. Refreshing globe imagery.');
    };
    const fullscreenChange=()=>setFullscreen(Boolean(document.fullscreenElement));
    const watchdog=window.setInterval(()=>{
      if(document.hidden||recoverTimer.current!=null)return;
      const now=performance.now(),clock=engineRef.current;
      if(!layersReady.current && mapAttemptStarted.current>0 &&
         now-mapAttemptStarted.current>45000){
        recoverHandler.current?.('Waiting for globe data. Retrying.');
      }else if(layersReady.current&&clock.snapshot().playing&&
         !gateRef.current.active&&now-mapHeartbeat.current>EXHIBITION_WATCHDOG_MS){
        recoverHandler.current?.('Rendering stopped responding. Rebuilding globe.');
      }
    },4000);
    const checkpoint=window.setInterval(()=>{
      if(!document.hidden&&layersReady.current){
        checkpointMs.current=elapsedRef.current;
        saveCheckpoint(elapsedRef.current);
      }
    },12000);
    window.addEventListener('offline',wentOffline);
    window.addEventListener('online',cameOnline);
    document.addEventListener('visibilitychange',onVisibility);
    document.addEventListener('fullscreenchange',fullscreenChange);
    return ()=>{
      window.clearInterval(watchdog);
      window.clearInterval(checkpoint);
      window.removeEventListener('offline',wentOffline);
      window.removeEventListener('online',cameOnline);
      document.removeEventListener('visibilitychange',onVisibility);
      document.removeEventListener('fullscreenchange',fullscreenChange);
      if(recoverTimer.current!=null)window.clearTimeout(recoverTimer.current);
      recoverTimer.current=null;
      try{wakeLock.current?.release?.();}catch{}
    };
  },[]);

  const requestDisplayFullscreen=async()=>{
    try{
      if(!document.fullscreenElement && appRoot.current?.requestFullscreen)
        await appRoot.current.requestFullscreen();
      // A browser gesture is required for fullscreen/wake lock. Exhibition
      // autoplay itself must never attempt privileged fullscreen access.
      if(navigator.wakeLock?.request && !wakeLock.current){
        const lock=await navigator.wakeLock.request('screen');
        wakeLock.current=lock;
        lock.addEventListener?.('release',()=>{
          if(wakeLock.current===lock)wakeLock.current=null;
        });
      }
    }catch{
      setRecoveryMessage('Fullscreen or screen wake lock was blocked by the browser.');
      window.setTimeout(()=>setRecoveryMessage(''),4500);
    }
  };
  const exitExhibition=()=>{
    const url=new URL(window.location.href);
    url.searchParams.delete('exhibition');
    url.searchParams.delete('reset');
    window.location.assign(url.toString());
  };

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
    if(!validEarthPreset(id)||id===presetRef.current)return;
    const switchRenderer=(id==='local')!==(presetRef.current==='local');
    if(switchRenderer){
      cancelGate();
      const clock=engineRef.current;
      styleResumeRef.current=clock.snapshot().playing;
      if(styleResumeRef.current)clock.pause();
      layersReady.current=false;
      setReady(false);
    } else if(mapRef.current&&layersReady.current) {
      setCinematicEarthPreset(mapRef.current,id);
    }
    presetRef.current=id;setMapPreset(id);
    try{localStorage.setItem(MAP_STORAGE_KEY,id);}catch{}
    if(switchRenderer) setMapGeneration(value=>{
      mapGenerationRef.current=value+1;
      return value+1;
    });
  };
  const togglePlay=()=>{
    if(gateRef.current.active){cancelGate();manuallyPaused.current=true;return;}
    const clock=engineRef.current;
    if(clock.snapshot().playing){
      manuallyPaused.current=true;
      clock.pause();
    }else{
      manuallyPaused.current=false;
      if(clock.snapshot().progress>=1)clock.stop(0);
      clock.play();
    }
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
      version:'cinematic-globehoppers.wp4',
      durationMs:playlist.totalMs,stopCount:playlist.stopCount,
      tripCount:playlist.tripCount,legCount:playlist.legCount,
      seekMs(ms){
        const time=clamp(Number(ms)||0,0,playlist.totalMs);
        gateRef.current.active=false;gateRef.current.token++;
        setWarming(false);
        manuallyPaused.current=true;
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
      getMapDetails:()=>mapRef.current?{
        ...getCinematicEarthState(mapRef.current),
        localEarth:getLocalEarthStatus()
      }:null,
      setMapPreset(id){if(!validEarthPreset(id))return false;choosePreset(id);return true;},
      getExhibitionDetails(){return{
        enabled:EXHIBITION_MODE,loopCount:loopCount.current,
        controlsVisible:!EXHIBITION_MODE||Boolean(appRoot.current?.dataset.controlsVisible==='true'),
        recoveries:recoveryAttempts.current,recovering:recoverTimer.current!=null,
        rendererGeneration:mapGenerationRef.current,fullscreen:Boolean(document.fullscreenElement),
        hidden:document.hidden
      };},
      requestRendererRecovery(){
        if(!EXHIBITION_MODE||!recoverHandler.current)return false;
        recoverHandler.current('Refreshing cinematic display');
        return true;
      },
      play(){
        if(!layersReady.current)return false;
        manuallyPaused.current=false;
        const clock=engineRef.current;
        if(clock.snapshot().progress>=1)clock.stop(0);
        clock.play();return true;
      },
      pause(){manuallyPaused.current=true;engineRef.current.pause();return true;},
      getPlaylistDetails(){return{...playlist.stats(),
        durationMs:playlist.totalMs,
        tripCount:playlist.tripCount,legCount:playlist.legCount,stopCount:playlist.stopCount,
        current:playlist.context(elapsedRef.current),preflight:warmup.stats()};},
      getState(){return{elapsedMs:elapsedRef.current,ready:layersReady.current,
        playing:engineRef.current.snapshot().playing,
        mapPreset:presetRef.current,buffering:gateRef.current.active,
        exhibition:EXHIBITION_MODE,loopCount:loopCount.current,
        controlsVisible:!EXHIBITION_MODE||appRoot.current?.dataset.controlsVisible==='true'};}
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
    <div ref={appRoot} className="cg-app"
      data-capture={CAPTURE_MODE?'true':'false'}
      data-exhibition={EXHIBITION_MODE?'true':'false'}
      data-controls-visible={controlsVisible?'true':'false'}
      data-map-preset={mapPreset}>
      <div ref={mapContainer} className="cg-map" aria-label="Cinematic globe with chronological travel history"/>
      <div className="cg-vignette" aria-hidden="true"/>
      {EXHIBITION_MODE&&<div className="cg-exhibition-progress" aria-hidden="true">
        <div style={{transform:'scaleX('+clamp(display.ms/playlist.totalMs,0,1)+')'}}/>
      </div>}
      {EXHIBITION_MODE&&(recoveryMessage||offline)&&
        <div className="cg-exhibition-status" role="status">
          {offline?'Internet connection unavailable. Using available map tiles.':recoveryMessage}
        </div>}
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
            <button type="button" onClick={()=>setDiagnostics(v=>!v)}
              aria-pressed={diagnostics}>Diagnostics</button>
            {EXHIBITION_MODE?<>
              <button type="button" onClick={requestDisplayFullscreen}
                aria-label={fullscreen?'Display is fullscreen':'Enter fullscreen display'}>
                {fullscreen?'Fullscreen active':'Fullscreen'}
              </button>
              <button type="button" onClick={exitExhibition}>Exit exhibition</button>
            </>:!CAPTURE_MODE&&
              <button type="button" onClick={()=>{
                const url=new URL(window.location.href);
                url.searchParams.set('exhibition','1');
                window.location.assign(url.toString());
              }}>Exhibition mode</button>}
          </div>
        </header>
        {error&&<div className="cg-alert" role="alert">{error}</div>}
        {!ready&&!error&&<div className="cg-loading" role="status">
          {presetRef.current==='local'&&localEarthProgress.done>0?
            'Preparing local Earth '+localEarthProgress.done+'/'+localEarthProgress.total+' tiles…':
            'Preparing cinematic globe and reviewed routes…'}
        </div>}
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
          <div>Reviewed surface routes {playlist.stats().reviewedSurfaceLegs ?? 0}</div>
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
