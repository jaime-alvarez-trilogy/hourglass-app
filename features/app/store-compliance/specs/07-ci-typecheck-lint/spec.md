# 07-ci-typecheck-lint: Honest CI (Typecheck, Lint, Green Tests)

**Status:** Draft
**Created:** 2026-10-19
**Last Updated:** 2026-10-19
**Owner:** @jaime-alvarez-trilogy

---

## Overview

**What is being built:** the app's CI (`.github/workflows/test.yml`, job `app-tests`) will gate on `npm run typecheck` and `npm run lint` as well as `npm test`, and all three will exit 0. Getting there also fixes one real production bug that typecheck exposed, and removes the one test that is red only on the developer's machine.

**How (in order, per research Decision 1):**

1. **FR1:** `src/lib/log.ts` stops calling `Buffer.byteLength`. Hermes has no `Buffer`, so log rotation silently never runs on device. It switches to a private TextEncoder helper. The jest file-system mock moves to TextEncoder too, so a no-`Buffer` regression test is possible.
2. **FR2:** delete the dead `NativeWindSmoke` component and its test. The test reads `~/.claude/.../MEMORY.md`.
3. **FR3:** add `@types/node`, set `"types": ["jest", "node"]`, and add a `typecheck` script. This clears 413 of the 526 errors.
4. **FR4–FR6:** fix the remaining 112 errors. These are 22 mechanical production fixes, 10 production fixes with a behavioural surface (each with a test), and 80 in test and mock files.
5. **FR7:** fix the 9 ESLint errors. Add a `no-restricted-globals` rule for `Buffer` in app code, because FR3 makes Node globals type-check everywhere.
6. **FR8:** add the gates to `app-tests`. This comes last, so CI is never red on day one.

Everything here is JS, config or CI. Only one item is native-coupled: the `package.json` `scripts` edit in FR3 is a fingerprint source (see Release & Merge Order). The target is **build 18**.

### Measured baseline (HEAD `b6b79b7`, 2026-10-19)

| Measurement | Local tree | Tracked-files-only checkout (CI parity) |
|---|---|---|
| `npx tsc --noEmit` | **526** errors | 529 (3 extra TS2591 `module` in `__mocks__/`, because gitignored `expo-env.d.ts` is absent) |
| `npx tsc --noEmit --types jest,node` (FR3 simulated) | **113** | **113** (identical error set) |
| …of which production files | 33 (32 after FR2 deletes `NativeWindSmoke.tsx`) | same |
| …of which test files / `__mocks__` | 77 in 17 files / 3 in 2 files = **80** | same |
| `npx expo lint` | **9 errors**, 494 warnings, exit 1 | identical |
| `npx jest` on `NativeWindSmoke.test.tsx` only | 20 tests: 19 pass, 1 fail (`FR3 SC3.2 — MEMORY.md…`) | the failing `describe` is skipped (file absent) |

The 413 errors cleared by node types break down as: TS2307 `fs`/`path` ×224, TS2304 `__dirname` ×132, TS2304 `global` ×25, TS2591 `Buffer` ×4, and 28 cascades (`tools/*.ts` TS2454, `designTokens.test.ts` TS2339, implicit-any).

### Decisions resolved at spec time

- **Decision 2 (test-file TS errors) is resolved: fix them all in this spec.** No `tsconfig.typecheck.json` and no `__tests__` exclusion. The measured count after FR3+FR4 is 80, which exceeds the research's "~60" trip-wire by the letter. The trip-wire was a proxy for effort, though, and effort is much lower:
  - 56 of the 80 come from three single-root-cause fixtures: `error-envelope.test.ts` ×28 (one `.catch` capture pattern), `hours.test.ts` ×18 (one `makePayments` fixture) and `bridge.test.ts` ×10 (one `makeBaseData` fixture).
  - That leaves about 24 distinct fix sites across 19 files.
  - Several test errors are **stale-contract tests**, which only typecheck reveals. `payments.test.ts` SC2.7 asserts a `Payment.from`/`.to` that no longer exists. `useAIInsights.test.ts` passes a removed `aiUsageSlots` field. Excluding tests would hide exactly this.
- **Decision 3 (tab `contentStyle`) is revised: delete the dead option. Do not move it to `sceneStyle`.**
  - The option sits on the **Android-only** branch of `app/(tabs)/_layout.tsx`; iOS renders `NativeTabs`.
  - Neither `@react-navigation/bottom-tabs` 7.15.5 nor `expo-router` 55.0.7 reads `contentStyle`; grepping both `src/` and `lib/` finds nothing. So it has been a no-op since it was written.
  - Every tab screen already pads its scroll content (`paddingBottom: 100` in `index.tsx`, `overview.tsx`, `ai.tsx` and `approvals.tsx`). A working `sceneStyle` would double-pad.
  - Android isn't distributed, and there is no Android emulator or `adb` on this machine to screenshot the change.
  - So deletion is the only option with zero runtime change on both platforms.

---

## Out Of Scope

