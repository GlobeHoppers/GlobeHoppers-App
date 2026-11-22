/**
 * Cinematic GlobeHoppers: independent presentation planner over v9 compiled route geometry.
 * No network calls, React state, animation timer, or MapLibre side effects.
 * A given (scene, elapsedMs) always produces the same camera pose and route reveal.
 */
import { compilePlaybackLeg } from '../utils/compiledPlaybackPlan.js';
import { milesBetween } from '../utils/distanceUtils.js';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const mix = (a, b, u) => a + (b - a) * u;
const smooth = x => { const t = clamp(x, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const deltaAngle = (a, b) => ((b - a + 540) % 360) - 180;
const radians = d => d * Math.PI / 180;
const degrees = r => r * 180 / Math.PI;

export const CINEMATIC_PRESET = Object.freeze({
  introMs: 1900,
  holdMs: 1750,
  arrivalEffectMs: 1625,
  northLimitDegrees: 45,
  outroMs: 2200,
  arrivalZoom: 8.15,
  arrivalPitch: 54,
  cruisingPitch: 39
});

export function normalizeCinematicStops(source) {
  if (!Array.isArray(source) || source.length < 2 || source.length > 128) {
    throw new Error('Cinematic scene requires between 2 and 128 stops.');
  }
  const ids = new Set();
  return source.map((stop, i) => {
    const lon = Number(stop?.lon);
    const lat = Number(stop?.lat);
    const id = String(stop?.id || 'stop-' + i);
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 ||
        Math.abs(lat) > 90 || id.length > 128 || ids.has(id)) {
      throw new Error('Invalid or duplicate stop at index ' + i);
    }
    ids.add(id);
    const mode = ['plane','drive','boat','train'].includes(stop?.modeFromPrevious)
      ? stop.modeFromPrevious : 'plane';
    return { id, name: String(stop?.name || id).slice(0, 100), lon, lat,
      modeFromPrevious: i === 0 ? null : mode,
      geometryFromPrevious: i === 0 ? null : stop?.geometryFromPrevious || null };
  });
}

function bearingBetween(a, b) {
  const first = radians(a.lat), second = radians(b.lat);
  const longitude = radians(deltaAngle(a.lon, b.lon));
  const y = Math.sin(longitude) * Math.cos(second);
  const x = Math.cos(first) * Math.sin(second) -
            Math.sin(first) * Math.cos(second) * Math.cos(longitude);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
}

// A geometry compiler can return points unevenly spaced by geographic
// distance. Index-based interpolation made long car/boat journeys surge
// forward whenever a sparse section was encountered.
export function pathDistanceIndex(points) {
  const cumulative=[0];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    cumulative.push(cumulative.at(-1)+milesBetween(
      {lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]}));
  }
  return {cumulative,totalMiles:cumulative.at(-1)};
}
function positionAtDistance(leg,u) {
  const points=leg.path;
  const dist=leg.pathDistance;
  if(u<=0)return {coordinate:[leg.from.lon,leg.from.lat],index:0};
  if(u>=1)return {coordinate:[leg.to.lon,leg.to.lat],index:points.length-2};
  const target=clamp(u,0,1)*dist.totalMiles;
  const c=dist.cumulative;
  let lo=0,hi=c.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(c[mid]<target)lo=mid+1;else hi=mid;}
  const index=Math.max(0,Math.min(points.length-2,lo-1));
  const span=c[index+1]-c[index];
  const t=span>1e-10?(target-c[index])/span:0;
  const a=points[index],b=points[index+1];
  return {index,coordinate:[a[0]+deltaAngle(a[0],b[0])*t,mix(a[1],b[1],t)]};
}
function positionAlong(leg,u){return positionAtDistance(leg,u).coordinate;}

