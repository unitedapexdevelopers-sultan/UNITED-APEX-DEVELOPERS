// POST /api/share/create  { password, plate, hours, label }
// Admin or manager creates a share pass for ONE vehicle, e.g. Fatima's NUST bus
// (RIS-19-90) for a term, or a customer's assigned car for the trip.
// The admin never receives a location from this call — only the pass.
import { json, preflight, readBody, roleFor, getFleet, findVehicle, makePass } from './_lib.mjs';

const MAX_HOURS = 24 * 120; // one term at most; issue a fresh pass after that

export default async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== 'POST') return json(req, 405, { error: 'Use POST' });
  const { password, plate, hours, label } = await readBody(req);
  const role = await roleFor(password);
  if (!role) return json(req, 401, { error: 'Wrong password' });
  const h = Math.min(Math.max(Number(hours) || 24, 1), MAX_HOURS);
  try {
    const v = findVehicle(await getFleet(), plate);
    if (!v) return json(req, 404, { error: `No tracker found for ${plate}` });
    return json(req, 200, { plate: v.plate, ...makePass({ plate: v.plate, hours: h, label }) });
  } catch (e) {
    return json(req, 502, { error: 'Tracker unavailable, try again shortly' });
  }
};

export const config = { path: '/api/share/create' };