1. **ESLint warnings (494)**: **Descoped.** The gate fails on errors only, as the research contract says. Burning down warnings, or ratcheting them with `--max-warnings`, is separate hygiene work. A ratchet would also be brittle while specs 02–04 land in parallel. This spec's own diff must not add warnings (FR7).
2. **Widening lint scope beyond `expo lint` defaults (`src/`, `app/`, `components/`)**: **Descoped.** Linting root `__tests__/`, `__mocks__/`, `hooks/`, `constants/` and `tools/` adds 5 more errors, measured: 4 `react-hooks/rules-of-hooks` in `renderHook` callbacks and 1 duplicate key that FR6 fixes anyway. The research contract keeps `lint` unchanged (`expo lint`).
3. **Making the Android pill clearance real via `sceneStyle`**: **Descoped.** See the Decision 3 revision. Android isn't shipped, it can't be verified here, and screens already pad themselves.
4. **Gating the AIConeChart pan gesture on `animDone` at gesture level** (passing `animDone` into `useScrubGesture`): **Descoped.** That would be a runtime behaviour change. FR5 only removes the dead prop, and the existing reaction guards keep today's behaviour.
5. **Deleting Expo template leftovers** (`app/(tabs)/explore.tsx`, `components/parallax-scroll-view.tsx`, `components/ui/*`, `hooks/use-theme-color.ts`): **Descoped.** They're type-fixed in place (FR4). Removing a route is a separate cleanup decision.
6. **Bumping CI Node from 20 to 22**: **Descoped.** CI is green on Node 20 today. Changing the runtime in the same PR as new gates muddies failure attribution. Revisit when an Expo SDK bump requires it.
7. **Committing `expo-env.d.ts` or generating `.expo/types` in CI**: **Descoped.** CI parity was measured as identical once node types are on. Editing `.gitignore` would also change the fingerprint runtime version, because `.gitignore` is a default `@expo/fingerprint` source.
8. **Stricter compiler flags** (`noUnusedLocals`, `noUncheckedIndexedAccess` and similar): **Descoped.** Out of the "make CI honest" goal.
9. **Dependency pins, `patch-package --error-on-fail`, and the SDK 55 patch refresh**: **Deferred to [06-dependency-hygiene](../06-dependency-hygiene/spec-research.md).** That spec then gates on the typecheck and lint added here.
10. **Changes to the `server-tests` job or `server/`**: **Descoped.** `server/` is excluded from the app tsconfig and has its own CI job, which stays as it is.

---

## Functional Requirements

### FR1: Hermes-safe log rotation

`src/lib/log.ts:184` calls `Buffer.byteLength(lines[i], 'utf8')`. Hermes has no global `Buffer`, and `buffer` isn't a dependency. On device, `rotateIfNeeded()` throws a `ReferenceError`. The `try/catch` at `log.ts:110-114` swallows it into `_lastWriteError`, so the log never rotates and grows past its 200 KB cap. Jest hides this because the `jest-expo/node` preset has a Node `Buffer`. The in-memory mock (`__mocks__/expo-file-system/index.ts:30,58`) also calls `Buffer.byteLength` inside `getInfoAsync`. A test that deletes `Buffer` would therefore fail in the mock before it ever reaches `log.ts`, whether or not the fix is in.

**Requirements:**
- Add a private, non-exported helper `utf8ByteLength(s: string): number` to `log.ts` that returns `TextEncoder`'s encoded length. It may lazily memoize a single encoder on first call. It must **not** construct a `TextEncoder` at module scope, because a module-scope construction failure would crash every importer at load instead of being swallowed by the rotation `try/catch`.
- Replace line 184 with `const lineBytes = utf8ByteLength(lines[i]) + 1; // +1 for \n`. Nothing else in the rotation algorithm changes: the `MAX_BYTES`/`TARGET_BYTES` semantics, newest-first retention and the trailing-newline handling all stay.
- In `__mocks__/expo-file-system/index.ts`, compute `size` with `new TextEncoder().encode(content).length` in both `getInfoAsync` implementations (lines 30 and 58).
- Add three tests to `src/lib/__tests__/log.test.ts` (see the Test Plan): the no-`Buffer` rotation regression, multi-byte byte-counting, and the empty log.

**Success Criteria:**
- [ ] `grep -nw "Buffer" src/lib/log.ts __mocks__/expo-file-system/index.ts` returns no matches.
- [ ] With the mock change and new tests applied, the no-`Buffer` regression test **fails** against the pre-fix `log.ts` and **passes** after the fix.
- [ ] The multi-byte test asserts its own precondition: a UTF-16 `.length` implementation would keep more than `TARGET_BYTES` of UTF-8. The test therefore cannot pass vacuously.
- [ ] `npx jest src/lib/__tests__/log.test.ts` reports 28 passing (25 existing + 3 new), 0 failing.
- [ ] `log.ts` still imports only `expo-file-system/legacy` and `./redact`. The FR10 "zero network" tests stay green.

---

### FR2: Remove the out-of-repo smoke test

`src/components/NativeWindSmoke.tsx` describes itself as a "TEMPORARY smoke-test component". It has zero importers; the only references are its own test and a comment in `colors.test.ts`. `__tests__/components/NativeWindSmoke.test.tsx:199-203` reads `$HOME/.claude/projects/-Users-Trilogy-Documents-Claude-Code-WS/memory/MEMORY.md`. That file exists only on the developer's machine, so the test is skipped in CI and fails locally.

**Requirements:**
- Delete `src/components/NativeWindSmoke.tsx` and `__tests__/components/NativeWindSmoke.test.tsx`.
- Add a guard in a new `__tests__/ci-gates.test.ts`. Both files must be absent. No test or mock source under `__tests__/`, `src/`, `app/`, `components/`, `hooks/` or `__mocks__/` may contain `process.env.HOME`, `os.homedir(` or a `/.claude/` path. Build the patterns dynamically, or exclude `ci-gates.test.ts` itself, so the guard doesn't match its own source.

**Success Criteria:**
- [ ] Both files are absent. `grep -rn "NativeWindSmoke" app src components hooks __tests__` matches only the comment in `src/components/__tests__/colors.test.ts`.
- [ ] The `ci-gates.test.ts` FR2 cases pass.
- [ ] In the post-change full `npm test` run, the total test count drops by exactly 20 relative to the same base without this spec, net of tests added by this spec. Failures are 0 locally.

---

### FR3: Typecheck foundation (Node types and script)

