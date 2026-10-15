// POST /api/fleet  { password }
// Manager password -> every vehicle with live location.
// Admin password   -> plate list only (so admin can pick a vehicle to share), no locations.
import { json, preflight, readBody, roleFor, getFleet } from './_lib.mjs';

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST' });
  const { password } = await readBody(req);
  const role = await roleFor(password);
  if (!role) return json(req, 401, { error: 'Wrong password' });
  try {
    const fleet = await getFleet();
    if (role === 'manager') return json(req, 200, { role, updatedAt: new Date().toISOString(), vehicles: fleet });
    const plates = [...new Set(fleet.map(v => v.plate))].sort();
    return json(req, 200, { role, plates });
  } catch (e) {
    return json(req, 502, { error: 'Tracker unavailable, try again shortly' });
  }
};

export const config = { path: '/api/fleet' };
