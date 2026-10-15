# UTS Tracking Server

A small server that sits between the UTS Karlo app and the GPS tracker. The tracker
key stays on this server. It is never inside the app, so nobody can copy it out of
the app's code.

| Who | What they get |
|---|---|
| **Manager** (manager password) | All vehicles with live location, status, speed and last update time |
| **Admin** (admin password) | A list of plate numbers only, **no locations**. They can create a share pass for one vehicle |
| **Customer / student** (share pass) | The live location of the **one** vehicle in their pass, until it expires |
| Anyone else | Nothing |

## One-time setup (about 10 minutes)

### 1. Make a Netlify account
Go to https://app.netlify.com and sign up with the GitHub account that owns the
`united-apex-developers` repository. The free plan is enough.

### 2. Create the site
1. **Add new site → Import an existing project → GitHub** → pick `united-apex-developers`.
2. **Branch to deploy:** the branch that contains this folder.
3. **Base directory:** `uts-tracking-server`
4. Leave the build command empty. The publish directory is filled in from `netlify.toml`.
5. Click **Deploy**.

### 3. Add the secret settings
Go to **Site configuration → Environment variables → Add a variable** and add these four.
Type the values yourself; never put them in the code or send them in chat.

| Key | Value |
|---|---|
| `TRACKER_API_URL` | The full tracker link the tracker company gave you, including `user_api_hash=…` |
| `MANAGER_PASSWORD` | A long password, only for managers (e.g. 4 random words) |
| `ADMIN_PASSWORD` | A **different** long password for admin staff |
| `SHARE_SECRET` | Any long random text (40+ characters). Nobody needs to remember it |

Optional: `ALLOWED_ORIGINS`, a comma-separated list of the website addresses
allowed to call the server (for example the app's own domain once it has one).
Leave it unset to allow any address. The passwords and passes still protect the data.

### 4. Redeploy
**Deploys → Trigger deploy → Deploy site** so the new settings take effect.

### 5. Send Claude the site address
It looks like `https://something.netlify.app`. Send only this address, **not** the
passwords or the tracker key. The app will ask for the manager or admin password
on the staff device the first time.

### 6. Ask the tracker company for a new key
The current key was shared in a chat. Once the server works, ask the tracker company
(pakwelcometrade) to issue a new `user_api_hash`. Then replace `TRACKER_API_URL` in
step 3 with the new link and redeploy. The old key stops working.

## Everyday rules
- **Turning off all shared locations at once:** change `SHARE_SECRET` and redeploy.
  Every pass ever issued stops working immediately.
- **A staff member leaves:** change `ADMIN_PASSWORD` (or `MANAGER_PASSWORD`) and redeploy.
- **Pass length:** a booking pass normally lasts until the trip ends. A student pass can
  last up to 120 days (one term). After that the admin issues a new one.

## Technical reference
- `POST /api/fleet` with `{ password }`
  - manager: `{ role, vehicles: [{ plate, name, status, time, lat, lng, speed, course }] }`
  - admin: `{ role, plates: [...] }`
- `POST /api/share/create` with `{ password, plate, hours, label }` returns `{ plate, pass, expiresAt }`
- `GET /api/share?pass=…` returns `{ vehicle: { plate, status, time, lat, lng, speed, course }, expiresAt, label }`
- Status values from the tracker:
  - `online` = moving
  - `engine` = engine on, standing
  - `ack` = parked / reporting
  - `offline` = no signal
- Tracker responses are cached for 20 seconds so the tracker isn't overloaded.
- A wrong password takes about 0.6 s to answer, so passwords can't be guessed quickly.
- Passes are signed with `SHARE_SECRET` (HMAC-SHA256), so they can't be forged or edited.