`tsconfig.json:5-7` sets `"types": ["jest"]`, which hides `@types/node`. Test files that use `fs`, `path`, `__dirname`, `global` and `Buffer` therefore fail to type-check. `@types/node@25.3.5` is already installed transitively and hoisted, but isn't a direct dependency.

**Requirements:**
- Run `npm install --save-dev @types/node@25.3.5`, pinned to the version already in the lockfile so there's no version churn.
- `tsconfig.json`: `"types": ["jest", "node"]`. Nothing else in `tsconfig.json` changes; `include` and `exclude` stay as they are.
- `package.json` `scripts`: add `"typecheck": "tsc --noEmit"`. `lint` stays `"expo lint"`.

**Success Criteria:**
- [ ] `npm run typecheck 2>&1 | grep -c "error TS"` returns **112** after FR2+FR3: the FR4 + FR5 + FR6 catalog exactly, with no TS2307 `fs`/`path`, TS2304 `__dirname`/`global` or TS2591.
- [ ] `git diff package-lock.json` adds only the root `devDependencies["@types/node"]` entry. `packages["node_modules/@types/node"].version` stays `25.3.5`.
- [ ] The `ci-gates.test.ts` FR3 cases pass: the `scripts.typecheck` value, the `@types/node` devDependency, and `types` containing both `jest` and `node`.

---

### FR4: Production type fixes, mechanical (22 errors, 19 files)

These are type-level drift from React 19, RN 0.83, expo-symbols 55 and Reanimated 4. None changes runtime behaviour, except the latent `'unspecified'` crash noted below.

| File(s) | Error | Fix |
|---|---|---|
| `src/components/{AIArcHero, AppBreakdownCard, ApprovalUrgencyCard, AppUsageBar, Card, EarningsPaceCard, GlassCard, MetricValue, MyRequestCard, NoiseOverlay, OverviewHeroCard, PanelGradient, SectionLabel, SkeletonLoader}.tsx` | TS2503 ×14, no global `JSX` namespace in React 19 types | `JSX.Element` → `React.JSX.Element`. All 14 already `import React`; this matches the existing pattern in `OverviewStickyBar.tsx` and `HourlyPatternCard.tsx` |
| `src/components/SkeletonLoader.tsx:51` | TS2322, `width: string \| number` isn't a valid style width | Prop type `width?: DimensionValue` (from `react-native`). Call sites pass numbers or `'60%'` |
| `src/components/AIRingChart.tsx:59` | TS18048, `timingChartFill.duration` possibly undefined | `(timingChartFill.duration ?? 0) + animDelay`. Same value at runtime, since the preset defines `duration: 600` |
| `src/components/FloatingPillTabBar.tsx:133` | TS18048, `badge` possibly undefined | `(badge ?? 0) > 0`. Today `undefined > 0` is `false`, so the result is identical |
| `components/parallax-scroll-view.tsx:55`, `hooks/use-theme-color.ts:14,19` | TS7053 ×3, RN 0.83 `ColorSchemeName` is `'light' \| 'dark' \| 'unspecified'` | Normalise: `const theme = scheme === 'dark' ? 'dark' : 'light'`. **Latent bug fixed:** today `'unspecified'` makes `useThemeColor` read `Colors['unspecified']`, which is `undefined`, and throws |
| `components/ui/icon-symbol.tsx:8,40` | TS2344/TS2538, expo-symbols 55 `SymbolViewProps['name']` is `SFSymbol \| {ios?,android?,web?}` and can't be a record key | `const MAPPING = {...} as const satisfies Record<string, ComponentProps<typeof MaterialIcons>['name']>`. `IconSymbolName = keyof typeof MAPPING` stays the 4-literal union, so callers (`explore.tsx`, `collapsible.tsx`) compile unchanged |

**Requirements:**
- Apply the fixes above.
- No `any`, `as unknown as`, `@ts-ignore` or `@ts-expect-error` in production files.
- Add `hooks/__tests__/use-theme-color.test.ts` covering the `'unspecified'` normalisation.

**Success Criteria:**
- [ ] `npm run typecheck` shows none of the 22 listed errors.
- [ ] `git diff` adds no `any`, `as unknown as`, `@ts-ignore` or `@ts-expect-error` to any non-test file.
- [ ] `hooks/__tests__/use-theme-color.test.ts`:
  - `'unspecified'` returns `Colors.light[colorName]`. This throws on current code.
  - `'dark'` returns `Colors.dark[colorName]`.
  - A `props.light` override wins under `'unspecified'`.
- [ ] Existing tests for the touched components still pass: `npx jest src/components/__tests__ -t "SkeletonLoader|AIRingChart|FloatingPillTabBar|AIArcHero|MetricValue"`, or the matching files.

---

### FR5: Production fixes with a behavioural surface (10 errors, 4 files)

Each fix is reviewed, not cast, and each comes with an updated or new test.

**5a. Notification handler (`app/_layout.tsx:48-54`, TS2322).** The handler returns the deprecated `{ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }`. In expo-notifications 55, `NotificationBehavior` requires `shouldShowBanner` and `shouldShowList`. At runtime today, iOS gets `.alert | .sound` (`HandlerModule.swift`). The JS layer also `console.warn`s "`shouldShowAlert` is deprecated" on **every** foreground notification (`NotificationsHandler.js:65`).
- Return `{ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }` with no `shouldShowAlert`. On iOS 14+, `.banner | .list` is the documented equivalent of `.alert`.

