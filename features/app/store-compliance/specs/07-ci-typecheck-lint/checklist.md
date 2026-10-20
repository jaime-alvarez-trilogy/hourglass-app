# Implementation Checklist

Spec: `07-ci-typecheck-lint`
Feature: `store-compliance`

Two PRs are recommended (see spec → Release & Merge Order):
- **PR A:** FR1 + FR2. Can merge early.
- **PR B:** FR3–FR8. Rebase on top of specs 01–04, then merge before spec 05 cuts the build-18 binary. FR3's `package.json` `scripts` edit is a fingerprint source.

---

## Phase 1.0: Test Foundation

### Pre-flight (record the numbers in Session Notes)
- [ ] Read `docs/ARCHITECTURE.md` §1, §5 and §8.1–8.4. The app `CLAUDE.md` routing table requires this for notification and navigation changes.
- [ ] On the PR's base commit (after rebasing PR B onto 01–04), record:
  - [ ] `npx tsc --noEmit 2>&1 | grep -c "error TS"` (526 expected at `b6b79b7`; more is possible if 02–04 added code)
  - [ ] `npx tsc --noEmit --types jest,node 2>&1 | grep -c "error TS"` (113 expected at `b6b79b7`)
  - [ ] `npx expo lint --no-cache 2>&1 | tail -3` (9 errors / 494 warnings expected at `b6b79b7`)
  - [ ] The test count of each FR6 file (`npx jest <file> 2>&1 | grep Tests:`), for the 19 files in the spec's FR6 table
- [ ] If the new counts differ from the spec's catalog (from code added by 02–04), list the new errors in Session Notes and treat them under the same FR rules.

### FR1: Hermes-safe log rotation
- [ ] Switch `__mocks__/expo-file-system/index.ts` lines 30 and 58 to `new TextEncoder().encode(content).length`. This is test infrastructure, and it must land first so the regression test isolates `log.ts`.
- [ ] Add `describe('logger — no-Buffer runtime (Hermes parity)')` to `src/lib/__tests__/log.test.ts`:
  - A `withoutBuffer(fn)` helper saves and deletes `globalThis.Buffer`, awaits `fn` (log calls only), and restores in `finally`.
  - Assertions run **after** it returns, using a `TextEncoder`-based byte helper.
  - `afterEach` restores `Buffer` as a safety net.
- [ ] Test: regression. `__setRotationLimits(500, 300)`, log 20 events, `flush()`. Assert UTF-8 size ≤ 300, content starts with `{`, and the first line's `meta.i` > 0.
- [ ] Test: multi-byte. Seed `LOG_URI` via `_setFile` with JSON lines whose `category` mixes emoji and `ñ`. **Assert the precondition** that UTF-16 `.length` counting would keep > TARGET bytes. Then log 1 event and flush. Assert UTF-8 size ≤ TARGET and that the last line is the new event.
- [ ] Test: empty log. `_setFile(LOG_URI, '')`, log 1 event. `flush()` resolves, `readAsStringAsync` isn't called, and the content is exactly one line.
- [ ] Run `npx jest src/lib/__tests__/log.test.ts`. The regression and multi-byte tests **fail** (red); the other 26 pass.

### FR2: Remove the out-of-repo smoke test
- [ ] Create `__tests__/ci-gates.test.ts` (static `fs` reads; no new dependencies).
- [ ] FR2 case: `src/components/NativeWindSmoke.tsx` and `__tests__/components/NativeWindSmoke.test.tsx` don't exist.
- [ ] FR2 case: walk `__tests__/`, `src/`, `app/`, `components/`, `hooks/` and `__mocks__/` (skip `node_modules`). No `*.ts`/`*.tsx` test or mock source contains `process.env.HOME`, `os.homedir(` or `/.claude/`. Build the patterns dynamically, or skip `ci-gates.test.ts`, so the guard doesn't match itself.
- [ ] Confirm both FR2 cases are red.

