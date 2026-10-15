// Shared helpers for the UTS tracking pages (fleet / share / track).
const UTS = {
  STATUS: {
    online:  { label: 'Moving',    cls: 's-online',  color: '#16A34A', order: 0 },
    engine:  { label: 'Engine on', cls: 's-engine',  color: '#E8791A', order: 1 },
    ack:     { label: 'Parked',    cls: 's-ack',     color: '#0A94DB', order: 2 },
    offline: { label: 'Offline',   cls: 's-offline', color: '#94A3B8', order: 3 },
  },
  status(s) { return UTS.STATUS[s] || UTS.STATUS.ack; },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  ss: {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  },
  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  },
  // Tracker timestamps are Pakistan time, "DD-MM-YYYY HH:MM:SS".
  time(t) {
    const m = String(t || '').match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 5, +m[5], +m[6]) : null;
  },
  ago(ms) {
    if (ms === null) return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 172800) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  },
  clock(ms) {
    return ms === null ? '' : new Date(ms).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });
  },
  CITIES: [['Islamabad', 33.6844, 73.0479], ['Rawalpindi', 33.5651, 73.0169], ['Lahore', 31.5204, 74.3587], ['Karachi', 24.8607, 67.0011],
    ['Peshawar', 34.0151, 71.5249], ['Quetta', 30.1798, 66.975], ['Multan', 30.1575, 71.5249], ['Faisalabad', 31.4504, 73.135],
    ['Hyderabad', 25.396, 68.3578], ['Sukkur', 27.7052, 68.8574], ['Gwadar', 25.1264, 62.3225], ['Gilgit', 35.9208, 74.3089],
    ['Abbottabad', 34.1688, 73.2215], ['Bahawalpur', 29.3956, 71.6836], ['Sialkot', 32.4945, 74.5229], ['Gujranwala', 32.1877, 74.1945],
    ['D.I. Khan', 31.8313, 70.9017], ['Mardan', 34.198, 72.0404], ['Swat', 34.7717, 72.3602], ['Turbat', 26.0023, 63.044],
    ['Larkana', 27.557, 68.2264], ['Sargodha', 32.0836, 72.6711], ['Jhelum', 32.9425, 73.7257], ['Nawabshah', 26.2442, 68.41],
    ['Zhob', 31.3417, 69.4493], ['Kohat', 33.5869, 71.4429], ['Muzaffarabad', 34.37, 73.4711], ['Rahim Yar Khan', 28.4202, 70.2952],
    ['Sahiwal', 30.6682, 73.1114], ['Mianwali', 32.5839, 71.537], ['Chitral', 35.8518, 71.7864], ['Hunza', 36.3167, 74.65], ['Taxila', 33.7463, 72.8397]],
  near(lat, lng) {
    let best = null;
    for (const c of UTS.CITIES) {
      const dLat = (c[1] - lat) * Math.PI / 180, dLng = (c[2] - lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(c[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (!best || km < best[1]) best = [c[0], km];
    }
    if (!best) return '';
    return best[1] < 3 ? 'In ' + best[0] : best[1] < 80 ? '≈ ' + Math.round(best[1]) + ' km from ' + best[0] : 'On route — nearest city ' + best[0] + ' (' + Math.round(best[1]) + ' km)';
  },
  maps(lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng; },
  // OpenStreetMap base layer (works on this site; the tracking key is never sent to the browser).
  baseMap(el, center, zoom) {
    const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(center, zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    return map;
  },
};