**5b. Role refresh guard (`src/hooks/useRoleRefresh.ts:47-53`, TS18048 ×7).** `DetailResponse.avatarTypes` and `.assignment` (and `.assignment.team`) are optional (`src/api/auth.ts:14-30`). Today a missing field throws a `TypeError` inside the `try`. The `catch` swallows it, so there's no `saveConfig`, no invalidate, and `lastRoleCheck` is unchanged.
- Right after `getProfileDetail` (line 43), add `if (!detail.avatarTypes || !detail.assignment?.team) return;`, then build `updatedConfig` from the narrowed values.
- This keeps today's outcome exactly. Do **not** use `?.`/`?? []` defaults: they would write `isManager: false` or a team id of `"undefined"` into config.

**5c. Tabs `contentStyle` (`app/(tabs)/_layout.tsx:131`, TS2353).** This is a dead option on the Android-only branch (see the Decision 3 revision).
- Delete the `contentStyle` line and the now-unused `PILL_BOTTOM_OFFSET` constant with its comment block (lines 40-44).
- Rewrite the comments at lines 20 and 122-124 to say clearance comes from each screen's scroll `paddingBottom`.
- The iOS `NativeTabs` branch stays byte-identical.

**5d. AIConeChart dead gesture prop (`src/components/AIConeChart.tsx:396`, TS2322).** `<GestureDetector enabled={animDone && size === 'full'}>`: RNGH 2.30 `GestureDetectorProps` has no `enabled`, and GestureDetector ignores it at runtime. The effective gates already exist:
- `useScrubGesture({ pixelXs, enabled: size === 'full' })` (lines 284-287) → `Gesture.Pan().enabled(enabled)`.
- `if (!animDone) return;` in both `useAnimatedReaction` callbacks (lines ~315 and ~340).

Remove the `enabled` prop. Runtime is unchanged.

**5e. Keep the architecture map accurate.** The app's `CLAUDE.md` makes `docs/ARCHITECTURE.md` the required read before cross-cutting changes. Update `docs/ARCHITECTURE.md:74` (the foreground handler is now banner + list + sound, badge off) and `:253` (the Android pill: content clearance comes from each screen's scroll `paddingBottom: 100`, not `contentStyle`/`PILL_BOTTOM_OFFSET`). Before editing 5a, read §1 and §8.1–8.4, as the app `CLAUDE.md` routing table requires.

**Success Criteria:**
- [ ] `npm run typecheck` shows none of these 10 errors, and none of the four files gained a cast or suppression.
- [ ] `grep -n "shouldShowAlert\|contentStyle\|PILL_BOTTOM_OFFSET" docs/ARCHITECTURE.md` returns no matches.
- [ ] `app/__tests__/layout-notifications.test.tsx` FR1.5 asserts `shouldShowBanner === true`, `shouldShowList === true` and `shouldShowAlert === undefined`. It fails on current code. FR1.6 and FR1.7 are unchanged and green.
- [ ] `__tests__/use-role-refresh.test.ts`: there are new cases for a detail with no `assignment`, an `assignment` with no `team`, and no `avatarTypes`. Each resolves without throwing; `saveConfig` and `queryClient.invalidateQueries` aren't called. These are characterization tests, green before and after. All existing cases stay green.
- [ ] `app/(tabs)/__tests__/native-tabs.test.tsx` "02-platform-split-nav — FR3" is rewritten:
  - The Android `<Tabs screenOptions>` contains no `contentStyle` and no `sceneStyle` key. This fails on current code.
  - Each of `app/(tabs)/{index,overview,ai,approvals}.tsx` contains a scroll `paddingBottom` ≥ 100.
  - SC3.3 and SC3.4 are unchanged.
  - The rest of the file stays green.
- [ ] `src/components/__tests__/AIConeChart.test.tsx` SC12.9–SC12.11 are rewritten to assert the effective gates:
  - `<GestureDetector` has no `enabled=` prop. This fails on current code.
  - The `useScrubGesture({...})` call passes `enabled: size === 'full'`.
  - The source contains at least 2 `if (!animDone) return;` guards.
  - The rest of the file stays green.

---

### FR6: Test and mock type errors (80 errors, 19 files)

Decision 2 is resolved: all of these are fixed in this spec.

**Rules:**
1. Prefer completing fixtures to the real interface. Use realistic zero or empty values for new required fields.
2. `as any` and `as unknown as T` are allowed only in test and mock files.
3. `// @ts-expect-error <reason>` is allowed only for deliberate bad-input tests.
4. `@ts-ignore` and `@ts-nocheck` are forbidden.
5. **Never change a production type to satisfy a test.**
6. A stale-contract test is updated to the current contract.
7. Completing a fixture must not change any assertion or test outcome. If one does, stop and record it in Session Notes as a finding.
8. Test counts per file must not drop. Duplicate-key removals keep the effective (last-wins) value.

