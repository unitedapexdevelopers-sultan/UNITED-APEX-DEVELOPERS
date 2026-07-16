LEDGER — Desktop App (Windows)
==============================

WHAT THIS IS
------------
Ledger runs entirely on your laptop. There's no website involved — double-clicking
"Start Ledger.bat" starts a small local server (bundled, nothing to install) and
opens the app in its own window, no browser address bar. Your data lives in a
private Postgres database (Supabase), so it's safe across reinstalls/reboots.

FIRST-TIME SETUP
-----------------
1. Extract this whole "Ledger" folder wherever you like (Desktop, Documents,
   anywhere — just don't lose the folder, everything runs from inside it).
2. Double-click "Start Ledger.bat". The first launch takes a few seconds while
   it starts the local server and creates your account.
3. (Optional but recommended) Double-click "Create Desktop Shortcut.bat" once —
   this puts a "Ledger" icon on your Desktop so you never need to open this
   folder again. Windows may show an "Unknown Publisher" / SmartScreen warning
   the first time — that's expected for an app that isn't code-signed; click
   "More info" -> "Run anyway".

EVERY-DAY USE
-------------
- Double-click the "Ledger" desktop shortcut (or "Start Ledger.bat" in this
  folder). It reuses the already-running server if one's open, so launching
  twice is safe.
- To fully shut it down, run "Stop Ledger.bat", or just log off/restart your
  laptop (it doesn't run at startup automatically).

TROUBLESHOOTING
----------------
- "Ledger server did not start in time": close the window, wait a few seconds,
  and run "Start Ledger.bat" again — the very first launch can be slower.
- If the app opens in a normal Edge tab instead of its own window, Edge isn't
  installed at the expected path — open http://127.0.0.1:47831/dashboard in
  any browser instead; the app still works, it just won't be chrome-less.
- Your data is safe even if you delete this folder and re-extract the zip
  later — it's stored remotely in Postgres, not on your laptop.

WHAT'S INSIDE (for the curious)
--------------------------------
- node\        a portable Node.js runtime (no system install needed)
- app\         the built application (Next.js, standalone server)
- tools\       small helper scripts the launcher uses to wait for the server
               and create your account on first run
- icon.ico     used for the desktop shortcut
