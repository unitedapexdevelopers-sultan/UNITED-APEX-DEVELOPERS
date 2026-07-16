// One-time (idempotent) bootstrap call: creates the owner account if it doesn't exist yet.
// Safe to call on every launch — it's an upsert on the server side.
const port = process.env.PORT || 47831;
const token = process.env.SETUP_TOKEN;

fetch(`http://127.0.0.1:${port}/api/setup?token=${encodeURIComponent(token)}`)
  .then(() => process.exit(0))
  .catch(() => process.exit(0));