| File | Count | Root cause | Fix |
|---|---|---|---|
| `__tests__/error-envelope.test.ts` | 28 | `const err = await apiGet(...).catch((e) => e)` infers `unknown` | One typed capture, e.g. `.catch((e: unknown) => e as ApiError)` or a local `captureError()` helper |
| `__tests__/lib/hours.test.ts` | 18 | `makePayments` lacks `overtimeHours`, `approvedOvertimeHours`, `manualMinutes` | Complete the fixture with zeros. `calculateHours` reads only `paidHours`/`workedHours`, so outcomes are unchanged |
| `src/__tests__/widgets/bridge.test.ts` | 10 | `makeBaseData()` doesn't satisfy the bridge input type | Complete or annotate the fixture once |
| `src/lib/__tests__/payments.test.ts` | 4 | Fixture lacks `overtimeHours` and similar fields. **Stale SC2.7** asserts `Payment.from`/`.to` | Complete the fixture. Rewrite SC2.7 against the real `Payment` (`periodStartDate`/`periodEndDate`) |
| `src/__tests__/hooks/useWidgetSync.test.ts` | 3 | `ApprovalItem[]` / `ManualRequestEntry[]` fixtures are incomplete | Complete the fixtures |
| `src/__tests__/lib/widgetBridge.test.ts` | 1 | Snapshot fixture vs `CrossoverSnapshot` | Complete the fixture |
| `src/lib/__tests__/aiAppBreakdown.test.ts`, `requestsUtils.test.ts` | 1 + 1 | `makeSlot` lacks newer required `WorkDiarySlot` fields | Complete `makeSlot` |
| `src/hooks/__tests__/useAIInsights.test.ts` | 1 | **Stale:** `aiUsageSlots` isn't on `AIWeekData` | Remove the stale field |
| `src/components/__tests__/TrendSparklineExternalCursor.test.tsx` | 1 | The local `renderSparkline` helper's prop type omits `capLabel` (the component does accept it) | Widen the helper type to the component's props |
| `app/(tabs)/__tests__/indexConeIntegration.test.tsx`, `src/components/__tests__/AITabConeIntegration.test.tsx` | 1 + 1 | TS2556: spreading into a zero-arg `jest.fn(() => …)` | `jest.fn((..._args: unknown[]) => MOCK_CONE_DATA)` |
| `app/__tests__/modal-debug-log.test.tsx` | 2 | `mock.calls[0]` typed `[]` | Type the mock's parameters, or cast the destructure |
| `src/__tests__/widgets/widgetVisualIos.test.ts`, `src/components/__tests__/AIArcHero.test.tsx` | 2 + 1 | Implicit `any` params | Annotate |
| `src/components/__tests__/AnimatedMeshBackground.test.tsx` | 1 | TS2774: `jest.requireActual ? … : …` is always truthy | Drop the dead conditional |
| `src/widgets/__tests__/widgetLayoutJs.test.ts:384` | 1 | Duplicate `paceBadge: undefined` (TS1117, and also lint `no-dupe-keys`) | Delete one; both are identical |
| `__mocks__/react-native-gesture-handler.ts:13-23` | 1 | Duplicate `minDistance` in the `Pan()` object; the last one (`jest.fn().mockReturnThis()`) wins | Delete the dead nested chain at lines 13-21 |
| `__mocks__/@shopify/react-native-skia.ts:9,18` | 2 | TS7023/7024: recursive `makeMockPath` has an implicit return type | Add an explicit return type |

**Success Criteria:**
- [ ] `npm run typecheck` reports 0 errors in any path containing `__tests__/` or `__mocks__/`. Together with FR4 and FR5, `npm run typecheck` exits 0.
- [ ] `git diff` adds no `@ts-ignore` or `@ts-nocheck`. Every added `@ts-expect-error` has a reason comment on the same line.
- [ ] Every modified test file passes when run on its own (`npx jest <file>`), with a test count ≥ its pre-change count.
- [ ] No production (non-test, non-mock) file was modified as part of FR6.

---

### FR7: Lint errors to 0, plus a Hermes `Buffer` guard

`npx expo lint` reports 9 errors (4 production, 5 test).

FR3 makes Node globals type-check in production code. That would silently re-admit FR1's bug class, so FR7 also adds a lint guard.

| File:line | Rule | Fix |
|---|---|---|
| `app/(auth)/credentials.tsx:114` (`device's`), `app/(auth)/setup.tsx:49` (`couldn't`), `app/(tabs)/overview.tsx:649` (`Couldn't`), `app/+not-found.tsx:9` (`doesn't`) | `react/no-unescaped-entities` | `'` → `&apos;`. The rendered string stays identical (U+0027). Do **not** use a typographic `’` |
| `app/__tests__/layout-notifications.test.tsx:80,87` | `react/display-name` | Give `MockStack` and the in-factory `StackMock` a `displayName`, or make them named functions |
| `src/components/__tests__/HapticTab.test.tsx:98,120` | `react/no-children-prop` | Pass children as the third `React.createElement` argument |
| `src/widgets/__tests__/widgetLayoutJs.test.ts:384` | `no-dupe-keys` | Fixed by FR6 |

**Requirements:**
- Apply the fixes above.
- In `eslint.config.js`, append a block after `expoConfig`:
  - `files`: `app/**`, `src/**` and `components/**` with the `ts`/`tsx`/`js`/`jsx` extensions.
  - `ignores`: `**/__tests__/**` and `**/*.test.*`.
  - Rule: `'no-restricted-globals': ['error', { name: 'Buffer', message: 'Hermes has no global Buffer. Use TextEncoder (see src/lib/log.ts).' }]`.
  - Today `eslint-config-expo` 55.0.0 sets no `no-restricted-globals`, so nothing is overridden.

**Success Criteria:**
- [ ] `npm run lint` exits 0 and its summary shows `0 errors`.
- [ ] Warnings don't increase. Run `npx expo lint --no-cache 2>&1 | tail -3` on the same base before and after this spec's diff; the "after" warning count is ≤ the "before" count (494 at `b6b79b7`).
- [ ] `printf 'export const n = Buffer.byteLength("x");\n' | npx eslint --stdin --stdin-filename src/lib/__probe.ts` exits 1 and reports `no-restricted-globals`. The same input with `--stdin-filename src/lib/__tests__/probe.test.ts` reports no `no-restricted-globals`. `printf 'export const n = new TextEncoder().encode("x").length;\n'` on `src/lib/__probe.ts` exits 0. This was verified against today's config via `--rule`.
- [ ] The `ci-gates.test.ts` FR7 case passes: `eslint.config.js` source contains `no-restricted-globals` and `Buffer`.
- [ ] Tests that render the four edited strings (e.g. `getByText(...)` in auth or overview tests) still pass.

---

### FR8: CI gates in `app-tests`

