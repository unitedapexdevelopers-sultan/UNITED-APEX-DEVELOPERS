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

1. **Database**: create a Postgres instance (Supabase, Neon, or Vercel Postgres all work) and copy its connection string.
2. **Vercel project**: import this repo, set the project root to `ledger/`.
3. **Environment variables** (Vercel project settings):
   - `DATABASE_URL` — the hosted Postgres connection string
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`
   - `NEXTAUTH_URL` — the deployed URL (e.g. `https://your-app.vercel.app`)
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` — only needed transiently to run the seed step
4. **Push the schema**: run `DATABASE_URL=... npx prisma db push` from your machine (or a one-off Vercel deploy hook) against the hosted database.
5. **Seed the owner account**: run `DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed` once. After that you can remove `ADMIN_EMAIL`/`ADMIN_PASSWORD` from the Vercel env — they're only read by the seed script, not the app itself.
6. Deploy. The app is private: every route except `/login` and `/api/auth/*` requires a signed-in session (`src/middleware.ts`), so the Vercel URL is safe to be "unlisted but not secret" — though you may still want to disable search indexing (already set via `robots: noindex` in `src/app/layout.tsx`) and treat the URL as private.

To add a second user later, insert another row into `users` (e.g. via a small script using the same bcrypt hashing as `prisma/seed.ts`) — every table already scopes by `userId`.
