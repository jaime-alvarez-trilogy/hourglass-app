# Spec Research: Honest CI — Typecheck, Lint, Green Tests

**Date:** 2026-10-19
**Author:** @jaime-alvarez-trilogy
**Spec:** `07-ci-typecheck-lint`

---

## Problem Context

CI (`.github/workflows/test.yml`) runs only `npm test`. There's no `typecheck` script, and `lint` exists but is never run. Audit baseline: 526 TS errors, 9 ESLint errors, `npm test` 4875 pass / 1 fail locally.

- The local failure is `__tests__/components/NativeWindSmoke.test.tsx:202`, which reads `$HOME/.claude/.../MEMORY.md`, a file outside the repo. It's green in CI and red locally, which trains everyone to ignore red.
- **Real bug:** `src/lib/log.ts:184` calls `Buffer.byteLength`. Hermes has no global `Buffer`, and `buffer` isn't a dependency. The throw is swallowed by the try/catch at `log.ts:111-115`, so the debug log never rotates and grows past its 200 KB cap. Tests pass only because jest uses the `jest-expo/node` preset. This is JS-only, so it can go in build 18 or OTA.
- 413 of the 526 TS errors come from `tsconfig.json` `"types": ["jest"]`, which suppresses `@types/node`.

## Exploration Findings

### Key Files

| File | Relevance |
|------|-----------|
| `src/lib/log.ts:184` (+ `:111-115`) | Buffer bug |
| `src/components/NativeWindSmoke.tsx`, `__tests__/components/NativeWindSmoke.test.tsx` | Zero imports; self-described "TEMPORARY" component. Delete both |
| `tsconfig.json:5` | `types` |
| `src/components/**` | ~15 `JSX.Element` → `React.JSX.Element` (React 19) |
| `src/hooks/useRoleRefresh.ts:47-53` | 7 strict-null errors |
| `app/_layout.tsx:49` | Notification handler return type vs `NotificationBehavior` (SDK 55 drift; review, don't cast) |
| `app/(tabs)/_layout.tsx:131` | `contentStyle` isn't a valid `BottomTabNavigationOptions` key, so the style is likely ignored at runtime |
| `eslint.config.js` | Lint config |
| `.github/workflows/test.yml` | Add gates |

## Key Decisions

### Decision 1: Order of work

**Chosen:** FR1 Buffer fix (with a test that fails without it) → FR2 delete the smoke test → FR3 tsconfig + `@types/node` → FR4 production TS errors → FR5 test-file TS errors → FR6 lint errors → FR7 CI gates. The gates come last so CI is never red on day one.

### Decision 2: Test-file TS errors

**Options:** fix them all; exclude `__tests__` from typecheck.
**Chosen:** Fix them, but a typed `// @ts-expect-error` with a reason is allowed for deliberate bad-input tests. `any` casts are allowed only in test files. If the remaining test-file count after FR3/FR4 exceeds ~60, split FR5 into a follow-up spec and temporarily use `tsconfig.typecheck.json` excluding `**/__tests__/**`. Record the decision in the checklist.

### Decision 3: `app/(tabs)/_layout.tsx:131`

**Chosen:** Determine at runtime (Expo Go) whether the style applies. If it doesn't, move it to the correct option (`sceneStyle` in react-navigation 7) and visually confirm on the tab background. That's a visible change, so take before/after screenshots.

## Interface Contracts

| Item | Contract |
|------|----------|
| `log.ts` byte length | `utf8ByteLength(s: string): number` = `new TextEncoder().encode(s).length` (private helper) |
| `package.json` scripts | `"typecheck": "tsc --noEmit"`; `lint` unchanged (`expo lint`) |
| `devDependencies` | `@types/node` added |
| `tsconfig.json` | `"types": ["jest", "node"]` |
| `test.yml` `app-tests` | steps: `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` |
| Exit codes | all three return 0 locally and in CI |

## Test Plan

### log rotation (`src/lib/__tests__/log.test.ts`, extend)
- **Regression:** with `global.Buffer` deleted for the test (`const B = global.Buffer; delete global.Buffer; … finally restore`), writing past 200 KB rotates the log to ≤ TARGET_BYTES. This fails on current code and passes after the fix.
- Multi-byte input (emoji, "ñ") is counted in bytes, not chars: a 1-char emoji counts 4.
- Empty log: no throw, no rotation.

### Suite health
- `npm test` passes with 0 failures locally (smoke test deleted), and the pass count drops only by the deleted tests.
- `npm run typecheck` exits 0.
- `npm run lint` exits 0 errors (warnings allowed).

### Behavioural checks for the two drift fixes
- `app/_layout.tsx` notification handler: the existing `app/__tests__/layout-notifications.test.tsx` stays green. The handler returns `shouldShowBanner`/`shouldShowList` (SDK 55 shape) instead of the deprecated `shouldShowAlert`, if that's the drift.
- Tabs `sceneStyle`: `app/(tabs)/__tests__/native-tabs.test.tsx` stays green, plus the manual screenshot.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/log.ts` | modify | TextEncoder |
| `src/lib/__tests__/log.test.ts` | modify | No-Buffer regression |
| `src/components/NativeWindSmoke.tsx` + test | delete | Out-of-repo dependency |
| `tsconfig.json`, `package.json` | modify | types, script, @types/node |
| `src/components/**`, `src/hooks/useRoleRefresh.ts`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, others | modify | Type/lint fixes |
| `.github/workflows/test.yml` | modify | Gates |

## Edge Cases to Handle

1. **`TextEncoder` availability.** Hermes in RN 0.83 provides it; jest node does too. No polyfill needed.
2. **Merge conflicts with specs 02/03.** This spec touches many files. Land 01–05 first, or rebase this one last before build 18. It's independent of the release.

## Open Questions

None remaining.