Branch protection on `main` requires the status checks `app-tests` and `server-tests` (`strict: true`, `enforce_admins: false`; read via `gh api …/branches/main/protection`). Adding steps inside `app-tests` makes them gating at once. Renaming or splitting the job would silently drop the gate, or block every merge.

**Requirements:**
- `.github/workflows/test.yml` `app-tests` steps, in this order: checkout → setup-node (unchanged) → `npm ci` (`id: install`) → `npm run typecheck` → `npm run lint` → `npm test`.
- `Lint` and `Test` run even if an earlier gate failed, as long as install succeeded: `if: ${{ !cancelled() && steps.install.outcome == 'success' }}`. One PR run then reports all three gates.
- The job key stays `app-tests`. The `server-tests` job is unchanged.

**Success Criteria:**
- [ ] On the spec's PR, the `app-tests` run shows named steps `Typecheck`, `Lint` and `Test`, all green. `server-tests` is green.
- [ ] CI-parity check passes before pushing:
  ```bash
  T=$(mktemp -d) && git archive HEAD | tar -x -C "$T" && ln -s "$PWD/node_modules" "$T/node_modules" \
    && (cd "$T" && npx tsc --noEmit && npx expo lint) ; echo "exit=$?" ; rm -rf "$T"
  ```
  The output must show `exit=0`.
- [ ] The `ci-gates.test.ts` FR8 cases pass:
  - The `app-tests:` block exists.
  - Inside it, `npm ci` < `npm run typecheck` < `npm run lint` < `npm test` by string index.
  - The `server-tests:` block still contains `working-directory: server`.
- [ ] Gate probe (recommended, manual), on a throwaway draft PR:
  1. Add `export const __ciProbe: number = 'x';` to any `src/` file.
  2. Confirm `app-tests` fails at `Typecheck`, while `Lint` and `Test` still run green.
  3. Close the PR and delete the branch.

---

## Technical Design

### Interface Contracts

| Item | Contract |
|---|---|
| `src/lib/log.ts` | `function utf8ByteLength(s: string): number`. Private (not exported), returns `TextEncoder`'s UTF-8 encoded length, and doesn't construct `TextEncoder` at module scope. Public API unchanged: `log`, `__setRotationLimits` |
| `__mocks__/expo-file-system/index.ts` | `getInfoAsync(uri)` returns `{ exists, size, uri }`, with `size` = UTF-8 byte length via `TextEncoder`. No `Buffer` reference |
| `package.json` | `scripts.typecheck = "tsc --noEmit"`; `scripts.lint = "expo lint"` (unchanged); `devDependencies["@types/node"] = "^25.3.5"` |
| `tsconfig.json` | `compilerOptions.types = ["jest", "node"]`. Nothing else changes |
| `eslint.config.js` | `[expoConfig, { ignores: ['dist/*'] }, { files: app/src/components globs, ignores: tests, rules: { 'no-restricted-globals': ['error', { name: 'Buffer', message }] } }]` |
| `app/_layout.tsx` handler | `handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false })` |
| `runRoleRefresh` | Missing `avatarTypes` or `assignment.team` → returns early: no `saveConfig`, no invalidate, no throw |
| `.github/workflows/test.yml` `app-tests` | Steps `npm ci` (id `install`) → `Typecheck` → `Lint` (if `!cancelled() && install success`) → `Test` (same condition) |
| Exit codes | `npm run typecheck`, `npm run lint` and `npm test` all return 0, both locally and in CI |

### Test Plan

All paths match `jest.config.js` `testMatch` (`**/__tests__/**/*.test.ts(x)`).

| FR | Test file | Cases | Red before fix? |
|---|---|---|---|
| FR1 | `src/lib/__tests__/log.test.ts` (extend; new `describe('logger — no-Buffer runtime (Hermes parity)')`) | A local helper `withoutBuffer(fn)` saves and deletes `globalThis.Buffer`, awaits `fn` (the log calls only), and restores `Buffer` in `finally`. Assertions run **after** it returns. `afterEach` restores `Buffer` as a safety net. (1) **Regression:** inside `withoutBuffer`, `__setRotationLimits(500, 300)`, log 20 events, `flush()`. The UTF-8 size (via `TextEncoder`) is ≤ 300, content starts with `{`, and the first line's `meta.i` > 0. (2) **Multi-byte:** with `Buffer` deleted, seed `LOG_URI` via `_setFile` with JSON lines whose `category` mixes emoji (4 bytes, 2 UTF-16 units) and `ñ` (2 bytes, 1 unit). Assert the precondition "UTF-16 counting would keep > TARGET bytes", then log 1 event and flush. The UTF-8 size is ≤ TARGET and the last line is the new event. (3) **Empty log:** with `Buffer` deleted, `_setFile(LOG_URI, '')`, log 1 event, `flush()` resolves, `readAsStringAsync` isn't called (no rotation), and the content is exactly one line | (1) yes, once the mock is fixed (the `ReferenceError` is swallowed and the file stays > 300 B). (2) yes, for the same reason. (3) no (guard) |
| FR2, FR3, FR7, FR8 | `__tests__/ci-gates.test.ts` (new; static `fs` reads, codebase pattern) | FR2: smoke files absent; no test or mock source references `process.env.HOME`, `os.homedir(` or `/.claude/`. FR3: `scripts.typecheck === 'tsc --noEmit'`, `devDependencies['@types/node']` defined, `tsconfig.compilerOptions.types` ⊇ `['jest','node']`. FR7: `eslint.config.js` contains `no-restricted-globals` and `Buffer`. FR8: step order in the `app-tests` block; `server-tests` intact | yes (all) |
| FR4 | `hooks/__tests__/use-theme-color.test.ts` (new; `jest.mock('@/hooks/use-color-scheme')`) | `'unspecified'` returns `Colors.light.text`; `'dark'` returns `Colors.dark.text`; a `{ light: '#123' }` override under `'unspecified'` returns `'#123'` | yes (throws) |
| FR4 | `npm run typecheck` | The 22 FR4 errors are gone | yes |
| FR5a | `app/__tests__/layout-notifications.test.tsx` (modify FR1.5) | banner true, list true, `shouldShowAlert` undefined | yes |
| FR5b | `__tests__/use-role-refresh.test.ts` (extend) | No `assignment`; no `team`; no `avatarTypes`. Each resolves, with no `saveConfig` or invalidate | no (characterization) |
| FR5c | `app/(tabs)/__tests__/native-tabs.test.tsx` (rewrite the 02-platform-split-nav FR3 block) | No `contentStyle`/`sceneStyle` in Android `screenOptions`; each of the 4 tab screens has scroll `paddingBottom` ≥ 100; SC3.3/SC3.4 kept | yes (first case) |
| FR5d | `src/components/__tests__/AIConeChart.test.tsx` (rewrite SC12.9–12.11) | No `enabled=` on `<GestureDetector`; `useScrubGesture` gets `enabled: size === 'full'`; at least 2 `if (!animDone) return;` | yes (first case) |
| FR6 | The 19 files in the FR6 table | No new cases. Each file passes on its own with an unchanged count; typecheck is clean | n/a |
| FR7 | Command probes (see FR7 success criteria) + `ci-gates.test.ts` | `Buffer` is flagged in `src/`, not in tests; `TextEncoder` isn't flagged | n/a |
| FR8 | The PR's CI run + the CI-parity command + the optional gate probe | All three gates green; the probe fails only at Typecheck | n/a |
| All | Final local run: `npm run typecheck && npm run lint && npm test` (the full suite runs **once**, at the end) | All exit 0, with 0 failures | — |

