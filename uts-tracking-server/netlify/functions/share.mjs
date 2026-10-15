// GET /api/share?pass=...
// Customer / student view: returns the live location of the ONE vehicle named in
// the pass, and nothing else. Expired, edited or forged passes are rejected.
import { json, preflight, getFleet, findVehicle, readPass } from './_lib.mjs';

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const pass = new URL(req.url).searchParams.get('pass');
  const grant = readPass(pass);
  if (!grant) return json(req, 403, { error: 'This location link has expired or is not valid' });
  try {
    const v = findVehicle(await getFleet(), grant.plate);
    if (!v) return json(req, 404, { error: 'Vehicle location not available right now' });
    const { plate, status, time, lat, lng, speed, course } = v;
    return json(req, 200, { vehicle: { plate, status, time, lat, lng, speed, course }, expiresAt: grant.expiresAt, label: grant.label });
  } catch (e) {
    return json(req, 502, { error: 'Tracker unavailable, try again shortly' });
  }
};

export const config = { path: '/api/share' };
