import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PlaybackEngine } from '../utils/playbackEngine.js';
import { buildCinematicScene } from './scene.js';
import { demoStops } from './demoStops.js';
import { installCinematicLayers, updateCinematicRoute } from './mapLayers.js';
import { updateCinematicActors } from './actorOverlay.js';
import './cinematic.css';

const scene = buildCinematicScene(demoStops);
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/fiord';
const CAPTURE_MODE = new URLSearchParams(window.location.search).get('capture') === '1';
const formatClock = ms => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(sec / 60).toString().padStart(2, '0') + ':' +
    (sec % 60).toString().padStart(2, '0');
};
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function CinematicApp() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layersReadyRef = useRef(false);
  const planeRootRef = useRef(null);
  const planeLiftRef = useRef(null);
  const planeVisualRef = useRef(null);
  const planeShadowRef = useRef(null);
  const arrivalRootRef = useRef(null);
  const arrivalNameRef = useRef(null);
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new PlaybackEngine();
  const currentMsRef = useRef(0);
  const lastRenderedMsRef = useRef(-Infinity);
  const lastRenderedSegmentRef = useRef('');
  const lastUiFrameRef = useRef(0);
  const [screen, setScreen] = useState({ playing: false, ms: 0, fps: 60, quality: 'high' });
  const [speed, setSpeed] = useState(1);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const renderAt = useCallback((ms, force = false) => {
    const map = mapRef.current;
    // Tile requests may still be outstanding after scene layer initialization.
    // Rendering must not freeze just because the style is temporarily busy.
    if (!map || !layersReadyRef.current) return scene.sample(ms);
    const pose = scene.sample(ms);
    // One camera timestamp drives both map projection and the airplane overlay.
    map.jumpTo({ center: pose.center, zoom: pose.zoom,
      pitch: pose.pitch, bearing: pose.bearing });
    updateCinematicActors(map, scene, ms, {
      planeRoot: planeRootRef.current,
      planeLift: planeLiftRef.current,
      planeVisual: planeVisualRef.current,
      planeShadow: planeShadowRef.current,
      arrivalRoot: arrivalRootRef.current,
      arrivalName: arrivalNameRef.current
    });
    // Heavy GeoJSON source writes remain separate from the visual aircraft.
    // During close zooms the aircraft still runs at full display refresh.
    if (force || Math.abs(ms - lastRenderedMsRef.current) >= 65 ||
        pose.segmentType !== lastRenderedSegmentRef.current) {
      updateCinematicRoute(map, scene, ms);
      lastRenderedMsRef.current = ms;
      lastRenderedSegmentRef.current = pose.segmentType;
    }
    return pose;
  }, []);

  useEffect(() => {
    let map;
    try {
      map = new maplibregl.Map({
        container: mapEl.current,
        style: MAP_STYLE,
        projection: { type: 'globe' },
        center: [scene.stops[0].lon, scene.stops[0].lat],
        zoom: 2.25, pitch: 7, bearing: scene.headings[0],
        minZoom: 1.5, maxZoom: 14, antialias: true,
        attributionControl: true
      });
    } catch (e) {
      setError('Unable to initialize WebGL. Check browser GPU acceleration.');
      return;
    }
    mapRef.current = map;
    const cancelForGesture = () => {
      if (engineRef.current.snapshot().playing) engineRef.current.pause();
    };
    map.on('mousedown', cancelForGesture);
    map.on('touchstart', cancelForGesture);
    map.on('wheel', cancelForGesture);
    // When the user pauses and pans the map, keep aircraft/map labels anchored.
    map.on('move', () => {
      if (!layersReadyRef.current || engineRef.current.snapshot().playing) return;
      updateCinematicActors(map, scene, currentMsRef.current, {
        planeRoot: planeRootRef.current,
        planeLift: planeLiftRef.current,
        planeVisual: planeVisualRef.current,
        planeShadow: planeShadowRef.current,
        arrivalRoot: arrivalRootRef.current,
        arrivalName: arrivalNameRef.current
      });
    });
    map.on('load', () => {
      try {
        installCinematicLayers(map, scene);
        layersReadyRef.current = true;
        renderAt(currentMsRef.current, true);
        setReady(true);
      } catch (e) {
        setError('Map layers could not be initialized: ' + (e?.message || String(e)));
      }
    });
    map.on('error', event => {
      if (event.error && !layersReadyRef.current) setError('Map tiles could not be loaded. An internet connection is needed for the default basemap.');
    });
    return () => {
      layersReadyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [renderAt]);

  useEffect(() => {
    const clock = engineRef.current;
    const unsubscribe = clock.subscribe(state => {
      const ms = clamp(state.progress, 0, 1) * scene.totalMs;
      currentMsRef.current = ms;
      renderAt(ms, !state.playing);
      const now = performance.now();
      if (!state.playing || now - lastUiFrameRef.current > 45) {
        lastUiFrameRef.current = now;
        setScreen({ playing: state.playing, ms,
          fps: Math.round(1000 / Math.max(1, state.frameMs)),
          quality: state.quality });
      }
    });
    clock.configure({ duration: scene.totalMs, progress: 0 });
    return () => { clock.pause(); unsubscribe(); };
  }, [renderAt]);

  useEffect(() => {
    const api = Object.freeze({
      version: 'cinematic-globehoppers.v1',
      durationMs: scene.totalMs,
      stopCount: scene.stops.length,
      seekMs(ms) {
        const clock = engineRef.current;
        clock.pause();
        const normalized = clamp(Number(ms) || 0, 0, scene.totalMs);
        clock.seek(normalized / scene.totalMs);
        return scene.sample(normalized);
      },
      sampleAtMs(ms) { return scene.sample(ms); },
      getPresentationAtMs(ms) {
        return {
          visibleStops: scene.visibleStops(ms).map(s => s.id),
          visibleRouteCount: scene.visibleRoutes(ms).length,
          plane: scene.planeAt(ms),
          arrival: scene.arrivalAt(ms)
        };
      },
      getState() { return { elapsedMs: currentMsRef.current, ready: layersReadyRef.current }; }
    });
    window.__CINEMATIC_GLOBEHOPPERS__ = api;
    return () => { delete window.__CINEMATIC_GLOBEHOPPERS__; };
  }, []);

  const togglePlay = () => {
    const clock = engineRef.current;
    if (clock.snapshot().playing) clock.pause();
    else {
      if (clock.snapshot().progress >= 1) clock.stop(0);
      clock.play();
    }
  };
  const seek = ms => engineRef.current.seek(clamp(ms, 0, scene.totalMs) / scene.totalMs);
  const changeSpeed = value => {
    const next = Number(value);
    if (![0.5, 1, 1.5, 2].includes(next)) return;
    const clock = engineRef.current;
    const progress = clock.snapshot().progress;
    clock.configure({ duration: scene.totalMs / next, progress });
    setSpeed(next);
  };
  const pose = scene.sample(screen.ms);
  const currentStop = pose.segmentType === 'travel'
    ? scene.stops[pose.legIndex + 1]
    : scene.stops[pose.stopIndex];
  const arrival = scene.arrivalAt(screen.ms);

  return (
    <div className="cg-app" data-capture={CAPTURE_MODE ? 'true' : 'false'}>
      <div ref={mapEl} className="cg-map" aria-label="Animated globe showing an eight-stop travel route" />
      <div className="cg-vignette" aria-hidden="true" />
      <div className="cg-actors" aria-hidden="true">
        <div className="cg-aircraft" ref={planeRootRef} style={{ visibility: 'hidden' }}>
          <div className="cg-aircraft-shadow" ref={planeShadowRef} />
          <div className="cg-aircraft-lift" ref={planeLiftRef}>
            <svg ref={planeVisualRef} className="cg-aircraft-visual"
              xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 64"
              role="presentation" aria-hidden="true">
              <defs>
                <linearGradient id="cg-aircraft-paint" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset=".65" stopColor="#ccf4fa" />
                  <stop offset="1" stopColor="#71b9d3" />
                </linearGradient>
              </defs>
              <path d="M30 3 C34 3 34 13 35 23 L56 38 Q59 43 54 45
                L36 40 L35 52 L44 58 L44 62 L30 57 L16 62 L16 58
                L25 52 L24 40 L6 45 Q1 43 4 38 L25 23
                C26 13 26 3 30 3 Z"
                fill="url(#cg-aircraft-paint)" stroke="#173a50" strokeWidth="2.1"
                strokeLinejoin="round" />
              <path d="M30 10 L30 54" stroke="#628ea5" strokeWidth="1.6" opacity=".65" />
              <path d="M27.5 13 Q30 7 32.5 13 L33 22 L27 22Z" fill="#147c9e" opacity=".9" />
            </svg>
          </div>
        </div>
        <div className="cg-arrival-anchor" ref={arrivalRootRef}
          style={{ visibility: 'hidden' }}>
          <div className="cg-arrival-label">
            <strong ref={arrivalNameRef} className="cg-arrival-place" />
            <span className="cg-arrival-stem" />
          </div>
        </div>
      </div>
      {!CAPTURE_MODE && (
        <>
          <header className="cg-topbar">
            <div className="cg-brand">
              <span className="cg-brand-icon" aria-hidden="true">✦</span>
              <div>
                <div className="cg-kicker">GLOBEHOPPERS · EXPERIMENTAL VIEWER</div>
                <h1>Cinematic <span>GlobeHoppers</span></h1>
              </div>
            </div>
            <div className="cg-meta">
              <span className="cg-dataset">8 stops · demo route</span>
              <button type="button" onClick={() => setShowDiagnostics(v => !v)}
                aria-pressed={showDiagnostics}>Diagnostics</button>
            </div>
          </header>
          {error && <div className="cg-alert" role="alert">{error}</div>}
          {!ready && !error && <div className="cg-loading" role="status">Preparing cinematic globe…</div>}
          <div className={'cg-flyout' + (arrival ? ' is-arriving' : '')} aria-live="off">
            <div className="cg-flyout-kicker">{pose.segmentType === 'travel' ? 'NOW FLYING TO' : 'EXPLORING'}</div>
            <div className="cg-flyout-place">{currentStop.name}</div>
            <div className="cg-flyout-sub">{pose.segmentType === 'travel' ? 'Cinematic flight path' : 'A globe of possibilities'}</div>
          </div>
          {showDiagnostics && (
            <aside className="cg-diagnostics" aria-label="Camera diagnostics">
              <div>Camera {pose.segmentType}</div>
              <div>Zoom {pose.zoom.toFixed(2)} · Pitch {pose.pitch.toFixed(1)}°</div>
              <div>Bearing {pose.bearing.toFixed(1)}° (north ±45°)</div>
              <div>Aircraft {scene.planeAt(screen.ms) ? '60 Hz overlay' : 'hidden'}</div>
              <div>Visible stops {scene.visibleStops(screen.ms).length} / {scene.stops.length}</div>
              <div>Frame {screen.fps} FPS · {screen.quality}</div>
              <div>Clock {Math.round(screen.ms)} ms</div>
            </aside>
          )}
          <section className="cg-console" aria-label="Cinematic playback controls">
            <div className="cg-controls">
              <button className="cg-play" type="button" disabled={!ready}
                onClick={togglePlay} aria-label={screen.playing ? 'Pause playback' : 'Play cinematic route'}>
                {screen.playing ? 'Ⅱ' : '▶'}
              </button>
              <button className="cg-restart" type="button" disabled={!ready}
                onClick={() => { engineRef.current.pause(); seek(0); }}
                aria-label="Restart cinematic route">↺</button>
              <div className="cg-clock">{formatClock(screen.ms)} <span>/ {formatClock(scene.totalMs)}</span></div>
              <label className="cg-speed">
                Speed
                <select value={speed} onChange={e => changeSpeed(e.target.value)} aria-label="Playback speed">
                  <option value="0.5">0.5×</option>
                  <option value="1">1×</option>
                  <option value="1.5">1.5×</option>
                  <option value="2">2×</option>
                </select>
              </label>
            </div>
            <input className="cg-scrubber" type="range" min="0" max={scene.totalMs}
              step="25" value={screen.ms} disabled={!ready} aria-label="Seek cinematic playback"
              onChange={e => seek(Number(e.target.value))} />
            <div className="cg-stoplist" aria-label="Eight demo stops">
              {scene.stops.map((stop, index) => (
                <button key={stop.id} type="button" disabled={!ready}
                  className={currentStop.id === stop.id ? 'cg-stop is-current' : 'cg-stop'}
                  onClick={() => { engineRef.current.pause(); seek(scene.stopTimesMs[index]); }}>
                  <span className="cg-stop-num">{String(index + 1).padStart(2, '0')}</span>
                  <span>{stop.name}</span>
                </button>
              ))}
            </div>
          </section>
          <footer className="cg-footnote">Independent open-source camera prototype · MapLibre + OpenFreeMap · No Mult.dev calls</footer>
        </>
      )}
    </div>
  );
}
createRoot(document.getElementById('cinematic-root')).render(<CinematicApp />);
