# Ledger

Private finance, trading, and Zakat tracker. Next.js (App Router) + Postgres (Prisma) + NextAuth, ported from the `analytic-tracker-erp.jsx` prototype with the same modules and business logic, now backed by a real database and real auth instead of artifact key-value storage.

## Modules

Dashboard · Wallets · Expenses · Trading & PnL · Businesses (with nested sub-divisions) · Zakat calculator.

Business logic (trade PnL, recursive business net-profit rollup, Zakat eligible wealth/due) lives in `src/lib/calc.ts` and is unit-portable — same formulas as the prototype.

## Local development

1. `npm install`
2. Create a Postgres database and set `DATABASE_URL` in `.env` (copy `.env.example`).
3. `npx prisma db push` to create the schema.
4. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`, then `npm run seed` to create the owner account.
5. Set `NEXTAUTH_SECRET` (`openssl rand -base64 32`) and `NEXTAUTH_URL=http://localhost:3000`.
6. `npm run dev`, sign in at `/login`.

## Deploying (Vercel + a hosted Postgres)

The `build` script runs `prisma db push` before `next build`, so the schema syncs itself on every deploy — no separate migration step needed. Seeding the owner account is a one-time authenticated HTTP call instead of a script that needs direct DB access, since some environments (this one included) can't open raw TCP connections to Postgres.

1. **Database**: create a Postgres instance (Supabase, Neon, or Vercel Postgres) and copy its connection string. On Supabase specifically, use the **pooler** connection string (Project Settings → Database → Connection string → "Transaction pooler" or "Session pooler"), not the direct `db.<ref>.supabase.co` one — the direct host is IPv6-only unless you pay for their IPv4 add-on, which breaks most serverless/CI environments including plain `prisma db push` from a laptop without IPv6.
2. **Vercel project**: at vercel.com, "Add New… → Project", import `unitedapexdevelopers-sultan/united-apex-developers`, set **Root Directory** to `ledger`.
3. **Environment variables** (Vercel project settings → Environment Variables, scope: Production):
   - `DATABASE_URL` — the pooler connection string from step 1
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `NEXTAUTH_URL` — the deployed URL Vercel assigns (e.g. `https://ledger-xyz.vercel.app`) — you can fill this in after the first deploy and redeploy once
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the login you want
   - `SETUP_TOKEN` — any random string (e.g. `openssl rand -hex 16`), used once to authorize the bootstrap call below
4. **Deploy**. The build pushes the schema automatically.
5. **Create the owner account**: visit `https://<your-deployed-url>/api/setup?token=<SETUP_TOKEN>` once in a browser. It creates the user from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and returns `{"ok":true}`.
6. **Remove the bootstrap route**: delete `src/app/api/setup/route.ts`, remove its exclusion from `src/middleware.ts`'s matcher, and delete `SETUP_TOKEN`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` from the Vercel env, then redeploy. It's a one-time-use door — don't leave it open.
7. Sign in at `/login`. Every other route requires a session (`src/middleware.ts`), and the page is set to `noindex` — treat the URL as private (unlisted, not secret).

To add a second user later, insert another row into `users` (e.g. temporarily restore the setup route with a different email, or write a small one-off script using the same bcrypt hashing) — every table already scopes by `userId`.