### FR3: Typecheck foundation
- [ ] `ci-gates.test.ts` FR3 cases:
  - `package.json` `scripts.typecheck === 'tsc --noEmit'`
  - `scripts.lint === 'expo lint'`
  - `devDependencies['@types/node']` is defined
  - `tsconfig.json` `compilerOptions.types` contains `'jest'` and `'node'`
- [ ] Confirm they're red (except `lint`).

### FR4: Mechanical production type fixes
- [ ] Create `hooks/__tests__/use-theme-color.test.ts` with `jest.mock('@/hooks/use-color-scheme')`:
  - `'unspecified'` returns `Colors.light.text`
  - `'dark'` returns `Colors.dark.text`
  - `{ light: '#123' }` under `'unspecified'` returns `'#123'`
- [ ] Confirm the `'unspecified'` cases are red (they throw on current code).

### FR5: Behavioural-surface production fixes
- [ ] `app/__tests__/layout-notifications.test.tsx` FR1.5: assert `shouldShowBanner === true`, `shouldShowList === true` and `shouldShowAlert === undefined`. Keep FR1.6 and FR1.7. Confirm FR1.5 is red.
- [ ] `__tests__/use-role-refresh.test.ts`: add cases for a detail with no `assignment`, an `assignment` with no `team`, and no `avatarTypes`.
  - [ ] Each resolves.
  - [ ] `saveConfig` isn't called.
  - [ ] `invalidateQueries` isn't called.
  - [ ] These are **characterization** tests: they're expected green before the fix. Note this for the validator.
- [ ] `app/(tabs)/__tests__/native-tabs.test.tsx`: rewrite the "02-platform-split-nav — FR3" block.
  - [ ] Android `<Tabs screenOptions>` has no `contentStyle`/`sceneStyle` key.
  - [ ] Each of `app/(tabs)/{index,overview,ai,approvals}.tsx` has a scroll `paddingBottom` ≥ 100.
  - [ ] Keep SC3.3/SC3.4.
  - [ ] Confirm the first case is red.
- [ ] `src/components/__tests__/AIConeChart.test.tsx`: rewrite SC12.9–SC12.11.
  - [ ] `<GestureDetector` has no `enabled=` prop.
  - [ ] The `useScrubGesture({…})` call passes `enabled: size === 'full'`.
  - [ ] There are at least 2 `if (!animDone) return;` guards.
  - [ ] Confirm the first case is red.

### FR6: Test and mock type errors
- [ ] No new test cases. Per-file test-count baselines are recorded in Pre-flight.

### FR7: Lint
- [ ] `ci-gates.test.ts` FR7 case: `eslint.config.js` source contains `no-restricted-globals` and `Buffer`. Confirm it's red.

### FR8: CI gates
- [ ] `ci-gates.test.ts` FR8 cases:
  - The `app-tests:` block exists.
  - Within it, `npm ci` < `npm run typecheck` < `npm run lint` < `npm test` by index.
  - The `server-tests:` block still contains `working-directory: server`.
- [ ] Confirm they're red.

---

## Test Design Validation (MANDATORY)

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

- [ ] Run `red-phase-test-validator` agent
- [ ] All FR success criteria have test coverage. Items covered by commands instead (FR4/FR6 typecheck, FR7 probes, FR8 CI) are listed in Phase 1.1.
- [ ] Assertions are specific (not just "exists" or "doesn't throw")
- [ ] The multi-byte test asserts its own non-vacuity precondition
- [ ] The FR5b characterization tests are flagged as expected-green (not a red-phase failure)
- [ ] Mocks return realistic data matching interface contracts (`DetailResponse` partials, `NotificationBehavior` shape)
- [ ] Fix any issues identified before proceeding

---

## Phase 1.1: Implementation

### FR1: Hermes-safe log rotation (PR A)
- [ ] Add the private `utf8ByteLength(s: string): number` to `src/lib/log.ts`: lazy or memoized `TextEncoder`, **no module-scope construction**, not exported.
- [ ] Replace line 184 with `utf8ByteLength(lines[i]) + 1`. Change nothing else in `rotateIfNeeded`.
- [ ] `grep -nw "Buffer" src/lib/log.ts __mocks__/expo-file-system/index.ts` returns nothing.
- [ ] `npx jest src/lib/__tests__/log.test.ts` shows 28/28 green.
- [ ] Commit: `fix(07-ci-typecheck-lint): FR1 Hermes-safe log rotation via TextEncoder`

