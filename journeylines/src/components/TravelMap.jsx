import { useMemo } from 'react';
import { geoPath, geoEqualEarth } from 'd3-geo';
import { geoCylindricalEqualArea } from 'd3-geo-projection';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { expandTrip, getTravelerKey } from '../utils/tripExpansion.js';

const W = 1400, H = 760;

export default function TravelMap({ trips, locations, homeBases, travelers, activeIndex, legProgress, projectionName, cameraMode, showTrails, trailOpacity, trailWidth }) {
  const locById = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations]);
  const travById = useMemo(() => Object.fromEntries(travelers.map(t => [t.id, t])), [travelers]);
  const expanded = useMemo(() => trips.map(t => expandTrip(t, locById, homeBases)), [trips, locById, homeBases]);
  const legs = useMemo(() => expanded.flatMap(t => t.legs.map((leg, legIndex) => ({ trip: t, leg, legIndex }))), [expanded]);
  const countries = useMemo(() => feature(world, world.objects.countries), []);
  const projection = useMemo(() => {
    const p = projectionName === 'gallPeters' ? geoCylindricalEqualArea().parallel(45) : geoEqualEarth();
    return p.fitSize([W, H], { type: 'Sphere' });
  }, [projectionName]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const active = legs[Math.min(activeIndex, Math.max(0, legs.length - 1))];
  const drawnLegs = legs.slice(0, Math.min(activeIndex, legs.length));
  const currentPoint = active ? interpolate(active.leg.from, active.leg.to, legProgress) : null;
  const currentXY = currentPoint ? projection([currentPoint.lon, currentPoint.lat]) : null;
  const viewTransform = cameraTransform(cameraMode, active, currentXY, projection);
  const visited = visitedLocations(expanded, activeIndex, legProgress);

  return <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="JourneyLines travel map">
    <defs>
      <filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="ocean" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#09111f"/><stop offset="1" stopColor="#101b31"/></linearGradient>
    </defs>
    <rect width={W} height={H} fill="url(#ocean)" />
    <g transform={viewTransform} className="camera-layer">
      <path d={path({ type: 'Sphere' })} className="sphere" />
      <g className="countries">{countries.features.map((c, i) => <path key={i} d={path(c)} />)}</g>
      {showTrails && <g className="trails" opacity={trailOpacity} strokeWidth={trailWidth}>
        {drawnLegs.map((l, i) => <Route key={`${l.trip.id}-${l.legIndex}-${i}`} leg={l.leg} projection={projection} color={travById[getTravelerKey(l.trip)]?.color} mode={l.leg.mode} />)}
        {active && <Route leg={{...active.leg, to: currentPoint}} projection={projection} color={travById[getTravelerKey(active.trip)]?.color} mode={active.leg.mode} active />}
      </g>}
      <g className="dots">
        {[...visited].map(id => {
          const l = locById[id]; const xy = projection([l.lon, l.lat]);
          return xy ? <g key={id} transform={`translate(${xy[0]},${xy[1]})`}><circle r="4.8"/><text y="-9">{l.name}</text></g> : null;
        })}
      </g>
      {currentXY && active && <Vehicle xy={currentXY} mode={active.leg.mode} color={travById[getTravelerKey(active.trip)]?.color} />}
    </g>
  </svg>;
}

function Route({ leg, projection, color = '#00e5ff', mode = 'plane', active }) {
  const a = projection([leg.from.lon, leg.from.lat]);
  const b = projection([leg.to.lon, leg.to.lat]);
  if (!a || !b) return null;
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const curve = mode === 'plane' ? Math.min(90, Math.hypot(dx,dy)/6) : mode === 'boat' ? 25 : 8;
  const mx = (a[0]+b[0])/2, my = (a[1]+b[1])/2 - curve;
  const dash = mode === 'drive' ? '6 7' : mode === 'boat' ? '2 10' : '';
  return <path d={`M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`} fill="none" stroke={color} strokeLinecap="round" strokeDasharray={dash} className={active ? 'route active' : 'route'} />;
}

function Vehicle({ xy, mode, color }) {
  const icon = mode === 'drive' ? '🚗' : mode === 'boat' ? '⛵' : mode === 'train' ? '🚆' : '✈';
  return <g className="vehicle" transform={`translate(${xy[0]},${xy[1]})`} filter="url(#glow)">
    <circle r="17" fill="rgba(5,12,25,.75)" stroke={color} strokeWidth="2" />
    <text textAnchor="middle" dominantBaseline="central" fontSize="20">{icon}</text>
  </g>;
}

function interpolate(a, b, t) { return { lat: a.lat + (b.lat-a.lat)*t, lon: a.lon + (b.lon-a.lon)*t }; }

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