### Files to Reference

| File | Why |
|---|---|
| `src/api/auth.ts:14-30` | `DetailResponse`: optional `avatarTypes` and `assignment` |
| `node_modules/expo-notifications/build/Notifications.types.d.ts:611-624` | `NotificationBehavior` (55.0.13) |
| `node_modules/expo-notifications/ios/.../Handler/HandlerModule.swift:69-97` | How `shouldShowAlert`, `shouldShowBanner` and `shouldShowList` map to presentation options |
| `node_modules/@react-navigation/bottom-tabs/src/views/BottomTabView.tsx` | Proves `contentStyle` isn't read (only `sceneStyle`) |
| `node_modules/react-native-gesture-handler/lib/typescript/handlers/gestures/GestureDetector/index.d.ts` | `GestureDetectorProps`, which has no `enabled` |
| `node_modules/react-native/Libraries/Utilities/Appearance.d.ts:12` | `ColorSchemeName` includes `'unspecified'` |
| `src/hooks/useScrubGesture.ts:67-93` | Where the scrub gesture's `.enabled()` gate really lives |
| `node_modules/@expo/fingerprint/build/sourcer/Bare.js`, `Options.js:63` | `packageJson:scripts` and `.gitignore` are default fingerprint sources |
| `src/components/OverviewStickyBar.tsx` | Existing `React.JSX.Element` pattern |

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `src/lib/log.ts` | modify | FR1: `utf8ByteLength` via TextEncoder |
| `__mocks__/expo-file-system/index.ts` | modify | FR1: TextEncoder size (no `Buffer`) |
| `src/lib/__tests__/log.test.ts` | modify | FR1: 3 no-`Buffer` tests |
| `src/components/NativeWindSmoke.tsx` | delete | FR2 |
| `__tests__/components/NativeWindSmoke.test.tsx` | delete | FR2 |
| `__tests__/ci-gates.test.ts` | create | FR2/FR3/FR7/FR8 static contracts |
| `package.json`, `package-lock.json` | modify | FR3: `@types/node`, `typecheck` script |
| `tsconfig.json` | modify | FR3: `types` |
| 14 × `src/components/*.tsx` (FR4 table), `components/parallax-scroll-view.tsx`, `components/ui/icon-symbol.tsx`, `hooks/use-theme-color.ts`, `src/components/AIRingChart.tsx`, `src/components/FloatingPillTabBar.tsx` | modify | FR4 |
| `hooks/__tests__/use-theme-color.test.ts` | create | FR4 |
| `app/_layout.tsx`, `src/hooks/useRoleRefresh.ts`, `app/(tabs)/_layout.tsx`, `src/components/AIConeChart.tsx` | modify | FR5 |
| `app/__tests__/layout-notifications.test.tsx`, `__tests__/use-role-refresh.test.ts`, `app/(tabs)/__tests__/native-tabs.test.tsx`, `src/components/__tests__/AIConeChart.test.tsx` | modify | FR5 tests (+ FR7 display-name in `layout-notifications`) |
| `docs/ARCHITECTURE.md` | modify | FR5e: lines 74 and 253 |
| The 17 test files and 2 mocks in the FR6 table | modify | FR6 |
| `app/(auth)/credentials.tsx`, `app/(auth)/setup.tsx`, `app/(tabs)/overview.tsx`, `app/+not-found.tsx`, `src/components/__tests__/HapticTab.test.tsx` | modify | FR7 |
| `eslint.config.js` | modify | FR7: `Buffer` guard |
| `.github/workflows/test.yml` | modify | FR8 |

Not touched: `.gitignore` (a fingerprint source), `app.json`, `eas.json`, `server/**`, the `src/widgets/android/**` exclusion.

### Data Flow

