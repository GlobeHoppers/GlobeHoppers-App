/**
 * Lightweight presentation overlay for the airplane and destination label.
 * No React updates, GeoJSON serialization, or map source writes per camera frame.
 * The camera and aircraft are projected from the SAME scene timestamp.
 */
const finitePosition = position => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const show = (element, visible) => {
  if (element) element.style.visibility = visible ? 'visible' : 'hidden';
};
const atPoint = (element, point) => {
  element.style.transform = 'translate3d(' + point.x.toFixed(2) + 'px,' +
    point.y.toFixed(2) + 'px,0)';
};

export function updateCinematicActors(map, scene, ms, {
  planeRoot, planeLift, planeVisual, planeShadow,
  arrivalRoot, arrivalName
}) {
  const aircraft = scene.planeAt(ms);
  if (!aircraft || !planeRoot || !planeLift || !planeVisual || !planeShadow) {
    show(planeRoot, false);
  } else {
    const projected = map.project(aircraft.coordinates);
    if (!finitePosition(projected)) {
      show(planeRoot, false);
    } else {
      show(planeRoot, true);
      atPoint(planeRoot, projected);
      const altitude = aircraft.altitude;
      const heading = aircraft.bearing - map.getBearing();
      // Plane lifts away from the map point on departure and settles to it
      // before arrival. Its shadow stays attached to the underlying geography.
      planeLift.style.transform = 'translate3d(0,' +
        (-24 * altitude).toFixed(2) + 'px,0)';
      planeVisual.style.transform = 'rotate(' + heading.toFixed(3) + 'deg) ' +
        'perspective(260px) rotateX(' + aircraft.pitchDegrees.toFixed(2) +
        'deg) scale(' + aircraft.scale.toFixed(3) + ')';
      planeShadow.style.opacity = (0.56 - 0.38 * altitude).toFixed(3);
      planeShadow.style.transform = 'translate(-50%, -50%) scale(' +
        (0.7 + 0.5 * altitude).toFixed(3) + ')';
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
