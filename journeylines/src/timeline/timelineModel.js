/** Pure timeline projection: deterministic markers, year bands and trip cards. */

export function buildTimelineMarkers(rows = [], totalLegs = 0) {
  const denom = Math.max(1, totalLegs - 1);
  return (rows || []).map((row) => ({
    id: row.id,
    title: row.title || 'Trip',
    date: row.date || row.year || '',
    color: row.color || '#00e5ff',
    markerBackground: row.markerBackground || row.color || '#00e5ff',
    firstIndex: row.firstIndex || 0,
    destinationLocationIds: row.destinationLocationIds || [],
    progress: Math.max(0, Math.min(1, (row.firstIndex || 0) / Math.max(1, totalLegs)))
  }));
}

export function buildTimelineYearSegments(rows = [], totalLegs = 0) {
  const denom = Math.max(1, totalLegs - 1);
  const starts = [];
  const seen = new Set();
  for (const row of rows || []) {
    const year = String(row.year || row.date || '').match(/\d{4}/)?.[0];
    if (!year || seen.has(year)) continue;
    seen.add(year);
    starts.push({ year, start: Math.max(0, Math.min(1, (row.firstIndex || 0) / denom)) });
  }
  return starts.map((seg, index) => ({
    year: seg.year,
    start: seg.start,
    end: index < starts.length - 1 ? starts[index + 1].start : 1
  }));
}


export function buildTimelineMonthTicks(rows = [], totalLegs = 0) {
  const denom = Math.max(1, totalLegs - 1);
  const seen = new Set();
  return (rows || []).map((row, index) => {
    const year = Number(String(row.year || row.date || '').match(/\d{4}/)?.[0]);
    const month = Number(row.month);
    if (!Number.isFinite(year) || month < 1 || month > 12) return null;
    const key = `${year}-${month}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: `${key}-${row.id || index}`,
      year,
      month,
      label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1))),
      progress: Math.max(0, Math.min(1, Number(row.firstIndex || 0) / denom)),
      hasPin: true,
      markerId: row.id
    };
  }).filter(Boolean);
}

export function buildTimelineYearSpan(rows = []) {
  const values = (rows || []).map(row => {
    const year = Number(String(row.year || row.date || '').match(/\d{4}/)?.[0]);
    if (!Number.isFinite(year)) return null;
    const month = Math.max(1, Math.min(12, Number(row.month) || 7));
    return year + (month - 1) / 12;
  }).filter(Number.isFinite);
  if (values.length < 2) return 1;
  return Math.max(1 / 12, Math.max(...values) - Math.min(...values) + 1 / 12);
}


export function buildTripCardRows(rows, activeIndex) {
  if (!rows?.length) return [];
  let currentIdx = rows.findIndex(row => activeIndex >= row.firstIndex && activeIndex < row.firstIndex + Math.max(1, row.legCount || 1));
  if (currentIdx < 0) currentIdx = Math.max(0, Math.min(rows.length - 1, rows.findIndex(row => row.firstIndex >= activeIndex)));
  if (currentIdx < 0) currentIdx = 0;
  const yearCounts = new Map();
  const destinationCounts = new Map();
  const enriched = rows.map((row, i) => {
    const year = String(row.year || '').match(/\d{4}/)?.[0] || 'Trips';
    const yCount = (yearCounts.get(year) || 0) + 1;
    yearCounts.set(year, yCount);
    const key = row.toLocationId || row.title;
    const vCount = (destinationCounts.get(key) || 0) + 1;
    destinationCounts.set(key, vCount);
    return { ...row, totalIndex: i + 1, totalTrips: rows.length, tripOfYear: yCount, visitCount: vCount, visitDestination: row.title };
  });
  return enriched.slice(currentIdx, currentIdx + 4);
}

