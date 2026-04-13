# muellerauth integration — TODO

ForeverTale hasn't yet been integrated with the household muellerauth
service because the app isn't running on this box yet. Integration
should happen after the service itself is up.

## Pre-integration work

1. **Rip out (or stub) Firebase Admin.** `server/` currently depends
   on Firebase for user auth; muellerauth replaces that. Either:
   - Remove `firebase-admin` and any `verifyIdToken` call sites, or
   - Gate Firebase behind a `AUTH_PROVIDER=firebase|muellerauth` env
     flag if you want a fallback.

2. **Prisma database.** `.env` (pulled from the original zip) points
   at a DB. Confirm that DB exists on local Postgres (or create a new
   one — `forevertale` owned by `forevertale`) and run
   `npm run db:push` (or `db:migrate` if migrations are intended).

3. **systemd unit.** Mirror `/etc/systemd/system/kidchatter.service`
   but pointing at `/home/jake/projects/ForeverTale/server`, port
   `3003`, and with the built client served from `client/dist`.
   Decide: serve `client/dist` from the Express server, or from Caddy
   with `/api/*` + `/ws` proxied to Express. I'd lean on Caddy doing
   the static serving — one less responsibility for the Node process.

4. **Caddy.** Uncomment the `forevertale.themuellerhouse.com` block in
   `/etc/caddy/Caddyfile` (port 3003). Add a Cloudflare DNS record
   (gray-cloud) if one doesn't exist yet.

## Integration pattern

Once the service is running, follow
[`muellerauth/INTEGRATION.md`](../muellerauth/INTEGRATION.md). The
Express version is simpler than Next.js — a single `GET
/api/auth/muellerauth-callback` handler that reads the cookie,
forwards to `/session`, upserts a local user, sets an express-session
cookie, redirects onward.

## Test

Add a Playwright spec mirroring `KidChatter/tests/muellerauth-login.spec.ts`
against `https://forevertale.themuellerhouse.com`.