### FR2: Remove the out-of-repo smoke test (PR A)
- [ ] `git rm src/components/NativeWindSmoke.tsx __tests__/components/NativeWindSmoke.test.tsx`
- [ ] `grep -rn "NativeWindSmoke" app src components hooks __tests__` matches only the comment in `src/components/__tests__/colors.test.ts`.
- [ ] `npx jest __tests__/ci-gates.test.ts -t FR2` is green.
- [ ] Commit: `chore(07-ci-typecheck-lint): FR2 delete NativeWindSmoke and out-of-repo test`

### FR3: Typecheck foundation (PR B)
- [ ] `npm install --save-dev @types/node@25.3.5`
- [ ] `git diff package-lock.json` adds only the root devDependency. `node_modules/@types/node` stays at `25.3.5`.
- [ ] `tsconfig.json`: `"types": ["jest", "node"]`, nothing else.
- [ ] `package.json`: add `"typecheck": "tsc --noEmit"`.
- [ ] `npm run typecheck 2>&1 | grep -c "error TS"` returns **112** (or the re-measured equivalent recorded in Pre-flight). No TS2307 `fs`/`path`, TS2304 `__dirname`/`global` or TS2591 remain.
- [ ] The `ci-gates.test.ts` FR3 cases are green.
- [ ] Commit: `build(07-ci-typecheck-lint): FR3 node types and typecheck script`

### FR4: Mechanical production type fixes (PR B)
- [ ] 14 files in `src/components/`: `JSX.Element` → `React.JSX.Element`.
- [ ] `SkeletonLoader.tsx`: `width?: DimensionValue`.
- [ ] `AIRingChart.tsx:59`: `(timingChartFill.duration ?? 0) + animDelay`.
- [ ] `FloatingPillTabBar.tsx:133`: `(badge ?? 0) > 0`.
- [ ] `components/parallax-scroll-view.tsx` and `hooks/use-theme-color.ts`: `scheme === 'dark' ? 'dark' : 'light'`.
- [ ] `components/ui/icon-symbol.tsx`: `MAPPING … as const satisfies Record<string, MaterialIconName>`. `IconSymbolName = keyof typeof MAPPING`.
- [ ] No `any`, `as unknown as`, `@ts-ignore` or `@ts-expect-error` in these production files (check with `git diff`).
- [ ] `npx jest hooks/__tests__/use-theme-color.test.ts` is green. The existing tests for the touched components are green.
- [ ] Typecheck count drops by 22.
- [ ] Commit: `fix(07-ci-typecheck-lint): FR4 React 19 / RN 0.83 type drift`

### FR5: Behavioural-surface production fixes (PR B)
- [ ] `app/_layout.tsx:48-54`: return `{ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }`.
- [ ] `src/hooks/useRoleRefresh.ts`: right after `getProfileDetail`, add `if (!detail.avatarTypes || !detail.assignment?.team) return;`. No `?? []` defaults.
- [ ] `app/(tabs)/_layout.tsx`:
  - [ ] Delete the `contentStyle` line (131).
  - [ ] Delete the `PILL_BOTTOM_OFFSET` constant and its comment block (40-44).
  - [ ] Update the comments at lines 20 and 122-124.
  - [ ] The iOS branch is untouched (diff check).
- [ ] `src/components/AIConeChart.tsx:396`: remove the `enabled` prop from `<GestureDetector>`.
- [ ] `docs/ARCHITECTURE.md:74` and `:253`: update them. `grep -n "shouldShowAlert\|contentStyle\|PILL_BOTTOM_OFFSET" docs/ARCHITECTURE.md` returns nothing.
- [ ] Run the notification-area tests the app `CLAUDE.md` names: `npx jest app/__tests__/layout-notifications.test.tsx src/__tests__/notifications/handler.test.ts src/hooks/__tests__/useScheduledNotifications.test.ts`. All green.
- [ ] Run `npx jest __tests__/use-role-refresh.test.ts "app/(tabs)/__tests__/native-tabs.test.tsx" src/components/__tests__/AIConeChart.test.tsx`. All green.
- [ ] Typecheck count drops by 10. No casts or suppressions in the four files.
- [ ] Commit: `fix(07-ci-typecheck-lint): FR5 notification behavior, role-refresh guard, dead tab/gesture props`