```
PR opened/updated
  └─ test.yml ─┬─ app-tests (required check)
               │    npm ci ─► Typecheck (tsc --noEmit, types: jest+node)
               │           ─► Lint (expo lint: src/ app/ components/ + Buffer guard)   [runs even if Typecheck failed]
               │           ─► Test (jest, jest-expo/node)                               [runs even if earlier gate failed]
               │    job fails if any gate fails → merge blocked (strict)
               └─ server-tests (unchanged)

Device (Hermes): log.flush() → writeAsStringAsync(append) → rotateIfNeeded()
  getInfoAsync.size > MAX_BYTES → readAsStringAsync → newest-first keep while Σ utf8ByteLength(line)+1 ≤ TARGET_BYTES
  → writeAsStringAsync(rewritten)            (previously: ReferenceError: Buffer → swallowed → never rotated)
```

### Release & Merge Order

1. **Target: build 18.** All of FR1–FR8 is JS, config or CI.
2. **Fingerprint coupling.** Spec 04 switches `runtimeVersion` to the `fingerprint` policy. In `@expo/fingerprint` 0.16.6, `packageJson:scripts` is a default hash source: only `android`/`ios` scripts are skipped (`DEFAULT_SOURCE_SKIPS`).
   - So FR3's `typecheck` script **must be in the tree that builds build 18**. If it lands after the binary, every later OTA built from that tree gets a different runtime version and never reaches build-18 installs.
   - `.gitignore` is also a source, which is why this spec doesn't touch it.
   - `@types/node` (a devDependency), `tsconfig.json`, `eslint.config.js` and `test.yml` are fingerprint-neutral.
3. **Merge sequence:**
   - FR1+FR2 can merge early as their own PR. They're small and independent, and add no `package.json` change.
   - Rebase the FR3–FR8 PR on top of 01–04, after spec 02's `modal.tsx`/`legalLinks.ts` and spec 03's `__tests__/config/app-config.test.ts` land.
   - **Re-measure** `npm run typecheck` / `npm run lint` and fix anything those specs introduced.
   - Merge before spec 05 cuts the build-18 binary.
4. **Fallback if FR3–FR8 isn't green by the build-18 cut:**
   - Build 18 ships with FR1+FR2 only.
   - The rest waits for the next native build (build 19 with spec 06, which already changes `scripts.postinstall`).
   - Alternatively, `test.yml` calls `npx tsc --noEmit` directly, with no `package.json` script, which keeps the fingerprint stable.

### Edge Cases

| Case | Handling |
|---|---|
| `TextEncoder` availability on device | Verified: the shipped `hermesvm.framework` in `build-1785341281053.ipa` (2026-07-29, RN 0.83.2) contains `TextEncoder`/`encodeInto`. jest-node has it natively. TS `lib` already includes `DOM`. No polyfill. Lazy construction keeps any failure inside the rotation `try/catch` |
| The mock itself uses `Buffer` | FR1 switches the mock to TextEncoder **first** (Phase 1.0), so the regression test isolates `log.ts` |
| Deleting `globalThis.Buffer` leaking to other tests | `withoutBuffer()` restores in `finally` before any assertion, so jest's own matcher code never runs without `Buffer`. `afterEach` restores again as a safety net. Jest gives each test file its own global, so any leak stays within `log.test.ts` |
| Node types hide future `Buffer` use in app code | FR7's `no-restricted-globals` guard. `fs`/`path`/`buffer` *imports* already fail loudly at Metro bundle time |
| CI lacks gitignored `expo-env.d.ts` and `.expo/types` (typed routes) | Measured: with node types, the CI-parity checkout gives the identical 113-error set. FR8 requires the CI-parity command to exit 0 before pushing. Don't commit `expo-env.d.ts`; that would mean editing `.gitignore`, which changes the fingerprint |
| Renaming or splitting the `app-tests` job | Forbidden. Required checks are keyed by job name |
| A typecheck failure hiding lint or test results | The `if: !cancelled() && steps.install.outcome == 'success'` conditions on Lint and Test |
| `@types/node` 25 types vs CI Node 20 runtime | Acceptable: node types are only used by jest code. A Node > 20 API used in a test would fail `npm test` in CI anyway |
| Specs 02/03/04 add code after this spec's measurements | Rebase and re-measure before merge (Release & Merge Order step 3). New errors from those specs are fixed in this PR under the same FR rules |
| `expo lint` cache masking results locally | Final verification uses `npx expo lint --no-cache`. CI always runs cold |
| Unescaped-entity fixes changing visible text | `&apos;` renders U+0027, identical to today. A typographic `’` is forbidden |
| Duplicate keys in fixtures and mocks | Keep the effective last-wins value, so test inputs don't change |
| `ColorSchemeName 'unspecified'` | Mapped to `'light'`. This fixes a latent throw in the template `useThemeColor` (only `explore.tsx` uses it) |
| Removing the Android `contentStyle` | No runtime change; it was never read. The iOS branch is byte-identical. Visual verification isn't needed |

---

## Dependencies

### Internal
- Blocked by: none. FR3–FR8 is rebased after 01–04 (see Release & Merge Order).
- Must merge before spec 05 cuts the build-18 binary (fingerprint coupling, FR3).
- Blocks: 08-expo-sdk-57-scenes, which needs green typecheck and lint at each milestone. 06-dependency-hygiene gates on the typecheck and lint added here once this lands.

### External
- GitHub Actions; branch protection requiring `app-tests` and `server-tests` (strict).
- `@types/node@25.3.5`, already in the lockfile.
- ESLint 9.39.4, `eslint-config-expo` 55.0.0, TypeScript 5.9.3 (installed versions).

### Assumptions
- The `expo lint` default scope (`src/`, `app/`, `components/`) is the lint gate's scope.
- Hermes `TextEncoder` stays available in build 18. Same RN 0.83.2 as the inspected build-17 IPA.
- No one renames `app-tests` or changes branch protection while this spec is in flight.