// The director's camera gets its own spatially smoothed time-indexed track.
// Vehicles always use the exact route instead of this gentle camera spline.
const CAMERA_KNOTS=121;
function cameraTrackFor(leg) {
  if(leg.mode==='plane')return null;
  const leadMiles=leg.mode==='boat'?3.0:leg.mode==='train'?1.55:1.1;
  const raw=Array.from({length:CAMERA_KNOTS},(_,i)=>{
    const progress=smooth(i/(CAMERA_KNOTS-1));
    const lead=(leadMiles/Math.max(.1,leg.pathDistance.totalMiles))*
      Math.sin(Math.PI*progress)**2;
    return positionAlong(leg,clamp(progress+lead,0,1));
  });
  return raw.map((point,i)=>{
    if(i===0||i===CAMERA_KNOTS-1)return point;
    let x=0,y=0,total=0;
    for(let k=-3;k<=3;k++){
      const other=raw[clamp(i+k,0,CAMERA_KNOTS-1)];
      const w=[1,2,3,5,3,2,1][k+3];
      x+=deltaAngle(point[0],other[0])*w;
      y+=(other[1]-point[1])*w;
      total+=w;
    }
    const blend=.72;
    return [point[0]+blend*x/total,point[1]+blend*y/total];
  });
}
function cameraAt(leg,u) {
  const knots=leg.cameraTrack;
  if(!knots)return positionAlong(leg,smooth(u));
  if(u<=0)return [...knots[0]];
  if(u>=1)return [...knots.at(-1)];
  const f=u*(knots.length-1),i=Math.min(knots.length-2,Math.floor(f)),t=f-i;
  const prev=knots[Math.max(0,i-1)],a=knots[i],b=knots[i+1],
    next=knots[Math.min(knots.length-1,i+2)];
  // Clamped cubic Hermite: continuous first derivative at each knot,
  // without overshooting sharply around hairpins or across the dateline.
  const x1=deltaAngle(a[0],b[0]),x0=deltaAngle(a[0],prev[0]);
  const x2=deltaAngle(a[0],next[0]);
  const y1=b[1]-a[1],y0=prev[1]-a[1],y2=next[1]-a[1];
  const hermite=(d,m0,m1)=>{
    const t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*0+(t3-2*t2+t)*m0+
      (-2*t3+3*t2)*d+(t3-t2)*m1;
  };
  const x=hermite(x1,(x1-x0)/2,(x2)/2);
  const y=hermite(y1,(y1-y0)/2,(y2)/2);
  return [a[0]+clamp(x,Math.min(0,x1),Math.max(0,x1)),
    a[1]+clamp(y,Math.min(0,y1),Math.max(0,y1))];
}

function northBoundBearing(bearing, limit) {
  return clamp(deltaAngle(0, bearing), -limit, limit);
}

/** A subtle cross-track bow over the geodesic; starts and ends exactly at the real coordinates. */
function curveAirRoute(points, miles, legIndex) {
  const bendMiles = clamp(miles * 0.026, 1.7, 52) * (legIndex % 2 === 0 ? 1 : -1);
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return [...point];
    const before = points[index - 1], after = points[index + 1];
    const latitudeRadians = radians(point[1]);
    const cosine = Math.max(0.17, Math.abs(Math.cos(latitudeRadians)));
    const east = deltaAngle(before[0], after[0]) * 69.17 * cosine;
    const north = (after[1] - before[1]) * 69.05;
    const length = Math.hypot(east, north);
    if (length < 1e-7) return [...point];
    const amplitude = bendMiles * Math.sin(Math.PI * index / (points.length - 1));
    return [point[0] - north / length * amplitude / (69.17 * cosine),
      clamp(point[1] + east / length * amplitude / 69.05, -89.9, 89.9)];
  });
}

function poseAtStop(stop, heading, preset) {
  return { center: [stop.lon, stop.lat], zoom: preset.arrivalZoom,
           pitch: preset.arrivalPitch, bearing: heading };
}

export function cinematicLegDurationMs(miles, mode = 'plane') {
  const distance = Number(miles);
  if (!Number.isFinite(distance) || distance <= 0) throw new Error('Invalid leg distance');
  // Surface journeys have many bends. Trying to traverse hundreds of miles
  // in 6–8 seconds creates apparent camera cuts even with a smooth spline.
  // The unattended exhibition is intentionally allowed to be long.
  if (mode === 'drive' || mode === 'boat' || mode === 'train') {
    const base=mode==='boat'?8400:mode==='train'?7300:7900;
    return clamp(base + 350*Math.sqrt(distance),8500,18500);
  }
  return clamp(4400 + 45*Math.sqrt(distance),4600,8800);
}