### FR6: Test and mock type errors (PR B)
- [ ] Fix each file in the spec's FR6 table under its rules:
  - Complete fixtures first.
  - Casts only in tests and mocks.
  - `@ts-expect-error <reason>` only for deliberate bad input.
  - No `@ts-ignore`/`@ts-nocheck`.
  - No production-type changes.
  - Stale-contract tests are updated to the current contract.
  - Duplicate keys keep the last-wins value.
- [ ] Specifically confirm the stale-contract updates:
  - [ ] `payments.test.ts` SC2.7 now uses `periodStartDate`/`periodEndDate`.
  - [ ] `useAIInsights.test.ts` no longer passes `aiUsageSlots`.
- [ ] `npm run typecheck` **exits 0**.
- [ ] `git diff | grep -E "^\+.*@ts-(ignore|nocheck)"` returns nothing. Every added `@ts-expect-error` has a same-line reason.
- [ ] Each FR6 file passes on its own, with a test count ≥ the Pre-flight baseline. Record any fixture completion that changed an outcome in Session Notes (there should be none).
- [ ] `git diff --stat` shows no production file touched by this commit.
- [ ] Commit: `test(07-ci-typecheck-lint): FR6 fix test and mock type errors`

### FR7: Lint (PR B)
- [ ] `'` → `&apos;` at `app/(auth)/credentials.tsx:114`, `app/(auth)/setup.tsx:49`, `app/(tabs)/overview.tsx:649` and `app/+not-found.tsx:9`. No typographic `’`.
- [ ] `layout-notifications.test.tsx:80,87`: add `displayName` (or use named functions) on `MockStack`/`StackMock`.
- [ ] `HapticTab.test.tsx:98,120`: pass children as the third `createElement` argument.
- [ ] `eslint.config.js`: append the `no-restricted-globals` `Buffer` block for `app/**`, `src/**` and `components/**`, ignoring `**/__tests__/**` and `**/*.test.*`.
- [ ] `npm run lint` exits 0 with `0 errors`.
- [ ] `npx expo lint --no-cache 2>&1 | tail -3` shows warnings ≤ the Pre-flight count.
- [ ] Probe: `printf 'export const n = Buffer.byteLength("x");\n' | npx eslint --stdin --stdin-filename src/lib/__probe.ts` exits 1 with `no-restricted-globals`.
- [ ] Probe: the same input with `--stdin-filename src/lib/__tests__/probe.test.ts` reports no `no-restricted-globals`.
- [ ] Probe: `printf 'export const n = new TextEncoder().encode("x").length;\n' | npx eslint --stdin --stdin-filename src/lib/__probe.ts` exits 0.
- [ ] The `ci-gates.test.ts` FR7 case is green. Tests rendering the four edited strings are green.
- [ ] Commit: `fix(07-ci-typecheck-lint): FR7 lint errors and Hermes Buffer guard`

### FR8: CI gates (PR B)
- [ ] `.github/workflows/test.yml` `app-tests`:
  - [ ] `- id: install` / `run: npm ci`
  - [ ] `- name: Typecheck` / `run: npm run typecheck`
  - [ ] `- name: Lint` with `if: ${{ !cancelled() && steps.install.outcome == 'success' }}` / `run: npm run lint`
  - [ ] `- name: Test` with the same `if` / `run: npm test`
  - [ ] The job key stays `app-tests`. `server-tests` is unchanged.
