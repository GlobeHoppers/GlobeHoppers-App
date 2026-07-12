let cities = null;
let indexed = null;

self.onmessage = async event => {
  const message = event.data || {};
  const { id, type, payload = {} } = message;
  try {
    if (type !== 'search') throw new Error(`Unknown city search request: ${type}`);
    await ensureLoaded(payload.dataUrl);
    const query = normalize(payload.query);
    const limit = Math.max(1, Math.min(40, Number(payload.limit) || 24));
    const results = query.length < 2 ? [] : search(query, limit);
    self.postMessage({ id, ok: true, results });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error), results: [] });
  }
};

async function ensureLoaded(dataUrl) {
  if (cities && indexed) return;
  const response = await fetch(dataUrl, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`City database request failed (${response.status}).`);
  const raw = await response.json();
  cities = Array.isArray(raw) ? raw : [];
  indexed = cities.map(city => ({
    city,
    name: normalize(city?.n ?? city?.name),
    ascii: normalize(city?.a ?? city?.asciiName),
    region: normalize(city?.r ?? city?.region),
    country: normalize(city?.cc ?? city?.countryCode),
    aliases: Array.isArray(city?.x ?? city?.aliases) ? (city.x ?? city.aliases).slice(0, 18).map(normalize) : [],
    population: Math.max(0, Number(city?.p ?? city?.population) || 0),
    feature: city?.f ?? city?.featureCode ?? ''
  }));
}

function search(query, limit) {
  const candidates = [];
  for (const row of indexed) {
    const score = scoreRow(row, query);
    if (score <= 0) continue;
    candidates.push({ city: row.city, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit).map(item => item.city);
}

function scoreRow(row, query) {
  let score = 0;
  if (row.name === query || row.ascii === query) score = 300;
  else if (row.name.startsWith(query) || row.ascii.startsWith(query)) score = 235;
  else if (row.aliases.some(alias => alias === query)) score = 210;
  else if (row.aliases.some(alias => alias.startsWith(query))) score = 165;
  else if (row.name.includes(query) || row.ascii.includes(query)) score = 115;
  else if (`${row.name} ${row.region} ${row.country}`.includes(query)) score = 70;
  if (!score) return 0;
  const populationBoost = Math.min(52, Math.log10(row.population + 10) * 8);
  const capitalBoost = row.feature === 'PPLC' ? 28 : row.feature === 'PPLA' ? 14 : 0;
  return score + populationBoost + capitalBoost;
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
