import { useEffect, useRef, useState } from 'react';

// Render-only drawer; edit and navigation actions stay in the parent.

function splitTimelineBorderColors(colors = [], fallback = '#00e5ff') {
  const list = [...new Set((colors || []).filter(Boolean))];
  if (!list.length) return [fallback];
  return list;
}

function borderSegmentForSide(colors, side, fallback = '#00e5ff') {
  const list = splitTimelineBorderColors(colors, fallback);
  if (list.length === 1) return list[0];

  if (list.length === 2) {
    if (side === 'left') return list[0];
    if (side === 'right') return list[1];
    return `linear-gradient(90deg, ${list[0]} 0 50%, ${list[1]} 50% 100%)`;
  }

  // Perimeter order starts at top-left, moves clockwise around the card.
  // This is intentionally simple and foreground-rendered so it cannot be
  // hidden by older row background/hover styles.
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

  if (side === 'top') {
    const stops = [topLeft, ...extra.filter((_, i) => i % 2 === 0), topRight];
    return linearStops(stops, '90deg');
  }
  if (side === 'right') {
    const stops = [topRight, ...extra.filter((_, i) => i % 2 === 1), bottomRight];
    return linearStops(stops, '180deg');
  }
  if (side === 'bottom') {
    const stops = [bottomLeft, ...extra.filter((_, i) => i % 2 === 0).reverse(), bottomRight];
    return linearStops(stops, '90deg');
  }
  return linearStops([topLeft, bottomLeft], '180deg');
}

function linearStops(colors = [], direction = '90deg') {
  const list = splitTimelineBorderColors(colors);
  if (list.length === 1) return list[0];
  const step = 100 / list.length;
  return `linear-gradient(${direction}, ${list.map((color, index) => `${color} ${Math.max(0, index * step)}% ${Math.min(100, (index + 1) * step)}%`).join(', ')})`;
}

function TimelineRowBorder({ colors = [], fallback = '#00e5ff' }) {
  const list = splitTimelineBorderColors(colors, fallback);
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


export default function TripTimelineDrawer({ open, rows, activeIndex, initialScroll, onScrollStore, onClose, onJump, onEditTrip, viewType = 'expanded', onViewTypeChange }) {
  const [menu, setMenu] = useState(null);
  const listRef = useRef(null);
  const userScrollingRef = useRef(false);
  const scrollTimerRef = useRef(null);
  useEffect(() => {
    if (!open || !listRef.current) return;
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = initialScroll || 0; });
  // Restore only when opening. During playback, App re-renders should not
  // continuously force scrollTop and fight the user's scrollbar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', close); };
  }, [menu]);
  function openMenu(e, row) {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX || window.innerWidth - 180, window.innerWidth - 170);
    const y = Math.min(e.clientY || 120, window.innerHeight - 90);
    setMenu({ x, y, row });
  }
  function editFromMenu() {
    const id = menu?.row?.id;
    setMenu(null);
    if (id) onEditTrip?.(id);
  }
  const grouped = groupRowsByYear(rows);
  return <>
    <aside className={`trip-drawer glass ${open ? 'is-open' : ''} trip-drawer--${viewType}`} aria-hidden={!open}>
      <div className="trip-drawer__header drawer-header-unified">
        <p className="eyebrow">GlobeHoppers Studio</p>
        <ViewTypeSelector value={viewType} onChange={onViewTypeChange} />
        <button className="drawer-close-button" onClick={() => { setMenu(null); onClose(); }}>Close</button>
        <h2>GlobeHopper Timeline</h2>
      </div>
      <div ref={listRef} className={`trip-drawer__list trip-drawer__list--${viewType}`} onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => { userScrollingRef.current = true; e.stopPropagation(); }} onScroll={(e) => { userScrollingRef.current = true; window.clearTimeout(scrollTimerRef.current); scrollTimerRef.current = window.setTimeout(() => { userScrollingRef.current = false; }, 180); onScrollStore?.(e.currentTarget.scrollTop); }}>
        {viewType === 'card' ? grouped.map(group => <section className="timeline-year-section" key={group.year}>
          <h3>{group.year}</h3>
          <div className="timeline-card-grid">
            {group.rows.map(row => <TripDrawerRow key={row.id} row={row} activeIndex={activeIndex} onJump={onJump} openMenu={openMenu} viewType={viewType} />)}
          </div>
        </section>) : rows.map(row => <TripDrawerRow key={row.id} row={row} activeIndex={activeIndex} onJump={onJump} openMenu={openMenu} viewType={viewType} />)}
      </div>
    </aside>
    {menu && <div className="trip-context-menu glass" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <button onClick={editFromMenu}>Edit</button>
    </div>}
  </>;
}

function TripDrawerRow({ row, activeIndex, onJump, openMenu, viewType }) {
  const active = activeIndex >= row.firstIndex && activeIndex < row.firstIndex + Math.max(1, row.legCount || 1);
  return <div
    role="button"
    tabIndex={0}
    className={`gh-timeline-trip-row ${active ? 'is-active' : ''} gh-timeline-trip-row--${viewType}`}
    style={{ '--accent': row.color, '--trip-border': row.borderGradient || row.color }}
    onClick={() => onJump(row.firstIndex)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onJump(row.firstIndex); } }}
    onContextMenu={(e) => openMenu(e, row)}
    title="Click to play from here. Right-click or use ⋯ to edit."
  >
    <span className="trip-drawer__date">{row.date}</span>
    <span className="trip-drawer__main">
      <strong>{row.title}</strong>
      <small>{row.route}</small>
    </span>
    <span className="trip-drawer__meta">{row.mode}{row.legCount > 1 ? ` · ${row.legCount} legs` : ''}<br />{row.traveler}</span>
    {viewType !== 'card' && <button className="trip-drawer__more" type="button" aria-label={`Edit ${row.title}`} onClick={(e) => openMenu(e, row)}>⋯</button>}
    <TimelineRowBorder colors={row.borderColors} fallback={row.color} />
  </div>;
}

function ViewTypeSelector({ value, onChange }) {
  return <div className="view-type-selector" role="group" aria-label="Timeline view type">
    {[['expanded','Expanded'], ['compact','Compact'], ['card','Card']].map(([id, label]) => <button key={id} type="button" className={value === id ? 'is-selected' : ''} onClick={() => onChange?.(id)}>{label}</button>)}
  </div>;
}

function groupRowsByYear(rows = []) {
  const groups = [];
  const byYear = new Map();
  for (const row of rows) {
    const year = String(row.year || row.date || 'Trips').match(/\d{4}/)?.[0] || 'Trips';
    if (!byYear.has(year)) { const group = { year, rows: [] }; byYear.set(year, group); groups.push(group); }
    byYear.get(year).rows.push(row);
  }
  return groups;
}


