const port = process.env.PORT || 47831;
const url = `http://127.0.0.1:${port}/api/auth/csrf`;

async function wait() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        process.exit(0);
      }
    } catch (e) {
      // server not up yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  process.exit(1);
}

wait();
