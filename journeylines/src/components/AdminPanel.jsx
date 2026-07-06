import { useMemo, useState } from 'react';

const empty = { year: new Date().getFullYear(), month: null, day: null, label: '', travelers: ['joey','bonnie'], mode: 'plane', roundTrip: true, fromLocationId: null, toLocationId: '', notes: '', occasion: '' };

export default function AdminPanel({ trips, setTrips, locations }) {
  const [draft, setDraft] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('journeylines.githubToken') || '');
  const [repo, setRepo] = useState(() => localStorage.getItem('journeylines.repo') || '');
  const locs = useMemo(() => [...locations].sort((a,b) => a.name.localeCompare(b.name)), [locations]);

  function saveLocalToken(value) { setToken(value); localStorage.setItem('journeylines.githubToken', value); }
  function saveRepo(value) { setRepo(value); localStorage.setItem('journeylines.repo', value); }

  function submit(e) {
    e.preventDefault();
    const clean = normalizeTrip(draft, trips.length);
    if (editingId) setTrips(trips.map(t => t.id === editingId ? { ...t, ...clean, id: editingId } : t));
    else setTrips([...trips, clean]);
    setDraft(empty); setEditingId(null);
  }
  function edit(trip) { setEditingId(trip.id); setDraft({ ...empty, ...trip }); }
  function del(id) { if (confirm('Delete this trip?')) setTrips(trips.filter(t => t.id !== id)); }
  function download() {
    const blob = new Blob([JSON.stringify(trips, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'trips.json'; a.click(); URL.revokeObjectURL(url);
  }
  async function commitToGitHub() {
    if (!token || !repo) return alert('Enter a fine-grained GitHub token and repo in owner/repo format first.');
    const path = 'src/data/trips.json';
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers });
    const existing = getRes.ok ? await getRes.json() : null;
    const body = { message: 'Update JourneyLines trips data', content: btoa(unescape(encodeURIComponent(JSON.stringify(trips, null, 2)))), branch: 'main' };
    if (existing?.sha) body.sha = existing.sha;
    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!putRes.ok) throw new Error(await putRes.text());
    alert('Trips committed to GitHub.');
  }

  return <section className="admin glass">
    <h2>Admin Mode</h2>
    <p>Add, edit, delete, download JSON, or commit with a repo-limited GitHub token stored only in this browser.</p>
    <form onSubmit={submit} className="admin-form">
      <input value={draft.label} onChange={e => setDraft({...draft, label:e.target.value})} placeholder="Trip label" required />
      <input type="number" value={draft.year || ''} onChange={e => setDraft({...draft, year:Number(e.target.value)})} placeholder="Year" required />
      <input type="number" min="1" max="12" value={draft.month || ''} onChange={e => setDraft({...draft, month:e.target.value ? Number(e.target.value) : null})} placeholder="Month optional" />
      <select value={draft.toLocationId || ''} onChange={e => setDraft({...draft, toLocationId:e.target.value})} required>
        <option value="">Destination</option>{locs.map(l => <option key={l.id} value={l.id}>{l.name}, {l.region}</option>)}
      </select>
      <select value={(draft.travelers||[]).join(',')} onChange={e => setDraft({...draft, travelers:e.target.value.split(',')})}>
        <option value="joey,bonnie">Joey + Bonnie</option><option value="joey">Joey</option><option value="bonnie">Bonnie</option>
      </select>
      <select value={draft.mode || 'plane'} onChange={e => setDraft({...draft, mode:e.target.value})}>
        <option value="plane">Plane</option><option value="drive">Car</option><option value="boat">Boat</option><option value="train">Train</option>
      </select>
      <label className="check"><input type="checkbox" checked={!!draft.roundTrip} onChange={e => setDraft({...draft, roundTrip:e.target.checked})}/> Round trip</label>
      <textarea value={draft.notes || ''} onChange={e => setDraft({...draft, notes:e.target.value})} placeholder="Notes" />
      <button className="primary" type="submit">{editingId ? 'Save Edit' : 'Add Trip'}</button>
      {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(empty); }}>Cancel</button>}
    </form>
    <div className="admin-actions">
      <button onClick={download}>Download trips.json</button>
      <input value={repo} onChange={e => saveRepo(e.target.value)} placeholder="owner/repo" />
      <input value={token} onChange={e => saveLocalToken(e.target.value)} type="password" placeholder="GitHub fine-grained token" />
      <button onClick={() => commitToGitHub().catch(err => alert(err.message))}>Commit trips.json</button>
      <button onClick={() => { localStorage.removeItem('journeylines.githubToken'); setToken(''); }}>Clear token</button>
    </div>
    <div className="trip-list">
      {trips.slice().reverse().map(t => <div className="trip-row" key={t.id}><span>{t.displayDate || t.year} · {t.label}</span><button onClick={() => edit(t)}>Edit</button><button onClick={() => del(t.id)}>Delete</button></div>)}
    </div>
  </section>;
}
function normalizeTrip(t, count) {
  return { ...t, id: t.id || `${t.year}-${String(count + 1).padStart(3,'0')}-${slug(t.label)}`, displayDate: t.month ? new Date(t.year, t.month-1, 1).toLocaleDateString(undefined, { month:'long', year:'numeric' }) : String(t.year), sortKey: `${t.year}-${String(count + 1).padStart(3,'0')}`, route: t.route || [] };
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
