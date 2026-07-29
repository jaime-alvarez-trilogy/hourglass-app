# Spec 03 — Silent catch-block audit

**Status:** Research complete
**Complexity:** M
**Blocks:** — (consumes 01)
**Blocked By:** 01 (log-callsite-wiring — establishes the `log.*` convention this audit routes new logging through)

## Problem context

Repo-wide grep (excluding `__tests__` and `node_modules`) finds **102** `} catch` occurrences across `src/`, `app/`, `server/`. Some fraction of these swallow failures with no logging, no rethrow, and no comment explaining why — meaning a real failure there is invisible both to the user and to the debug log spec 08/01 built. This is exactly the systemic pattern the resilience-fixes investigation flagged: the original Thursday-notification-barrage bug (`project_notification_barrage` memory) was invisible for a long time precisely because nothing observed the failure path.

This spec is an **audit and fix**, not a rewrite: most of these 102 are probably fine (either genuinely best-effort cleanup where silence is correct, or already logged). The job is triage, not blanket instrumentation.

## Exploration findings

Representative sample from the grep (not exhaustive — full audit happens during implementation):

- `src/hooks/useScheduledNotifications.ts` — 6 bare `catch {}` blocks (lines 88, 135, 170, 191, 254, 265) — notification scheduling is exactly the area with prior incident history (`project_notification_barrage`). High-priority audit target.
- `src/lib/scheduleLock.ts` — 6 catch blocks (58, 72, 81, 100, 110, 118) — lock/orphan-sweep mechanism; same file spec 01 is already wiring `log.*` into, so spec 01's own PR will likely resolve most of these — spec 03's job here is verifying spec 01's coverage was complete, not re-doing it.
- `src/api/client.ts` — 4 catch blocks (42, 53, 160, 227) — same overlap with spec 01.
- `src/hooks/useAIData.ts` (152, 332, 336), `src/hooks/useApprovalItems.ts` (155, 198), `src/hooks/useEarningsHistory.ts` (88, 114), `src/hooks/usePaymentHistory.ts` (79), `src/hooks/useRoleRefresh.ts` (62), `src/lib/aiAppBreakdown.ts` (128), `src/lib/weeklyHistory.ts` (121), `src/hooks/useHistoryBackfill.ts` (183), `src/hooks/useHoursData.ts` (45) — data-fetching/aggregation hooks not covered by spec 01's scope at all. These are the actual net-new audit territory: likely candidates for "swallows a fetch failure and silently shows stale/zero data with no signal anywhere."
- `app/modal.tsx:143` — `console.error('[settings] toggleDevOvertimePreview failed:', e)` — logs to console (invisible in production) but not to the `log` module. A pattern worth checking for elsewhere too: `console.error` calls that should be `log.error` calls now that the logger exists.
- `server/` catch blocks — the on-device `log.ts` module doesn't apply server-side (it's an Expo/RN module); server-side silent catches should be fixed with `console.error`/`console.warn` (visible in Railway's log viewer) or left silent only if genuinely inconsequential — a separate, lighter-weight bar than the client-side audit.

## Key decisions

**1. Triage every catch block into one of three buckets**, per FEATURE.md's own out-of-scope note ("no new retry logic, just visibility"):
   - **(a) Already handled** — logs via `log.*`, rethrows, or is spec 01's territory (skip, verified not duplicated).
   - **(b) Needs a log call** — silently swallows a failure that would be useful to see in a bug report (e.g. a hook's data fetch failing silently, leaving stale UI with no trace).
   - **(c) Intentionally silent, needs a comment** — genuine best-effort cleanup (e.g. a non-critical AsyncStorage write, a cache warm that's allowed to fail) where adding a log would be noise. Add a one-line comment stating why (`// best-effort: cache write failure doesn't affect correctness`), so the next person doesn't have to re-derive the reasoning.

**2. Also grep for `console.error`/`console.warn` calls in `src/`/`app/` (client-side) and flag them for conversion to `log.*`** — a `console.*` call in production RN is invisible to both the developer and any debug-log export; this is the same silent-failure pattern wearing a different disguise. `app/modal.tsx:143` is one instance found already; the audit should find all of them.

**3. Server-side (`server/`) catch blocks get a lighter bar**: `console.error`/`console.warn` is sufficient there (Railway captures stdout/stderr in its log viewer, which is actually monitored via spec 05's health-check work) — no `log.*` module applies server-side.

**4. No behavior changes beyond adding logging/comments** — this spec explicitly does not add retries, does not change error-handling control flow, per FEATURE.md's out-of-scope table.

## Interface contracts

No new types. This spec is a triage pass producing many small diffs of the shape:

```typescript
// before
} catch {
  return null;
}

// after (bucket b — needs visibility)
} catch (err) {
  log.warn('hours.fetch_failed', {});
  return null;
}

// after (bucket c — intentional, now documented)
} catch {
  // best-effort: cache write failure doesn't affect correctness, only freshness
}
```

## Test plan

- [ ] Full enumeration of all ~102 catch blocks (spreadsheet/checklist, not necessarily all requiring a code test) with bucket assignment (a/b/c) — this itself is a checklist deliverable, not a Jest test.
- [ ] For every bucket-(b) site: a test asserting `log.*` fires on the failure path with appropriate category/meta (no PII).
- [ ] For every bucket-(c) site: a lint-style manual check that a comment exists (not automatable as a Jest assertion — reviewed in Phase X.2).
- [ ] `console.error`/`console.warn` call sites in `src/`/`app/` are converted to `log.error`/`log.warn` (or justified as staying `console.*` if there's a reason, e.g. a dev-only debug branch) — enumerate and fix each.
- [ ] No regression: existing passing tests for all touched hooks/files still pass (this spec touches many files, high regression-surface — run full `src/hooks/__tests__/` and `src/__tests__/` suites, not just new tests).

## Files to reference

| File | Why |
|---|---|
| Full grep output of `} catch` across `src/`, `app/`, `server/` (excl. tests) | The enumeration base — 102 sites, re-run fresh at implementation time since spec 01 will have already changed some of these. |
| `features/app/observability-and-reliability/specs/01-log-callsite-wiring/spec-research.md` | The `log.*` convention this audit routes new calls through — read spec 01's actual landed diff before starting, to avoid duplicating its work. |
| `src/hooks/useScheduledNotifications.ts`, `src/lib/scheduleLock.ts` | Highest-priority audit targets given prior incident history. |
| `app/modal.tsx:143` | Known `console.error` → `log.error` conversion candidate. |
| `memory/project_notification_barrage.md`, `memory/project_empty_body_parse_bug.md` | Prior incidents that were invisible due to exactly this pattern — motivating context for prioritization order. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Per-site log-call assertions; full regression run across `src/hooks/__tests__/`, `src/__tests__/` |
| Live-QA probe | ✗ | No new API surface |
| TestFlight | ✓ | Force a few representative failures (network off during a data hook's fetch, etc.) and confirm the debug log captures them where expected |
| Error log | ✓ | Direct self-verification — the log file should show new entries for previously-silent failure paths |
