# Hourglass — Expo iOS App

This is the **active product**. The Scriptable widgets at the repo root (`../hourglass.js`, `../worksmart.js`, `../crossover-widget.js`) are deprecated and not installed on the user's device — ignore them unless explicitly asked.

## Read this first

**Before touching any cross-cutting code, read `docs/ARCHITECTURE.md`.** It is the map of how the app fits together (notifications, push pipeline, state stores, routes, modules, widget contract) with file:line citations throughout. It exists so you don't have to re-do code archaeology every time you investigate a bug.

## Routing — where to read before you change things

| If you are changing… | Read | Then run tests in |
|---|---|---|
| Anything notification-related | `docs/ARCHITECTURE.md` §1 + §8.1–8.4 | `src/hooks/__tests__/useScheduledNotifications.test.ts`, `src/__tests__/notifications/handler.test.ts`, `app/__tests__/layout-notifications.test.tsx` |
| Silent push / Railway server / background refresh | `docs/ARCHITECTURE.md` §2 | `server/__tests__/`, `src/__tests__/notifications/handler.test.ts` |
| Anything persisted (SecureStore, AsyncStorage, Query cache) | `docs/ARCHITECTURE.md` §3 + §8.8 | `src/__tests__/lib/` |
| Approve/reject flow, manager queue | `docs/ARCHITECTURE.md` §4.1 + §5.6 + §8.1 | `src/hooks/__tests__/` (approval-related), `src/__tests__/` |
| Screens or navigation | `docs/ARCHITECTURE.md` §5 | `app/__tests__/`, `app/(tabs)/__tests__/` |
| Auth / onboarding | `docs/ARCHITECTURE.md` §5.5 + §3.1 + §3.4 | `src/__tests__/` (auth-related) |
| Widget (data shape, iOS layout, timeline) | `docs/ARCHITECTURE.md` §7 | `src/widgets/__tests__/` |
| Module structure / where files belong | `docs/ARCHITECTURE.md` §6 | n/a (convention-only — verify imports follow the layering diagram in §6.6) |

If your change spans rows, read every affected row and run every affected test directory.

## The no-break process — three-step ritual

Before changing cross-cutting code:

1. **Read** the matching `docs/ARCHITECTURE.md` section (see routing table above).
2. **Establish baseline.** Run the tests for the affected area. Confirm they pass (or, if not, note which were already failing before your change).
3. **Re-run after the change.** Run the same tests + the tests for any adjacent layer your change touches (use the layering diagram in §6.6).

If a test that was green before your change is now red, **stop and diagnose** — do not skip, mock-around, or delete the failing test.

## Hard rules

### Active app boundary
Work only inside `hourglassws/`. The repo root contains deprecated Scriptable widgets that are no longer installed; do not edit them unless the user explicitly asks.

### Debugging escalation rule
**If the same area of code breaks twice in a row** (a fix introduces a regression, or a second fix is needed right after the first), **stop immediately and say:**

> "This has broken twice — let me do a proper research run to understand the system before touching it again."

Then run `/research` on the affected area using `model: "opus"` for the Explore agent. Do NOT attempt a third targeted fix without first completing a full analysis. (Inherited from the repo root CLAUDE.md.)

### API Documentation Rule
Every time you discover, test, or use a Crossover API endpoint, document it in the memory `MEMORY.md` under "Key API Endpoints" — full URL, method, body shape, response shape, ID mapping, gotchas. Never assume an endpoint path. Check MEMORY.md first; if not documented, search `src/api/` for prior discovery.

### Module layering (convention)
See `docs/ARCHITECTURE.md` §6.6. Summary:

```
app/ (screens)
  ↓ may import from
src/contexts/, src/hooks/
  ↓ may import from
src/api/, src/store/, src/lib/
  ↓ may import from
src/types/
```

Lower layers must not import from higher layers. `src/lib/*` is pure and may not import from `src/api/`, `src/store/`, or anything stateful. This is not enforced by lint yet (see TODO below); rely on review.

### Comments
Default to writing no comments. The exception is exported functions in `src/api/`, `src/hooks/`, `src/lib/` which **should** have a 2–3 line JSDoc describing what they return, side effects, and caching behavior. Internal helpers stay unannotated. Don't explain *what* — well-named identifiers do that. Comment when the *why* is non-obvious (a constraint, an invariant, a workaround).

## Project quick reference

- **Framework:** Expo SDK 54, React Native 0.81.5, Expo Router, TanStack Query v5
- **iOS widgets:** `expo-widgets` (JSX → SwiftUI)
- **Android widgets:** `react-native-android-widget`
- **Credentials:** `expo-secure-store` (encrypted, on-device only)
- **Config:** AsyncStorage JSON
- **Backend:** Crossover API (prod `api.crossover.com`, QA `api-qa.crossover.com`)
- **Push refresh:** Railway-hosted server (`server/`) sends silent pushes every 30 min via cron

## QA credentials (for local testing)

- URL: `app-qa.crossover.com`
- Username: `user_765054@example.com`
- Password: `test123`
- Role: Manager
- Stored locally in `.env.local` (gitignored)

## Open TODOs for engineering hygiene

- Layering rules (above) are convention-only. Adding `eslint-plugin-boundaries` would catch violations at PR time. Not done yet.
- JSDoc coverage on `src/api/`, `src/hooks/`, `src/lib/` exports is partial — being filled in incrementally.
