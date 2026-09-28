// Mileage Tracker: geocode two places, get a driving route, show the distance,
// and keep a log of trips in localStorage.

const KM_PER_MI = 1.609344;
const STORE_KEY = 'mileage-trips';
const SETTINGS_KEY = 'mileage-settings';

const $ = (id) => document.getElementById(id);

// ---------- Map ----------
const map = L.map('map').setView([39.5, -98.35], 4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);
let routeLayer = null;
let markers = [];

function clearMap() {
  if (routeLayer) map.removeLayer(routeLayer);
  markers.forEach((m) => map.removeLayer(m));
  routeLayer = null;
  markers = [];
}

// ---------- Storage (wrapped: storage can be unavailable) ----------
function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

let trips = load(STORE_KEY, []);
const settings = load(SETTINGS_KEY, { unit: 'mi', rate: 0.7 });
$('unit').value = settings.unit;
$('rate').value = settings.rate;
$('date').valueAsDate = new Date();

// ---------- Helpers ----------
function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').className = isError ? 'error' : '';
}

function fmtDist(miles, unit = settings.unit) {
  const v = unit === 'km' ? miles * KM_PER_MI : miles;
  return v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function fmtMoney(n) {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

// Great-circle distance in miles.
function haversineMi(a, b) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// "lat, lon" typed directly (or filled by the 📍 button) skips geocoding.
function parseCoords(text) {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lon = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
}

// ---------- APIs ----------
async function geocode(query) {
  const coords = parseCoords(query);
  if (coords) return coords;
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' +
    encodeURIComponent(query);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Location lookup failed (${res.status})`);
  const data = await res.json();
  if (!data.length) throw new Error(`Couldn't find "${query}"`);
  return { lat: +data[0].lat, lon: +data[0].lon, name: data[0].display_name };
}

async function route(a, b) {
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}` +
    '?overview=full&geometries=geojson';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('No driving route found between those places');
  const r = data.routes[0];
  return { meters: r.distance, seconds: r.duration, geometry: r.geometry };
}

// ---------- Calculate ----------
let current = null;

$('trip-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromText = $('from').value.trim();
  const toText = $('to').value.trim();
  if (!fromText || !toText) return;

  $('calc').disabled = true;
  $('result').hidden = true;
  setStatus('Finding locations…');
  try {
    const a = await geocode(fromText);
    const b = await geocode(toText);
    setStatus('Calculating route…');
    const r = await route(a, b);

    const round = $('round-trip').checked;
    const factor = round ? 2 : 1;
    const miles = (r.meters / 1000 / KM_PER_MI) * factor;

    current = {
      id: Date.now(),
      date: $('date').value || new Date().toISOString().slice(0, 10),
      from: fromText,
      to: toText,
      fromName: a.name,
      toName: b.name,
      miles,
      straightMiles: haversineMi(a, b) * factor,
      seconds: r.seconds * factor,
      roundTrip: round,
      note: $('note').value.trim(),
    };

    drawRoute(a, b, r.geometry);
    showResult();
    setStatus('');
  } catch (err) {
    setStatus(err.message || 'Something went wrong', true);
  } finally {
    $('calc').disabled = false;
  }
});

function drawRoute(a, b, geometry) {
  clearMap();
  routeLayer = L.geoJSON(geometry, { style: { color: '#2563eb', weight: 5, opacity: 0.8 } }).addTo(map);
  markers.push(L.marker([a.lat, a.lon]).addTo(map).bindPopup(`<b>A</b><br>${escapeHtml(a.name)}`));
  markers.push(L.marker([b.lat, b.lon]).addTo(map).bindPopup(`<b>B</b><br>${escapeHtml(b.name)}`));
  map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });
}

function showResult() {
  if (!current) return;
  const unit = settings.unit;
  $('res-dist').textContent = fmtDist(current.miles);
  $('res-unit').textContent = unit;
  $('res-time').textContent = `about ${fmtDuration(current.seconds)}` + (current.roundTrip ? ' (round trip)' : '');
  $('res-straight').textContent = `${fmtDist(current.straightMiles)} ${unit}`;
  const rate = parseFloat($('rate').value) || 0;
  $('res-money').textContent = rate ? `Reimbursement at ${fmtMoney(rate)}/mi: ${fmtMoney(current.miles * rate)}` : '';
  $('result').hidden = false;
}

$('save').addEventListener('click', () => {
  if (!current) return;
  trips.unshift(current);
  save(STORE_KEY, trips);
  current = null;
  $('result').hidden = true;
  $('note').value = '';
  setStatus('Trip saved.');
  renderLog();
});

// ---------- Current location ----------
$('use-location').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('Your browser does not support location.', true);
  setStatus('Getting your location…');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $('from').value = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      setStatus('');
    },
    (err) => setStatus(`Couldn't get location: ${err.message}`, true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// ---------- Log ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderLog() {
  const unit = settings.unit;
  const rate = parseFloat($('rate').value) || 0;
  const total = trips.reduce((s, t) => s + t.miles, 0);

  $('tot-trips').textContent = trips.length;
  $('tot-dist').textContent = fmtDist(total);
  $('tot-unit').textContent = unit === 'km' ? 'kilometers' : 'miles';
  $('tot-money').textContent = fmtMoney(total * rate);
  $('log-empty').hidden = trips.length > 0;

  $('log-body').innerHTML = trips.map((t) => `
    <tr>
      <td>${escapeHtml(t.date)}</td>
      <td>${escapeHtml(t.from)} → ${escapeHtml(t.to)}${t.roundTrip ? ' ↺' : ''}
        ${t.note ? `<div class="note">${escapeHtml(t.note)}</div>` : ''}</td>
      <td class="num">${fmtDist(t.miles)} ${unit}</td>
      <td><button data-id="${t.id}" title="Delete trip">✕</button></td>
    </tr>`).join('');
}

$('log-body').addEventListener('click', (e) => {
  const id = e.target.dataset?.id;
  if (!id) return;
  trips = trips.filter((t) => String(t.id) !== id);
  save(STORE_KEY, trips);
  renderLog();
});

$('clear').addEventListener('click', () => {
  if (!trips.length || !confirm('Delete all saved trips?')) return;
  trips = [];
  save(STORE_KEY, trips);
  renderLog();
});

$('export').addEventListener('click', () => {
  if (!trips.length) return setStatus('No trips to export.', true);
  const rate = parseFloat($('rate').value) || 0;
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'From', 'To', 'Round trip', 'Miles', 'Kilometers', 'Reimbursement', 'Note']];
  trips.forEach((t) => rows.push([
    t.date, t.from, t.to, t.roundTrip ? 'yes' : 'no',
    t.miles.toFixed(1), (t.miles * KM_PER_MI).toFixed(1), (t.miles * rate).toFixed(2), t.note,
  ]));
  const csv = rows.map((r) => r.map(q).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mileage-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Settings ----------
$('unit').addEventListener('change', () => {
  settings.unit = $('unit').value;
  save(SETTINGS_KEY, settings);
  showResultIfVisible();
  renderLog();
});
$('rate').addEventListener('input', () => {
  settings.rate = parseFloat($('rate').value) || 0;
  save(SETTINGS_KEY, settings);
  showResultIfVisible();
  renderLog();
});
function showResultIfVisible() {
  if (!$('result').hidden) showResult();
}

renderLog();