export function buildCinematicScene(rawStops, overrides = {}) {
  const preset = { ...CINEMATIC_PRESET, ...overrides };
  const stops = normalizeCinematicStops(rawStops);
  for (const field of ['introMs', 'holdMs', 'outroMs', 'arrivalEffectMs', 'arrivalZoom', 'arrivalPitch', 'cruisingPitch', 'northLimitDegrees']) {
    if (!Number.isFinite(preset[field])) throw new Error('Invalid cinematic setting: ' + field);
  }
  if (preset.introMs < 100 || preset.outroMs < 100 || preset.holdMs < 0 ||
      preset.arrivalEffectMs < 100 || preset.arrivalEffectMs > 5000 ||
      preset.northLimitDegrees < 0 || preset.northLimitDegrees > 45 ||
      preset.arrivalZoom < 0 || preset.arrivalZoom > 14 ||
      preset.arrivalPitch < 0 || preset.arrivalPitch > 65 ||
      preset.cruisingPitch < 0 || preset.cruisingPitch > 65) {
    throw new Error('Cinematic settings outside supported range.');
  }

  // The camera stays north-biased. The aircraft heading remains unrestricted.
  const headings = stops.map((stop, i) => northBoundBearing(i < stops.length - 1
    ? bearingBetween(stop, stops[i + 1])
    : bearingBetween(stops[i - 1], stop), preset.northLimitDegrees));

  const legs = stops.slice(1).map((to, index) => {
    const from = stops[index];
    const miles = milesBetween(from, to);
    if (!(miles > 0.001)) throw new Error('Adjacent cinematic stops are indistinguishable.');
    const mode = to.modeFromPrevious || 'plane';
    // Reuse v9's compiled geometry; only airborne routes receive a lateral arc.
    const reviewedGeometry = Array.isArray(to.geometryFromPrevious) &&
      to.geometryFromPrevious.length >= 2 ? to.geometryFromPrevious : null;
    const compiled = compilePlaybackLeg({ from, to, mode, miles }, reviewedGeometry);
    const geometry = Array.from({ length: compiled.sampleCount }, (_, p) => [
      Number(compiled.positions[p * 2]), Number(compiled.positions[p * 2 + 1])
    ]);
    const path = mode === 'plane' ? curveAirRoute(geometry, miles, index) : geometry;
    const pathDistance=pathDistanceIndex(path);
    const durationMs = cinematicLegDurationMs(miles, mode);
    // No repeated deep-orbital zooms. Flights retain regional detail, while
    // surface modes stay close to their reviewed road/water corridors.
    const cruiseZoom = clamp(6.5 - 0.58 * Math.log2(Math.max(miles, 70) / 70), 3.85, 5.75);
    const surfaceZoom = mode === 'drive' ? 9.0 : mode === 'train' ? 8.8 : 8.35;
    const leg={ index, from, to, mode, miles, path, pathDistance,durationMs,
      cruiseZoom: mode === 'plane' ? cruiseZoom : surfaceZoom,
      geometrySource: reviewedGeometry ? 'v9-reviewed' : 'endpoint-fallback',
      startMs: 0, endMs: 0 };
    leg.cameraTrack=cameraTrackFor(leg);
    return leg;
  });

  const segments = [];
  const stopTimesMs = [];
  let elapsed = 0;
  function append(type, durationMs, extra = {}) {
    const s = { type, startMs: elapsed, endMs: elapsed + durationMs, ...extra };
    segments.push(s);
    elapsed += durationMs;
    return s;
  }

  append('intro', preset.introMs, { stopIndex: 0 });
  stopTimesMs.push(elapsed);
  append('hold', preset.holdMs, { stopIndex: 0 });
  for (const leg of legs) {
    const travel = append('travel', leg.durationMs, { legIndex: leg.index });
    leg.startMs = travel.startMs;
    leg.endMs = travel.endMs;
    stopTimesMs.push(elapsed);
    append('hold', preset.holdMs, { stopIndex: leg.index + 1 });
  }
  append('outro', preset.outroMs, { stopIndex: stops.length - 1 });
  const totalMs = elapsed;

  function sample(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    const segment = segments.find(s => timeMs < s.endMs) || segments[segments.length - 1];
    const u = clamp((timeMs - segment.startMs) / Math.max(1, segment.endMs - segment.startMs), 0, 1);
    const eased = smooth(u);
    if (segment.type === 'intro') {
      const at = poseAtStop(stops[0], headings[0], preset);
      return { ...at, zoom: mix(4.25, at.zoom, eased),
               pitch: mix(29, at.pitch, eased), elapsedMs: timeMs,
               segmentType: 'intro', stopIndex: 0, legIndex: -1, travelProgress: 0 };
    }
    if (segment.type === 'outro') {
      const last = stops.length - 1;
      const at = poseAtStop(stops[last], headings[last], preset);
      return { ...at, zoom: mix(at.zoom, 4.35, eased),
               pitch: mix(at.pitch, 30, eased), elapsedMs: timeMs,
               segmentType: 'outro', stopIndex: last, legIndex: legs.length - 1, travelProgress: 1 };
    }
    if (segment.type === 'hold') {
      return { ...poseAtStop(stops[segment.stopIndex], headings[segment.stopIndex], preset),
               elapsedMs: timeMs, segmentType: 'hold', stopIndex: segment.stopIndex,
               legIndex: segment.stopIndex - 1, travelProgress: 1 };
    }
    const leg = legs[segment.legIndex];
    // Zoom peak stays broad through the middle of travel, then settles without a camera cut.
    const departure = smooth(u / 0.37);
    const arrival = smooth((u - 0.61) / 0.39);
    const highAltitude = departure * (1 - arrival);
    const surface = leg.mode !== 'plane';
    const pointBefore = surface ? cameraAt(leg,clamp(u - .025,0,1)) :
      positionAlong(leg, clamp(eased - 0.022, 0, 1));
    const pointAfter = surface ? cameraAt(leg,clamp(u + .025,0,1)) :
      positionAlong(leg, clamp(eased + 0.022, 0, 1));
    const routeHeading = northBoundBearing(bearingBetween(
      {lon:pointBefore[0],lat:pointBefore[1]},
      {lon:pointAfter[0],lat:pointAfter[1]}),preset.northLimitDegrees);
    const steering = surface ? 0.38*Math.sin(Math.PI*u)**2 : 0;
    const naturalBearing = mix(headings[leg.index],headings[leg.index+1],eased);
    const bearing = clamp(mix(naturalBearing,routeHeading,steering) +
      Math.sin(Math.PI*u)**2*3.5,-preset.northLimitDegrees,preset.northLimitDegrees);
    // A road/boat scene follows the vehicle along the actual supplied route,
    // with a small look-ahead that fades to zero at departure and arrival.
    // The vehicle itself remains anchored to the current route coordinate.
    const follow = surface ? cameraAt(leg,u) : positionAlong(leg,eased);
    return {
      center: follow,
      zoom: mix(preset.arrivalZoom, leg.cruiseZoom, highAltitude),
      pitch: mix(preset.arrivalPitch,
        surface ? (leg.mode === 'boat' ? 58 : 61) : preset.cruisingPitch, highAltitude),
      bearing,
      elapsedMs: timeMs,
      segmentType: 'travel',
      stopIndex: leg.index,
      legIndex: leg.index,
      travelProgress: eased
    };
  }

  /** Only publish each destination once its incoming flight has started. */
  function visibleStops(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    return stops.filter((stop, index) => index === 0 || timeMs >= legs[index - 1].startMs);
  }

  function visibleRoutes(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    return legs.filter(leg => timeMs >= leg.startMs);
  }

  function planeAt(ms) {
    const pose = sample(ms);
    if (pose.segmentType !== 'travel') return null;
    const leg = legs[pose.legIndex];
    const u = pose.travelProgress;
    const coordinate = positionAlong(leg, u);
    const a = positionAlong(leg, clamp(u - 0.009, 0, 1));
    const b = positionAlong(leg, clamp(u + 0.009, 0, 1));
    const bearing = bearingBetween({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
    // Match the existing v9 Airplane PNG attitude: a pronounced nose-up
    // departure, neutral cruise, then nose-down approach. The airplane's
    // geographic anchor stays ON the route. Pitch changes only its image.
    // The map position uses eased travel progress (u), but attitude uses the
    // raw flight clock. Double-easing here made the plane reach full landing
    // pitch far before the final zoom, then appear frozen during approach.
    const elapsedFraction = clamp((pose.elapsedMs - leg.startMs) / leg.durationMs, 0, 1);
    const takeoffWindow = 1 - smooth(elapsedFraction / 0.25);
    const landingWindow = smooth((elapsedFraction - 0.70) / 0.30);
    const pitchDegrees = leg.mode === 'plane'
      ? Math.round((landingWindow * 76 - takeoffWindow * 56) * 10) / 10 : 0;
    const endpointBias = Math.max(0, 1 - Math.min(elapsedFraction, 1 - elapsedFraction) / 0.22);
    const takeoffGrow = mix(0.72, 1, smooth(elapsedFraction / 0.085));
    const landingScale = mix(1, 0.78, smooth((elapsedFraction - 0.92) / 0.08));
    const scale = (0.76 + 0.16 * smooth(endpointBias)) * takeoffGrow * landingScale;
    return { coordinates: coordinate,
      behindCoordinates: a, aheadCoordinates: b,
      bearing, legIndex: leg.index, progress: u,
      mode: leg.mode, pitchDegrees, scale };
  }

  /** Arrival timing drives both world-space ripple rings and the on-screen title. */
  function arrivalAt(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    for (let index = stopTimesMs.length - 1; index >= 1; index--) {
      const ageMs = timeMs - stopTimesMs[index];
      if (ageMs < 0 || ageMs >= preset.arrivalEffectMs) continue;
      const progress = ageMs / preset.arrivalEffectMs;
      const fadeIn = smooth(ageMs / 260);
      const fadeOut = 1 - smooth((ageMs - preset.arrivalEffectMs * 0.62) / (preset.arrivalEffectMs * 0.38));
      return { stop: stops[index], stopIndex: index, ageMs, progress,
        introProgress: smooth(ageMs / 420), opacity: fadeIn * fadeOut };
    }
    return null;
  }

  /** Only the currently flying route is changed each frame. Completed legs are static. */
  function activeRouteAt(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    const leg = legs.find(entry => timeMs >= entry.startMs && timeMs < entry.endMs);
    if (!leg) return { type: 'FeatureCollection', features: [] };
    const u = smooth((timeMs - leg.startMs) / leg.durationMs);
    const end = positionAtDistance(leg,u).index;
    const coordinates = leg.path.slice(0, end + 1);
    if (u > 0 && u < 1) coordinates.push(positionAlong(leg, u));
    return { type: 'FeatureCollection', features: coordinates.length > 1
      ? [{ type: 'Feature', properties: { legIndex: leg.index },
           geometry: { type: 'LineString', coordinates } }] : [] };
  }

  function revealedRoute(ms) {
    const timeMs = clamp(Number.isFinite(ms) ? ms : 0, 0, totalMs);
    const features = [];
    for (const leg of legs) {
      if (timeMs <= leg.startMs) break;
      const u = timeMs >= leg.endMs ? 1 : smooth((timeMs - leg.startMs) / leg.durationMs);
      const end = positionAtDistance(leg,u).index;
      const coords = leg.path.slice(0, end + 1);
      if (u > 0 && u < 1) coords.push(positionAlong(leg, u));
      if (coords.length < 2) continue;
      features.push({
        type: 'Feature',
        properties: { legIndex: leg.index },
        geometry: { type: 'LineString', coordinates: coords }
      });
    }
    return { type: 'FeatureCollection', features };
  }

  return { stops, legs, segments, headings, stopTimesMs, totalMs,
           totalMiles: legs.reduce((sum, leg) => sum + leg.miles, 0),
           preset, sample, revealedRoute, activeRouteAt, visibleStops, visibleRoutes, planeAt, arrivalAt };
}
