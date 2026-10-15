// Shared helpers for the UTS tracking server.
//
// The tracker API key (user_api_hash) lives ONLY in Netlify's environment
// variables. The app never sees it — the app talks to these functions, and these
// functions decide who may see which vehicle:
//   - Manager password  -> every vehicle with live location
//   - Admin password    -> plate list only (no locations) + can create share passes
//   - Share pass        -> live location of the ONE vehicle it was issued for
import crypto from 'node:crypto';

const CACHE_MS = 20_000; // tracker updates every ~1–2 min; don't hammer it
let cache = { at: 0, data: null };

export function env(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable ${name}`);
  }
  return v;
}

// --- HTTP helpers ---------------------------------------------------------
function corsHeaders(req) {
  const allowed = env('ALLOWED_ORIGINS', '*').split(',').map(s => s.trim());
  const origin = req.headers.get('origin') || '';
  const allow = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
export function json(req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) },
  });
}
export function preflight(req) {
  return req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders(req) }) : null;
}
export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// --- Passwords ------------------------------------------------------------
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
// Returns 'manager' | 'admin' | null. A wrong password costs ~600ms so it can't be guessed quickly.
export async function roleFor(password) {
  if (password && safeEqual(password, env('MANAGER_PASSWORD'))) return 'manager';
  if (password && safeEqual(password, env('ADMIN_PASSWORD'))) return 'admin';
  await new Promise(r => setTimeout(r, 600));
  return null;
}

// --- Tracker feed -----------------------------------------------------------
export function cleanPlate(name) {
  return String(name || '')
    .replace(/\s+(NEW ?S|NEWS|NR|Service Block)\s*$/i, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function tidy(v) {
  return {
    plate: cleanPlate(v.name),
    name: String(v.name || '').trim(),
    status: v.status,            // online = moving, engine = engine on, ack = parked, offline
    time: v.time,                // tracker's own timestamp, "DD-MM-YYYY HH:MM:SS" (PKT)
    lat: Number(v.lat),
    lng: Number(v.lng),
    speed: Number(v.speed) || 0, // km/h
    course: Number(v.course) || 0,
  };
}
export async function getFleet() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const res = await fetch(env('TRACKER_API_URL'), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Tracker API returned ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('Tracker API returned an unexpected format');
  cache = { at: Date.now(), data: raw.map(tidy) };
  return cache.data;
}
export function findVehicle(fleet, plate) {
  const key = cleanPlate(plate).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return fleet.find(v => v.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') === key) || null;
}

// --- Share passes -------------------------------------------------------------
// A pass is "<payload>.<signature>". The payload names ONE plate and an expiry;
// the signature (HMAC with SHARE_SECRET) means nobody can forge or edit a pass.
// Changing SHARE_SECRET in Netlify instantly cancels every pass ever issued.
const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString();
function sign(payload) {
  return crypto.createHmac('sha256', env('SHARE_SECRET')).update(payload).digest('base64url');
}
export function makePass({ plate, hours, label }) {
  const body = b64(JSON.stringify({ p: cleanPlate(plate), e: Date.now() + hours * 3600_000, l: String(label || '').slice(0, 80) }));
  return { pass: `${body}.${sign(body)}`, expiresAt: new Date(Date.now() + hours * 3600_000).toISOString() };
}
export function readPass(pass) {
  const [body, sig] = String(pass || '').split('.');
  if (!body || !sig) return null;
  const good = sign(body);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(unb64(body));
    if (!d.p || !d.e || Date.now() > d.e) return null;
    return { plate: d.p, expiresAt: new Date(d.e).toISOString(), label: d.l || '' };
  } catch { return null; }
}