- [ ] The `ci-gates.test.ts` FR8 cases are green.
- [ ] CI-parity check prints `exit=0`:
  ```bash
  T=$(mktemp -d) && git archive HEAD | tar -x -C "$T" && ln -s "$PWD/node_modules" "$T/node_modules" \
    && (cd "$T" && npx tsc --noEmit && npx expo lint) ; echo "exit=$?" ; rm -rf "$T"
  ```
- [ ] Full local run, **once**: `npm run typecheck && npm run lint && npm test`. All exit 0, with 0 failures. The total test count = base − 20 (deleted smoke tests) + new tests from this spec. Record the numbers.
- [ ] Commit: `ci(07-ci-typecheck-lint): FR8 gate app-tests on typecheck and lint`
- [ ] Push. On the PR, `app-tests` shows `Typecheck`, `Lint` and `Test` steps, all green, and `server-tests` is green.
- [ ] (Recommended) Gate probe:
  1. Open a throwaway draft PR adding `export const __ciProbe: number = 'x';` to a `src/` file.
  2. Confirm `app-tests` fails at `Typecheck` while `Lint` and `Test` still run green.
  3. Close it and delete the branch.
- [ ] Merge PR B **before** spec 05 builds the build-18 binary (fingerprint coupling). If that's impossible, apply the spec's fallback and note it here.

---

## Phase 1.2: Review (MANDATORY)

⚠️ **DO NOT skip this phase.** All four steps are mandatory for every change.

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` agent
- [ ] All FR success criteria verified in code
- [ ] Interface contracts match implementation (`utf8ByteLength` private, `typecheck` script, `types`, ESLint block, CI step order and conditions)
- [ ] No scope creep or shortfall. In particular: no `sceneStyle`, no `.gitignore` edit, no job rename, no lint-scope widening.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` skill (launches 6 specialized agents)

### Step 2: Address Feedback
- [ ] Fix HIGH severity issues (critical)
- [ ] Fix MEDIUM severity issues (or document why deferred)
- [ ] Re-run tests after fixes (`npm run typecheck && npm run lint` plus the affected test files)
- [ ] Commit fixes: `fix(07-ci-typecheck-lint): {description}`

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` agent on modified tests
- [ ] Apply suggested improvements that strengthen confidence
- [ ] Re-run tests to confirm passing
- [ ] Commit if changes made: `fix(07-ci-typecheck-lint): strengthen test assertions`

### Final Verification
- [ ] `npm run typecheck`, `npm run lint` and `npm test` exit 0 locally and in CI
- [ ] No regressions in existing tests. The only removed tests are the 20 in `NativeWindSmoke.test.tsx`; the rewritten SC12.9–12.11 and native-tabs FR3 keep their counts.
- [ ] Code follows existing patterns (`React.JSX.Element`, static-`fs` contract tests)
- [ ] `docs/ARCHITECTURE.md` matches the code (FR5e)

---

## Session Notes

<!-- Add notes as you work -->

**2026-10-19 (spec):** Decision records made at spec time.
- **Decision 2: fix test-file TS errors in this spec.** Measured after FR3+FR4 (simulated with `--types jest,node`): 80 test and mock errors in 19 files. That exceeds the research's ~60 trip-wire by count, but 56 of them come from 3 single-root-cause fixtures (`error-envelope` ×28, `hours` ×18, `bridge` ×10), leaving about 24 distinct fix sites. Several are stale-contract tests (`payments` SC2.7, `useAIInsights` `aiUsageSlots`) that excluding `__tests__` would hide. So: no split, no `tsconfig.typecheck.json`.
- **Decision 3 revised: delete the tab `contentStyle`.** It's on the Android-only branch and isn't read by bottom-tabs 7.15.5 or expo-router 55.0.7. Screens already pad 100, and there's no Android tooling to screenshot. No visual change, so no screenshots are needed.
- **CI parity:** in a tracked-files-only checkout, the error set is identical to local once node types are on (113 = 113). Lint is identical too (9/494).
- **Fingerprint:** `packageJson:scripts` and `.gitignore` are default `@expo/fingerprint` 0.16.6 sources. FR3 must be in the build-18 tree, and `.gitignore` stays untouched.

**{Date}**: {Notes about progress, blockers, decisions}
