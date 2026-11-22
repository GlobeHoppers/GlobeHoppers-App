/**
 * Cinematic actors use one projected map coordinate per frame, shared with the
 * cinematic route. Plane attitude is a visual transform on the v9 PNG only.
 * No artificial vertical lift: that previously detached the aircraft from
 * its geographic flight line whenever the camera zoomed in.
 */
import { applyVesselSpriteOffset } from '../utils/vehicleOrientation.js';

const finitePosition = point => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const show = (element, visible) => {
  if (element) element.style.visibility = visible ? 'visible' : 'hidden';
};
const atPoint = (element, point) => {
  element.style.transform = 'translate3d(' + point.x.toFixed(2) + 'px,' +
    point.y.toFixed(2) + 'px,0)';
};

/** Match v9's camera-stable route-tangent orientation on pitched globe views. */
export function projectedAircraftHeading(map, plane) {
  const behind = map.project(plane.behindCoordinates);
  const ahead = map.project(plane.aheadCoordinates);
  if (finitePosition(behind) && finitePosition(ahead)) {
    const dx = ahead.x - behind.x;
    const dy = ahead.y - behind.y;
    if (Math.hypot(dx, dy) >= 0.75) {
      return applyVesselSpriteOffset(Math.atan2(dx, -dy) * 180 / Math.PI, plane.mode || 'plane');
    }
  }
  // At extreme distance/zoom, fall back to the geographic heading.
  return applyVesselSpriteOffset(plane.bearing - map.getBearing(), plane.mode || 'plane');
}

const stopLabelCache=new WeakMap();
function updateLocalStopLabels(map,scene,ms,root,enabled) {
  if(!root)return;
  root.style.display=enabled?'block':'none';
  if(!enabled)return;
  let nodes=stopLabelCache.get(root);
  if(!nodes){nodes=new Map();stopLabelCache.set(root,nodes);}
  const current=scene.visibleStops(ms);
  const historical=map.getZoom()>=5.5 && typeof scene.completedHistory==='function'
    ? scene.completedHistory(ms).stops.features : [];
  const places=new Map();
  // Current places get priority over subdued historical labels.
  for(const stop of current)places.set(
    stop.lon.toFixed(5)+','+stop.lat.toFixed(5),
    {lon:stop.lon,lat:stop.lat,name:stop.name,current:true});
  for(const feature of historical){
    const [lon,lat]=feature.geometry.coordinates;
    const id=lon.toFixed(5)+','+lat.toFixed(5);
    if(!places.has(id))places.set(id,{lon,lat,
      name:feature.properties.name,current:false});
  }
  const keys=new Set();
  const occupied=new Set();
  let historyShown=0;
  for(const [id,stop] of places){
    const projected=map.project([stop.lon,stop.lat]);
    if(!finitePosition(projected))continue;
    // Avoid flooding close regional imagery with overlapping labels.
    if(projected.x<-30||projected.y<-30||
       projected.x>map.getCanvas().clientWidth+30||
       projected.y>map.getCanvas().clientHeight+30)continue;
    if(!stop.current){
      if(historyShown>=36)continue;
      const cell=Math.floor(projected.x/78)+','+Math.floor(projected.y/35);
      if(occupied.has(cell))continue;
      occupied.add(cell);historyShown++;
    }
    keys.add(id);
    let node=nodes.get(id);
    if(!node){
      node=document.createElement('div');
      node.className='cg-local-stop-label';
      const text=document.createElement('span');
      node.append(text);
      root.append(node);
      nodes.set(id,node);
    }
    node.classList.toggle('cg-local-history-label',!stop.current);
    if(node.firstElementChild.textContent!==stop.name)
      node.firstElementChild.textContent=stop.name;
    show(node,true);
    atPoint(node,projected);
  }
  for(const [id,node] of nodes){
    if(!keys.has(id)){node.remove();nodes.delete(id);}
  }
}

export function updateCinematicActors(map, scene, ms, {
  planeRoot, planeVisual, arrivalRoot, arrivalName, vehicleImages,
  stopLabelsRoot, showLocalLabels = false
}) {
  // The self-contained style deliberately has no remote glyph endpoint.
  // Keep existing city labels map-anchored using inexpensive DOM projection.
  updateLocalStopLabels(map,scene,ms,stopLabelsRoot,showLocalLabels);
  const aircraft = scene.planeAt(ms);
  if (!aircraft || !planeRoot || !planeVisual) {
    show(planeRoot, false);
  } else {
    const projected = map.project(aircraft.coordinates);
    if (!finitePosition(projected)) {
      show(planeRoot, false);
    } else {
      show(planeRoot, true);
      // Keep the vehicle's center on the projected geographic route point.
      atPoint(planeRoot, projected);
      const mode = aircraft.mode || 'plane';
      if (vehicleImages?.[mode] && planeVisual.dataset.mode !== mode) {
        planeVisual.src = vehicleImages[mode];
        planeVisual.dataset.mode = mode;
      }
      const rotation = projectedAircraftHeading(map, aircraft);
      planeVisual.style.transform = 'rotate(' + rotation.toFixed(3) + 'deg) ' +
        'perspective(900px) rotateX(' + aircraft.pitchDegrees.toFixed(1) +
        'deg) scale(' + aircraft.scale.toFixed(3) + ')';
    }
  }

  const arrival = scene.arrivalAt(ms);
  if (!arrival || !arrivalRoot || !arrivalName) {
    show(arrivalRoot, false);
  } else {
    const projected = map.project([arrival.stop.lon, arrival.stop.lat]);
    if (!finitePosition(projected)) {
      show(arrivalRoot, false);
    } else {
      show(arrivalRoot, true);
      if (arrivalName.textContent !== arrival.stop.name) {
        arrivalName.textContent = arrival.stop.name;
      }
      atPoint(arrivalRoot, projected);
      arrivalRoot.style.opacity = arrival.opacity.toFixed(4);
      arrivalRoot.style.setProperty('--cg-arrival-rise',
        (12 * (1 - arrival.introProgress)).toFixed(2) + 'px');
      arrivalRoot.style.setProperty('--cg-arrival-scale',
        (0.9 + 0.1 * arrival.introProgress).toFixed(3));
    }
  }
}
