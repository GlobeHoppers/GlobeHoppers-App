import React from 'react';

const TRANSPORT_PRESENTATION = {
  plane: { icon: '✈', label: 'Plane' },
  drive: { icon: '🚗', label: 'Car' },
  car: { icon: '🚗', label: 'Car' },
  train: { icon: '🚆', label: 'Train' },
  boat: { icon: '⛴', label: 'Boat' }
};

function transportModesForRow(row = {}) {
  const values = Array.isArray(row.legModes) && row.legModes.length ? row.legModes : [row.mode];
  const seen = new Set();
  const modes = [];
  for (const rawValue of values) {
    const normalized = String(rawValue || '').trim().toLowerCase();
    const value = normalized === 'car' ? 'drive' : normalized;
    if (!value || !TRANSPORT_PRESENTATION[value] || seen.has(value)) continue;
    seen.add(value);
    modes.push(value);
  }
  return modes;
}

function renderTravelerNames(value, colors = [], fallback = '#00e5ff') {
  const names = String(value || '').split(/\s*\+\s*/).filter(Boolean);
  const palette = Array.isArray(colors) && colors.length ? colors : [fallback];
  return names.map((name, index) => <React.Fragment key={`${name}-${index}`}><span style={{ color: palette[index % palette.length] || fallback }}>{name}</span>{index < names.length - 1 && <span className="hop-result-card__traveler-plus"> + </span>}</React.Fragment>);
}

export default function HopResultCards({ rows = [], onSelect = () => {}, className = '', emptyMessage = 'No matching Hops.' }) {
  if (!rows.length) return <div className="hop-result-cards__empty">{emptyMessage}</div>;
  return <div className={`hop-result-cards ${className}`.trim()}>
    {rows.map((row, index) => {
      const transportModes = transportModesForRow(row);
      return <button
      key={row.id || `${row.title || 'hop'}-${index}`}
      type="button"
      className="destination-trip-queue__card hop-result-card"
      style={{
        '--queue-color': row.color || '#00e5ff',
        '--queue-border': row.borderGradient || row.color || '#00e5ff',
        '--queue-marker': row.markerBackground || row.color || '#00e5ff',
        '--queue-index': index
      }}
      onClick={() => onSelect(row)}
    >
      <span className="destination-trip-queue__ball" aria-hidden="true"></span>
      <span className="destination-trip-queue__content">
        <span className="hop-result-card__identity">
          <strong>{row.title || 'Hop'}</strong>
          {row.traveler && <em>{renderTravelerNames(row.traveler, row.borderColors, row.color)}</em>}
          {transportModes.length > 0 && <span className="hop-result-card__modes" aria-label={`Transportation: ${transportModes.map(mode => TRANSPORT_PRESENTATION[mode].label).join(', ')}`}>
            {transportModes.map(mode => <span key={mode} className={`hop-result-card__mode hop-result-card__mode--${mode}`}><span aria-hidden="true">{TRANSPORT_PRESENTATION[mode].icon}</span>{TRANSPORT_PRESENTATION[mode].label}</span>)}
          </span>}
        </span>
        <span className="hop-result-card__details">
          <span className="destination-trip-queue__route">{row.route || ''}</span>
          <span className="destination-trip-queue__date">{row.date || row.year || ''}</span>
        </span>
      </span>
    </button>;
    })}
  </div>;
}
