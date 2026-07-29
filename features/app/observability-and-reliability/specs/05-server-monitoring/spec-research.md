# Spec 05 — External uptime monitoring for the Railway ping server

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

`server/index.ts:37-41` exposes `GET /health` returning `{ok: true, tokenCount}` — but nothing polls it. The Railway-hosted server's entire job (per `hourglassws/CLAUDE.md` quick reference: "sends silent pushes every 30 min via cron") is invisible infrastructure to the end user — if the cron stops firing (Railway free-tier sleep/restart, an unhandled exception in `startCron()`, a deploy that breaks the cron registration), the only symptom is users silently not getting their deadline reminders, which is exactly the class of bug the `project_notification_barrage` and `project_empty_body_parse_bug` memories show already happened once before (silently, discovered only after user complaints).

## Exploration findings

- `server/index.ts` starts the cron via `startCron()` (from `./cron`) only inside the `require.main === module` guard — i.e. only when run as the actual server process, correctly excluded from test imports. Need to read `server/cron.ts` in full during spec-writing to confirm what it logs today (likely just `console.log`, which Railway captures in its own log viewer but nobody actively watches).
- `/health` returns `tokenCount` but no cron-specific health signal (e.g. "last successful cron run timestamp") — an external uptime checker hitting `/health` only proves the Express process is alive, NOT that the cron job itself is still firing on schedule. This is a meaningful gap: the process can be up while the cron silently stopped.
- Free-tier external uptime monitors (e.g. UptimeRobot, Better Uptime, Healthchecks.io) can poll a URL on an interval and alert (email/push) on failure — this is an external SaaS signup, not something this spec's code can provision automatically. The user needs to actually create the monitor account and point it at the Railway `/health` URL themselves; I can only prepare the endpoint and hand off instructions, similar to how the Unlisted App Distribution plan hands off the Apple web-form submission to the user.
- Consider whether `/health` should be enriched with a "last cron run" timestamp so the monitor can distinguish "process alive, cron dead" from "everything fine" — this requires `cron.ts` to record its own last-run time somewhere the `/health` handler can read (e.g. a module-level variable or a `better-sqlite3` row, since that dependency already exists).

## Key decisions

**1. Enrich `/health` with cron heartbeat data, not just process-alive data.** Add a `lastCronRunAt` (or similar) field, updated by the cron job itself on each successful run. An external monitor checking `/health` can then be configured (via the monitor's own JSON-path assertion feature, if supported, or via a stricter secondary endpoint) to alert if `lastCronRunAt` is older than the expected interval (30 min + buffer), not just if the HTTP call itself fails.

**2. Simplest correct implementation: in-memory variable in `server/cron.ts`, updated each run, read by the `/health` handler.** No new persistence needed — `better-sqlite3` is already a dependency for tokens, but a cron heartbeat doesn't need to survive a server restart (a restart resets the clock anyway, and the monitor would catch a restart-loop through repeated `/health` calls returning a stale-then-reset timestamp pattern).

**3. External monitor setup is a user hand-off, not automatable code.** This spec produces: (a) the enriched `/health` endpoint, (b) exact setup instructions for a specific free-tier service (recommend Healthchecks.io or UptimeRobot — decide which during spec-writing based on whether a "check response JSON field" feature is needed or a simple "did this respond 200" check is sufccient) for the user to action themselves.

**4. No in-app surfacing of server health.** This is developer/ops-facing monitoring, not a user-facing feature — no new UI in the app itself.

## Interface contracts

```typescript
// server/cron.ts — add heartbeat tracking
let lastCronRunAt: string | null = null;
export function getLastCronRunAt(): string | null { return lastCronRunAt; }
// inside the cron callback, after a successful run:
lastCronRunAt = new Date().toISOString();

// server/index.ts — enrich /health
app.get('/health', (_req: Request, res: Response) => {
  const tokenCount = getTokenCount();
  res.json({ ok: true, tokenCount, lastCronRunAt: getLastCronRunAt() });
});
```

## Test plan

- [ ] `/health` response includes `lastCronRunAt` field (null before first cron run, an ISO timestamp after).
- [ ] `getLastCronRunAt()` updates after a simulated successful cron execution (mock the cron callback invocation directly, don't wait a real 30 minutes).
- [ ] `/health` still returns `ok: true` and `tokenCount` unchanged (no regression to existing consumers, if any exist — check if the app itself ever calls `/health`, or if it's purely ops-facing).
- [ ] Existing `server/__tests__/` suite (if a health-route test exists) still passes.

## Files to reference

| File | Why |
|---|---|
| `server/index.ts:37-41` | The `/health` route to enrich. |
| `server/cron.ts` | Needs reading in full — where the heartbeat variable is set. |
| `server/package.json` | Confirms `node-cron`, `better-sqlite3` already present — no new dependency needed for the in-memory approach. |
| `server/__tests__/` | Existing test patterns for the Express app. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | `/health` route + heartbeat update tests (server-side, via `supertest` or similar if already used in `server/__tests__/`) |
| Live-QA probe | ✗ | Not a Crossover API endpoint |
| TestFlight | ✗ | Server-side change, not app-side — no TestFlight relevance |
| Error log | ✗ | This is server-side; the on-device `log.ts` doesn't apply. Ops visibility comes from the external monitor itself, not the app's debug log. |
