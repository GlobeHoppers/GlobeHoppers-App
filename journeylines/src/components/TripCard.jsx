import { displayDate } from '../utils/dateUtils.js';
import { routeMiles } from '../utils/distanceUtils.js';

export default function TripCard({ trip, expanded, traveler }) {
  if (!trip || !expanded) return null;
  const miles = Math.round(routeMiles(expanded.route));
  const mode = trip.mode === 'mixed' ? 'Mixed route' : capitalize(trip.mode || 'plane');
  const returnText = trip.roundTrip ? 'Round trip' : expanded.route.length > 2 ? 'Multi-stop' : 'One way';
  return <aside className="trip-card" style={{ '--accent': traveler?.color || '#00e5ff' }}>
    <div className="trip-card__eyebrow">{displayDate(trip)}</div>
    <h2>{trip.label}</h2>
    <p>{mode} · {returnText} · {miles.toLocaleString()} miles</p>
    <p className="trip-card__traveler">{traveler?.name || 'Travel'}</p>
    {trip.notes && <p className="trip-card__notes">{trip.notes}</p>}
  </aside>;
}
function capitalize(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
