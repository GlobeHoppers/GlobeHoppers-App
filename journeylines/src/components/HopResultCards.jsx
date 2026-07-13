import React from 'react';

export default function HopResultCards({ rows = [], onSelect = () => {}, className = '', emptyMessage = 'No matching Hops.' }) {
  if (!rows.length) return <div className="hop-result-cards__empty">{emptyMessage}</div>;
  return <div className={`hop-result-cards ${className}`.trim()}>
    {rows.map((row, index) => <button
      key={row.id || `${row.title || 'hop'}-${index}`}
      type="button"
      className="destination-trip-queue__card gh-timeline-trip-row hop-result-card"
      style={{
        '--queue-color': row.color || '#00e5ff',
        '--queue-border': row.borderGradient || row.color || '#00e5ff',
        '--queue-marker': row.markerBackground || row.color || '#00e5ff',
        '--queue-index': index
      }}
      onClick={() => onSelect(row)}
    >
      <TimelineRowBorder colors={row.borderColors || [row.color || '#00e5ff']} fallback={row.color || '#00e5ff'} />
      <span className="destination-trip-queue__ball" aria-hidden="true"></span>
      <span className="destination-trip-queue__content">
        <span className="destination-trip-queue__date">{row.date || row.year || ''}</span>
        <strong>{row.title || 'Hop'}</strong>
        <span className="destination-trip-queue__route">{row.route || ''}</span>
        <em>{row.traveler || ''}</em>
      </span>
    </button>)}
  </div>;
}

function splitColors(colors = [], fallback = '#00e5ff') {
  const list = [...new Set((colors || []).filter(Boolean))];
  return list.length ? list : [fallback];
}

function linearStops(colors = [], direction = '90deg') {
  const list = splitColors(colors);
  if (list.length === 1) return list[0];
  const step = 100 / list.length;
  return `linear-gradient(${direction}, ${list.map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`).join(', ')})`;
}

function borderSegmentForSide(colors, side, fallback) {
  const list = splitColors(colors, fallback);
  if (list.length === 1) return list[0];
  if (list.length === 2) {
    if (side === 'left') return list[0];
    if (side === 'right') return list[1];
    return `linear-gradient(90deg, ${list[0]} 0 50%, ${list[1]} 50% 100%)`;
  }
  if (list.length === 3) {
    if (side === 'top') return `linear-gradient(90deg, ${list[0]} 0 50%, ${list[1]} 50% 100%)`;
    if (side === 'right') return list[1];
    if (side === 'bottom') return `linear-gradient(90deg, ${list[2]} 0 50%, ${list[1]} 50% 100%)`;
    return `linear-gradient(180deg, ${list[0]} 0 50%, ${list[2]} 50% 100%)`;
  }
  const topLeft = list[0];
  const topRight = list[1] || topLeft;
  const bottomRight = list[2] || topRight;
  const bottomLeft = list[3] || bottomRight;
  const extra = list.slice(4);
  if (side === 'top') return linearStops([topLeft, ...extra.filter((_, index) => index % 2 === 0), topRight], '90deg');
  if (side === 'right') return linearStops([topRight, ...extra.filter((_, index) => index % 2 === 1), bottomRight], '180deg');
  if (side === 'bottom') return linearStops([bottomLeft, ...extra.filter((_, index) => index % 2 === 0).reverse(), bottomRight], '90deg');
  return linearStops([topLeft, bottomLeft], '180deg');
}

function TimelineRowBorder({ colors = [], fallback = '#00e5ff' }) {
  const list = splitColors(colors, fallback);
  return <span
    className="gh-timeline-row-border"
    aria-hidden="true"
    style={{
      '--gh-row-border-top': borderSegmentForSide(list, 'top', fallback),
      '--gh-row-border-right': borderSegmentForSide(list, 'right', fallback),
      '--gh-row-border-bottom': borderSegmentForSide(list, 'bottom', fallback),
      '--gh-row-border-left': borderSegmentForSide(list, 'left', fallback)
    }}
  >
    <span className="gh-row-border-strip gh-row-border-strip--top" />
    <span className="gh-row-border-strip gh-row-border-strip--right" />
    <span className="gh-row-border-strip gh-row-border-strip--bottom" />
    <span className="gh-row-border-strip gh-row-border-strip--left" />
  </span>;
}
