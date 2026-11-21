import TravelMap from '../components/TravelMap.jsx';
import './viewer.css';

/**
 * Playback presentation boundary.
 *
 * The viewer receives read-only travel history, playback state, camera
 * instructions and versioned route data. The Studio/editor code is loaded
 * through a different boundary and never imported from this module.
 *
 * Hold the first globe mount until route data is available. This avoids a
 * half-initialized MapLibre map, missing initial surface trails, and a costly
 * second route-layer build immediately after startup.
 */
export default function PlaybackViewer({ routeDetailsData, ...props }) {
  if (!routeDetailsData?.routes) {
    return <div className="viewer-loading" role="status" aria-live="polite">
      <span className="viewer-loading__spinner" aria-hidden="true" />
      <span>Preparing your travel globe…</span>
    </div>;
  }
  return <TravelMap routeDetailsData={routeDetailsData} {...props} />;
}
