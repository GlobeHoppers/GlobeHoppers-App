export function displayDate(trip) {
  if (trip.displayDate) return trip.displayDate;
  if (trip.month && trip.day) return new Date(trip.year, trip.month - 1, trip.day).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  if (trip.month) return new Date(trip.year, trip.month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return String(trip.year);
}
export function sortTrips(trips) {
  return [...trips].sort((a,b) => String(a.sortKey ?? `${a.year}-999`).localeCompare(String(b.sortKey ?? `${b.year}-999`)));
}
