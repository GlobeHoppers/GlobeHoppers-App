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
      return applyVesselSpriteOffset(Math.atan2(dx, -dy) * 180 / Math.PI, 'plane');
    }
  }
  // At extreme distance/zoom, fall back to the geographic heading.
  return applyVesselSpriteOffset(plane.bearing - map.getBearing(), 'plane');
}

export function updateCinematicActors(map, scene, ms, {
  planeRoot, planeVisual, arrivalRoot, arrivalName
}) {
  const aircraft = scene.planeAt(ms);
  if (!aircraft || !planeRoot || !planeVisual) {
    show(planeRoot, false);
  } else {
    const projected = map.project(aircraft.coordinates);
    if (!finitePosition(projected)) {
      show(planeRoot, false);
    } else {
      show(planeRoot, true);
      // Anchor the CENTRE of the existing v9 PNG directly to the route point.
      atPoint(planeRoot, projected);
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
