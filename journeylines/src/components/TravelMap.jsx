import { useEffect, useMemo, useRef, useState } from 'react';
import { geoPath, geoEqualEarth, geoOrthographic, geoInterpolate } from 'd3-geo';
import { geoCylindricalEqualArea } from 'd3-geo-projection';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { expandTrip, getTravelerKey } from '../utils/tripExpansion.js';
import { milesBetween } from '../utils/distanceUtils.js';

const W = 1400, H = 760;

export default function TravelMap({ trips, locations, homeBases, travelers, activeIndex, legProgress, projectionName, cameraMode, showTrails, trailOpacity, trailWidth }) {
  const locById = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations]);
  const travById = useMemo(() => Object.fromEntries(travelers.map(t => [t.id, t])), [travelers]);
  const expanded = useMemo(() => trips.map(t => expandTrip(t, locById, homeBases)), [trips, locById, homeBases]);
  const legs = useMemo(() => expanded.flatMap(t => t.legs.map((leg, legIndex) => ({ trip: t, leg, legIndex }))), [expanded]);
  const countries = useMemo(() => feature(world, world.objects.countries), []);

  const safeActiveIndex = Math.min(activeIndex, Math.max(0, legs.length - 1));
  const active = legs[safeActiveIndex];
  const completedMode = activeIndex >= legs.length;
  const drawnLegs = legs.slice(0, Math.min(activeIndex, legs.length));
  const progress = completedMode ? 1 : legProgress;
  const currentPoint = active ? interpolateGeo(active.leg.from, active.leg.to, progress) : null;

  const globeCameraTarget = useMemo(() => {
    if (projectionName !== 'globe') return null;
    return getGlobeCameraTarget(cameraMode, active, currentPoint, progress, completedMode);
  }, [projectionName, cameraMode, active, currentPoint, progress, completedMode]);

  const smoothGlobeCamera = useSmoothGlobeCamera(globeCameraTarget);

  const projection = useMemo(() => {
    if (projectionName === 'globe') {
      const target = smoothGlobeCamera || globeCameraTarget || { lon: -35, lat: 25, scale: 520 };
      return geoOrthographic()
        .translate([W / 2, H / 2])
        .scale(target.scale)
        .rotate([-target.lon, -target.lat, 0])
        .clipAngle(90)
        .precision(0.35);
    }
    const p = projectionName === 'gallPeters' ? geoCylindricalEqualArea().parallel(45) : geoEqualEarth();
    return p.fitSize([W, H], { type: 'Sphere' });
  }, [projectionName, smoothGlobeCamera, globeCameraTarget]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const currentXY = currentPoint ? projection([currentPoint.lon, currentPoint.lat]) : null;
  const viewTransform = projectionName === 'globe' ? '' : cameraTransform(cameraMode, active, currentXY, projection);
  const visited = visitedLocations(expanded, activeIndex);
  const activeIds = new Set(active ? [active.leg.from.id, active.leg.to.id] : []);
  const vehicleHeading = active && currentPoint ? screenHeading(active.leg.from, active.leg.to, progress, projection) : 0;

  return <svg className={`map map--${projectionName}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="JourneyLines travel map">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="terrainGlow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="globeOcean" cx="42%" cy="28%" r="76%">
        <stop offset="0" stopColor="#214a72"/>
        <stop offset="0.45" stopColor="#102944"/>
        <stop offset="1" stopColor="#050b17"/>
      </radialGradient>
      <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#09111f"/><stop offset="1" stopColor="#101b31"/></linearGradient>
      <radialGradient id="atmosphere" cx="50%" cy="50%" r="50%"><stop offset="68%" stopColor="rgba(24,226,255,0)"/><stop offset="96%" stopColor="rgba(24,226,255,.12)"/><stop offset="100%" stopColor="rgba(24,226,255,.28)"/></radialGradient>
    </defs>
    <rect width={W} height={H} fill="url(#ocean)" />
    {projectionName === 'globe' && <circle cx={W/2} cy={H/2} r={projection.scale()} fill="url(#globeOcean)" className="globe-disc" />}
    <g transform={viewTransform} className="camera-layer">
      <path d={path({ type: 'Sphere' })} className="sphere" />
      <g className="countries terrain">{countries.features.map((c, i) => <path key={i} d={path(c)} />)}</g>
      {projectionName === 'globe' && <g className="terrain-shade">{countries.features.map((c, i) => <path key={`s-${i}`} d={path(c)} />)}</g>}
      {showTrails && <g className="trails" opacity={trailOpacity} strokeWidth={trailWidth}>
        {drawnLegs.map((l, i) => <Route key={`${l.trip.id}-${l.legIndex}-${i}`} leg={l.leg} projection={projection} color={travById[getTravelerKey(l.trip)]?.color} mode={l.leg.mode} globe={projectionName === 'globe'} />)}
        {active && !completedMode && <Route leg={{...active.leg, to: currentPoint}} projection={projection} color={travById[getTravelerKey(active.trip)]?.color} mode={active.leg.mode} active globe={projectionName === 'globe'} progress={progress} />}
      </g>}
      <g className="dots">
        {[...visited].map(id => {
          const l = locById[id];
          if (!l) return null;
          const xy = projection([l.lon, l.lat]);
          if (!xy) return null;
          const showLabel = !completedMode && activeIds.has(id);
          return <g key={id} transform={`translate(${xy[0]},${xy[1]})`} className={showLabel ? 'dot dot--active' : 'dot'}><circle r={showLabel ? 5.8 : 3.6}/>{showLabel && <text y="-11">{l.name}</text>}</g>;
        })}
      </g>
      {currentXY && active && !completedMode && <Vehicle xy={currentXY} heading={vehicleHeading} mode={active.leg.mode} color={travById[getTravelerKey(active.trip)]?.color || '#00e5ff'} projectionName={projectionName} />}
    </g>
    {projectionName === 'globe' && <circle cx={W/2} cy={H/2} r={projection.scale()} fill="url(#atmosphere)" className="atmosphere" />}
  </svg>;
}

function Route({ leg, projection, color = '#00e5ff', mode = 'plane', active, globe, progress = 1 }) {
  const dash = mode === 'drive' ? '6 7' : mode === 'boat' ? '2 10' : mode === 'train' ? '10 5' : '';
  if (globe || mode === 'plane') {
    const coords = routeSamples(leg.from, leg.to, active ? progress : 1, globe ? 58 : 26);
    const d = geoPath(projection)({ type: 'LineString', coordinates: coords });
    if (!d) return null;
    return <path d={d} fill="none" stroke={color} strokeLinecap="round" strokeDasharray={dash} className={active ? 'route active' : 'route'} />;
  }
  const a = projection([leg.from.lon, leg.from.lat]);
  const b = projection([leg.to.lon, leg.to.lat]);
  if (!a || !b) return null;
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const curve = mode === 'boat' ? 25 : 8;
  const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2 - curve;
  return <path d={`M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`} fill="none" stroke={color} strokeLinecap="round" strokeDasharray={dash} className={active ? 'route active' : 'route'} />;
}

function Vehicle({ xy, mode, color, projectionName, heading }) {
  const scale = projectionName === 'globe' ? 0.9 : 1.05;
  const rotate = mode === 'boat' || mode === 'train' || mode === 'drive' || mode === 'plane' ? heading : 0;
  return <g className="vehicle" transform={`translate(${xy[0]},${xy[1]}) rotate(${rotate}) scale(${scale})`} filter="url(#glow)" style={{ '--vehicle-color': color }}>
    <VehicleShape mode={mode} />
  </g>;
}

function VehicleShape({ mode }) {
  if (mode === 'drive') {
    return <g className="vehicle-shape vehicle-shape--car">
      <path d="M-15 3 L-12 -5 L-4 -9 L7 -9 L14 -4 L17 3 L15 8 L-15 8 Z" />
      <circle cx="-8" cy="8" r="3" /><circle cx="9" cy="8" r="3" />
    </g>;
  }
  if (mode === 'boat') {
    return <g className="vehicle-shape vehicle-shape--boat">
      <path d="M-15 5 C-9 12 8 12 15 5 Z" />
      <path d="M-1 5 L-1 -15 L11 2 Z" />
      <path d="M-3 5 L-3 -12 L-12 3 Z" />
    </g>;
  }
  if (mode === 'train') {
    return <g className="vehicle-shape vehicle-shape--train">
      <rect x="-10" y="-15" width="20" height="28" rx="5" />
      <path d="M-6 -8 H6 M-6 0 H6" />
      <circle cx="-5" cy="14" r="2.4" /><circle cx="5" cy="14" r="2.4" />
    </g>;
  }
  return <g className="vehicle-shape vehicle-shape--plane">
    <path d="M0 -18 L5 -3 L19 3 L19 8 L4 5 L2 16 L7 20 L7 23 L0 20 L-7 23 L-7 20 L-2 16 L-4 5 L-19 8 L-19 3 L-5 -3 Z" />
  </g>;
}

function interpolateGeo(a, b, t) {
  const interp = geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
  const [lon, lat] = interp(Math.max(0, Math.min(1, t)));
  return { lon, lat };
}

function routeSamples(a, b, progress = 1, n = 32) {
  const interp = geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
  const steps = Math.max(2, Math.ceil(n * Math.max(0.05, progress)));
  return Array.from({ length: steps + 1 }, (_, i) => interp((i / steps) * Math.max(0, Math.min(1, progress))));
}

function visitedLocations(expanded, activeIndex) {
  const out = new Set(); let count = 0;
  for (const trip of expanded) {
    for (const leg of trip.legs) {
      if (count <= activeIndex) { out.add(leg.from.id); out.add(leg.to.id); }
      count++;
    }
  }
  return out;
}

function getGlobeCameraTarget(mode, active, currentPoint, progress, completedMode) {
  if (completedMode) return { lon: -35, lat: 25, scale: 360 };
  if (!active || !currentPoint) return { lon: -35, lat: 25, scale: 520 };

  const distance = milesBetween(active.leg.from, active.leg.to);
  const mid = interpolateGeo(active.leg.from, active.leg.to, 0.5);
  const routeTarget = mode === 'route' || mode === 'continent' ? mid : currentPoint;
  const lead = mode === 'follow' ? interpolateGeo(active.leg.from, active.leg.to, Math.min(1, progress + 0.08)) : routeTarget;
  const zoom = globeZoom(mode, distance, progress);
  return { lon: lead.lon, lat: lead.lat, scale: zoom };
}

function globeZoom(mode, distance, t) {
  if (mode === 'global') return 430;
  if (mode === 'continent') return 520;
  if (mode === 'route') return distance > 4500 ? 510 : distance > 1500 ? 590 : 710;
  const edgeFocus = Math.cos((Math.max(0, Math.min(1, t)) - 0.5) * Math.PI * 2) * 0.5 + 0.5;
  const closeScale = distance > 4500 ? 700 : distance > 1500 ? 760 : 850;
  const cruiseScale = distance > 4500 ? 540 : distance > 1500 ? 620 : 760;
  return cruiseScale + (closeScale - cruiseScale) * edgeFocus;
}

function useSmoothGlobeCamera(target) {
  const [camera, setCamera] = useState(target);
  const cameraRef = useRef(target);
  const targetRef = useRef(target);

  useEffect(() => { targetRef.current = target; if (!cameraRef.current && target) { cameraRef.current = target; setCamera(target); } }, [target]);

  useEffect(() => {
    let frame;
    const tick = () => {
      const target = targetRef.current;
      if (target) {
        const current = cameraRef.current || target;
        const next = {
          lon: lerpAngle(current.lon, target.lon, 0.075),
          lat: lerp(current.lat, target.lat, 0.075),
          scale: lerp(current.scale, target.scale, 0.07)
        };
        cameraRef.current = next;
        setCamera(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return camera;
}

function screenHeading(a, b, t, projection) {
  const p1 = interpolateGeo(a, b, Math.max(0, Math.min(1, t - 0.015)));
  const p2 = interpolateGeo(a, b, Math.max(0, Math.min(1, t + 0.015)));
  const xy1 = projection([p1.lon, p1.lat]);
  const xy2 = projection([p2.lon, p2.lat]);
  if (!xy1 || !xy2) return 0;
  return Math.atan2(xy2[1] - xy1[1], xy2[0] - xy1[0]) * 180 / Math.PI + 90;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let delta = ((b - a + 540) % 360) - 180;
  return a + delta * t;
}

function cameraTransform(mode, active, currentXY, projection) {
  if (!active || !currentXY || mode === 'global') return '';
  let scale = mode === 'follow' ? 2.4 : mode === 'route' ? 1.75 : 1.35;
  let cx = currentXY[0], cy = currentXY[1];
  if (mode === 'route' || mode === 'continent') {
    const a = projection([active.leg.from.lon, active.leg.from.lat]);
    const b = projection([active.leg.to.lon, active.leg.to.lat]);
    cx = (a[0]+b[0])/2; cy = (a[1]+b[1])/2;
  }
  return `translate(${W/2},${H/2}) scale(${scale}) translate(${-cx},${-cy})`;
}
