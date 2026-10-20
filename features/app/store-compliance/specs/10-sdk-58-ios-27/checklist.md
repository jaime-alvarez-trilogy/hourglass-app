# Implementation Checklist

Spec: `10-sdk-58-ios-27`
Feature: `store-compliance`

**Phases:**
- **Phase A:** SDK 55, FR1–FR3, ending at **checkpoint A**: three gates green, nothing native changed, and one device run of the FR3 tree on an SDK 55 dev client.
- **Phase B:** SDK 58, FR4–FR8. **Checkpoint B** (dev build boots on device) comes at the end of FR4.
- **Phase C:** FR9 local prebuild inspection, with a mandatory `pod install` and Release compile (**checkpoint C**), then FR10 docs.
- **Phase D:** FR11, from build 19 to "ready to submit" (**checkpoint D**), including the TestFlight smoke.

**Ground rules (every phase):**
- Work only in `/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58` on `feat/sdk-58`. Never touch `WS/hourglassws`: its Metro is on port 8081, so this worktree uses `--port 8082`.
  - The single exception, only with J's OK under Decision 16 (a), is one read-only `cp -R` of its gitignored `.appstore/` before FR5.
- EAS **cloud** builds only. Never run `eas build --local`, and never archive or export locally.
- Never run `eas update --channel production` from this branch.
- `main` stays at `aade79b` until build 18's review is resolved **and** checkpoint D passes.
- Never submit to App Review. Stop at "ready to submit" (J's call).
- Never use `--legacy-peer-deps` or `--force`.
- **Every pushed commit is green.**
  - Each FR writes its red tests at its own start, runs them, and records the red list here.
  - Tests and implementation are then committed together once `npm test`, `npm run typecheck` and `npm run lint` all exit 0.
  - Red-only commits, including the `962d413` cherry-pick, stay local until the FR is green.

**Owner tags:** **(C)** Claude, **(J)** Jaime.

**Decisions needing J before the step that uses them** (spec-research Q1/Q1b):
- Decision 3 (icons), Decision 4 (test renderer, incl. the auth-screens rewrite) and Decision 5 (widget fallbacks, the privacy-manifest plugin, the transient placeholder red box): before FR4.
- Decision 10 (iPad (a) vs (b)): before FR5.
- Decision 16 (ASC key access): before FR5.

---

## Phase A.0: Test Foundation (SDK 55)

### FR1: Hotfix lane, dependency guards and release tooling
- [x] (C) Pre-flight:
  - `git status --porcelain` is empty, and `git rev-parse HEAD` is `aade79b` or a spec-only commit on top of it.
  - `node --version` is ≥ 22.13.
  - Record the `npm test`, `npm run typecheck` and `npm run lint` baselines (pass counts, exit codes).
  - Done 2026-10-20: `git status --porcelain` → empty. HEAD `18be018` (two `spec(10-…)` commits on `aade79b`). `node --version` → `v22.17.0`, npm 10.9.2, eas-cli 20.1.0.
  - Baselines: `npm test` → exit 0, 180 suites / 5087 tests passed. `npm run typecheck` → exit 0. `npm run lint` → exit 0, `✖ 499 problems (0 errors, 499 warnings)`.
- [x] (C) `git cherry-pick 962d413` (**once**; it isn't picked again in A.1). That brings `__tests__/config/deps.test.ts` (red). If spec 06's `checklist.md` conflicts, take the incoming version (`git checkout --theirs features/app/store-compliance/specs/06-dependency-hygiene/checklist.md`).
  - Done 2026-10-20 → `1a18a5c`. No conflict (spec 06's `checklist.md` auto-merged).
- [x] (C) Edit `deps.test.ts`:
  - Delete the `FR5: refreshed to the latest SDK 55 patch line` describe.
  - Rewrite FR4 as "contains X iff `patches/X+*.patch` exists" plus "every entry is a direct dependency". An absent list is allowed when there are no patches.
  - Add "`react-native-inner-shadow` is in neither `dependencies` nor `devDependencies`".
  - Done 2026-10-20. FR5 describe deleted. `versionAtLeast` is kept for FR4's SDK 58 floors, with its unit cases moved to a `helpers` describe on SDK 58-style values (`grep -nE "55\.0\.31|0\.83\.10" __tests__/config/deps.test.ts` → nothing).
  - FR4 is the pure `collectExcludeProblems(pkg, patchFiles)`. The top-level package comes from patch-package's own parser (`packageNames[0]`, so a nested `a++b` patch requires `a`). It has 3 real-tree cases and 8 fixtures: no list / empty list with no patches valid, patched-but-missing, exclude-without-patch, not-a-direct-dep, scoped, nested.
  - inner-shadow: `package.json` (both sections) **and** no `node_modules/react-native-inner-shadow` lockfile key. `collectPatchProblems` rules 1–6 and their fixtures are unchanged.
- [x] (C) `ci-gates.test.ts`: every `node-version` is an even major ≥ 22, and at least one exists.
  - Done 2026-10-20: a new `10-sdk-58-ios-27 — FR1` describe with 4 cases: all values even and ≥ 22, with ≥ 1 present; `app-tests` and `server-tests` each set one; and `major()` parses `22`/`22.x`/`22.13.1` and rejects `lts/*`. `jobBlock` was hoisted to module scope (FR8's cases unchanged).
- [x] (C) `__tests__/scripts/ota-publish.test.ts`: the guard accepts build JSON with `runtime.version` and with `runtimeVersion`.
  - Done 2026-10-20: `step 4: both eas-cli build JSON shapes (spec 10 FR1)`, 4 cases:
    - the new shape publishes once;
    - the legacy shape publishes once;
    - a dry run on the new shape names the build;
    - a different `runtime.version` is refused **by name**, which proves the field is actually read.
  - The new-shape fixture mirrors real eas-cli 25.3.0 output (see A.1).
- [x] (C) `app-config.test.ts`: a new `describe('10-sdk-58-ios-27')` block containing only the `eas.json` `cli.version` floor ≥ 25.2.0 case (FR5 and FR6 add the rest).
  - Done 2026-10-20: `eas cli.version floor is >= 25.2.0` parses `>= X.Y.Z` (typed `easJson` import, no `fs`) and asserts it's ≥ 25.2.0, so later bumps still pass.
- [x] (C) Run them. Expect red on:
  - rule 3 (`^55.0.5`), `--error-on-fail`, `@expo/ngrok`, the exclude and inner-shadow;
  - the Node 22 case, both `ota-publish` shapes, and `cli.version`.
  - The fixture and unit cases stay green. Record the counts.
  - **Red, 2026-10-20** (`npx jest <file>` each): 14 failed / 113 passed / 127.
    - `deps.test.ts`: 9 failed / 29 passed / 38.
      - Rule 3 (2): `expo-widgets: declared "^55.0.5" must be exactly "55.0.5"`, and the real-tree `"55.0.5"` case.
      - `--error-on-fail` (1); `@expo/ngrok` (2: package.json `"^4.1.0"` and 15 lockfile keys); inner-shadow (2: `"^1.3.1"` and the lockfile key).
      - Exclude (2): `Expected ["expo-widgets","react-native-reanimated"] Received []`. Both patches exist, so the iff rule needs **both** names.
    - `ci-gates.test.ts`: 1 failed / 20 passed / 21 (`bad: ["20","20"]`).
    - `ota-publish.test.ts`: 3 failed / 41 passed / 44. All three are new-shape cases; the guard read `runtime ""`.
      - The legacy-shape case is green before the change, because that's today's behavior. So only one of the "both shapes" is red, plus the dry-run and by-name cases.
    - `app-config.test.ts`: 1 failed / 23 passed / 24 (`atLeast25_2_0: false` on `">= 18.0.0"`).
    - Every fixture and unit case is green.

### FR2: Forward-compatible navigation, dead code and Skia
- [x] (C) Create `__tests__/config/sdk58-migration.test.ts` with the FR2 cases: no `useIsFocused` from `@react-navigation/native`, no `Skia.Path.Make()`, no `.copy().trim(`, and `components/haptic-tab.tsx` absent.
  - Done 2026-10-20: `describe('10 FR2/FR3/FR4 — source migrations')`, 11 cases. Each file is parsed with the TypeScript compiler (`ts.createSourceFile`), so a comment or string can't hit and a call split across lines can't slip past. The walk sees 150 files.
    - **The walk (3):** at least 50 files, including 6 named known sites (`app/_layout.tsx`, the 3 hook sites, `ScrubCursor.ts`, `AIArcHero.tsx`); nothing from `__tests__`/`__mocks__`/`node_modules`/`*.test.*`; every file parses with 0 syntax errors.
    - **Detector fixtures (4):** `moduleRefs` (named, aliased, namespace, re-export, `require` destructure and member); `useIsFocused` (named, `* as Nav` + `Nav.useIsFocused`, commented-out line ignored); `Skia.Path.Make` (split-line call flagged, `MakeFromSVGString` and comment ignored); copy-then-trim (chain flagged, the pre-FR2 AIArcHero shape flagged, `String.trim()` ignored).
    - **FR2 (4), each with a positive control:** the 3 hook sites import `useIsFocused` from `'expo-router'`; `ScrubCursor.ts` and `AIArcHero.tsx` call `MakeFromSVGString`; no copy-then-trim; `haptic-tab.tsx` is absent and no module imports `…/haptic-tab`.
  - **The copy/trim case is broader than the literal chain.** The pre-FR2 code was `const p = fullSkiaPath.copy(); p.trim(…)` (`AIArcHero.tsx:147-148`), which a literal `.copy().trim(` regex never matches, so that test would be green before the change. The detector also flags `.trim(` on a binding initialized from `.copy()`.
- [x] (C) `ScrubCursor.test.ts`: assert the `MakeFromSVGString` argument for `(scrubX=40, chartHeight=120, topPadding=8)` is `M 40 8 L 40 112`. Remove the `moveTo`/`lineTo` assertions.
  - Done 2026-10-20: `line path construction (10 FR2: MakeFromSVGString)` spies on the shared mock's `Skia.Path.MakeFromSVGString` (it calls through). Cases:
    - exactly `'M 40 8 L 40 112'`, called once;
    - `linePath` is the returned path;
    - the top, bottom and x cases, now as string assertions;
    - new: a `null` parse falls back to `'M 0 0'`.
  - The `scrubX = chartWidth` edge case asserts `'M 300 10 L 300 190'`. The source-contract case requires `Skia.Path.MakeFromSVGString(`. No `moveTo`/`lineTo` assertion is left (`grep -n "linePath.moveTo\|linePath.lineTo"` → nothing). 18 → 19 tests.
- [x] (C) `AIArcHero*.test.tsx`: assert the fill `Path` gets `start={0}` and an `end` that is the sweep shared value.
  - Done 2026-10-20, render-level, in `AIArcHeroSkia.test.tsx`: new describe `AIArcHero — 10 FR2: fill Path trims via start/end props` (5 cases). The mock's `Path` is a function component, so `findAllByType` reads its props.
    - Exactly 2 Paths: the track (`rgba(255,255,255,0.08)`), then the fill (`white`).
    - Fill `start` is `0`.
    - Fill `end` is an object whose `.value` is `0.75`, and `withSpring` was called with `(0.75, { mass: 1, stiffness: 80, damping: 12 })`.
    - After a re-render with `aiPct: 40`, `end` is **the same object**, now with value `0.4`. So it's bound, not recomputed.
    - The fill's `path` is the track's path object, and the track has no `start`/`end`.
  - The file mocks Reanimated as `{ __esModule: true, ...jest.requireActual(…), withSpring: jest.fn(to => to) }`. Real Reanimated keeps shared-value identity, and the official `react-native-reanimated/mock` doesn't: it returns a new Proxy on every render, so it can't prove the binding. 40 → 45 tests.
  - `AIArcHero.test.tsx`: FR1.6 and FR1.7 asserted the old mechanism (`useDerivedValue` and `.trim(` present). They're inverted (no `useDerivedValue(`, no `.trim(`, `start={0}` and `end={sweepProgress}` present). Still 52 tests.
- [x] (C) `src/hooks/__tests__/useStaggeredEntry.test.ts:132-135`: invert to `useIsFocused … from 'expo-router'`, and assert `@react-navigation` is absent.
  - Done 2026-10-20: `/useIsFocused.*from.*['"]expo-router['"]/` plus `not.toContain('@react-navigation')`. The test title says "react-navigation" without the `@`, so the FR2 success-criterion grep (`useIsFocused` + `@react-navigation` on one line) stays empty. Still 66 tests.
- [x] (C) Record the current test counts of `FadeInScreen.test.tsx`, `index.test.tsx`, `indexConeIntegration.test.tsx`, `AITab.test.tsx` and `AITabConeIntegration.test.tsx`. Their mocks move in A.1, and the counts must not change.
  - Baseline 2026-10-20 at `4c355ea` (`npx jest <files> --json`): `FadeInScreen` 20, `index` 61, `indexConeIntegration` 23, `AITab` 60, `AITabConeIntegration` 49. Also `useStaggeredEntry` 66, `ScrubCursor` 18, `AIArcHero` 52, `AIArcHeroSkia` 40 and `HapticTab` 14 (deleted in A.1). All green.
  - Gotcha: jest reads path arguments as regexes, so `(tabs)` is a group. Pass `'app/\(tabs\)/__tests__/…'`.
- [x] (C) Run them. All of the new assertions are red. Record.
  - **Red, 2026-10-20**: 19 failed / 174 passed / 193 across the 5 files.
    - `sdk58-migration.test.ts`: 4 failed / 7 passed / 11. The hits are exactly the known sites: `useIsFocused` at `FadeInScreen.tsx:18`, `useFocusKey.ts:2` and `useStaggeredEntry.ts:29`; `Make()` at `AIArcHero.tsx:131` and `ScrubCursor.ts:42`; copy-then-trim at `AIArcHero.tsx:148`; `haptic-tab.tsx` exists. The header comment `Path.copy().trim(…)` at `AIArcHero.tsx:7` isn't flagged. The walk and fixture cases are green.
    - `ScrubCursor.test.ts`: 8 failed / 11 passed / 19 (`Received number of calls: 0`).
    - `AIArcHero.test.tsx`: 2 failed / 50 passed / 52 (FR1.6, FR1.7).
    - `AIArcHeroSkia.test.tsx`: 4 failed / 41 passed / 45 (`start`/`end` `undefined`, and the fill path isn't the track path). The 2-Paths case is green before the change.
    - `useStaggeredEntry.test.ts`: 1 failed / 65 passed / 66 (the `expo-router` regex).

### FR3: `expo/fetch` readiness
- [ ] (C) Add `makeExpoLikeResponse({ status, body, headers })` to a shared test helper. A second `text()`/`json()` call throws `TypeError("Failed to execute 'text' on 'Response': Response body is already used.")`.
- [ ] (C) Tests in `src/__tests__/api/client.test.ts` and `__tests__/client.test.ts`:
  - Every path (mint OK and error, GET and PUT, each with and without the `creds` retry) passes with the helper.
  - 200 empty, 204 empty, 200 and 204 whitespace-only (`' '`, `'\n'`), and 200 `{}` bodies, for GET and PUT.
  - A 200 `text/html` body → `ApiError` with `statusCode` 200, for GET **and** PUT.
  - `class FetchError extends Error {}` rejection → `NetworkError` with the message preserved.
- [ ] (C) `src/__tests__/lib/pushToken.test.ts`: `registerPushToken` never calls `text()` or `json()` on the response.
- [ ] (C) `sdk58-migration.test.ts`: no `_bodyInit|_bodyText|_bodyBlob` in source.
- [ ] (C) Run them. The non-JSON → `ApiError` and whitespace cases are red; record any others.

## Test Design Validation (MANDATORY), Phase A

⚠️ **Validate test design BEFORE implementing.** Weak tests lead to weak implementation.

> 2026-10-20, FR1-only run: these Phase A boxes cover FR1–FR3 and stay open for the FR3 pass. The FR1 tests got a manual check instead (no validator agent in that run):
> - Every FR1 success criterion has a test or a recorded command.
> - The exclude rule has positive and negative fixtures and can't pass on an empty list while patches exist.
> - The Node case requires ≥ 1 value and a value per job.
> - The ota-publish shape case proves the field is read (the mismatch is refused by name).
>
> 2026-10-20, FR2 run: the boxes stay open as well. Manual check of the FR2 tests:
> - Every FR2 success criterion has a test or a recorded grep.
> - The source walk can't pass vacuously. It asserts ≥ 50 files (150 today), the named known sites, and 0 parse errors. Each ban has a positive control on real files, plus fixtures that prove its detector fires.
> - The copy/trim detector was widened so it is red on the real pre-FR2 code.
> - The Skia mock change was shown to turn leftover mutation into a failing test (32 `is not a function` failures against the old implementation).

- [ ] Run the `red-phase-test-validator` agent on `deps.test.ts`, `ci-gates.test.ts`, `ota-publish.test.ts`, `sdk58-migration.test.ts`, the ScrubCursor, AIArcHero and useStaggeredEntry tests, and the client tests.
- [ ] Every FR1–FR3 success criterion has a test, or a recorded command check.
- [ ] The source-walk tests can't pass vacuously. Each one asserts that the walk visited at least 50 files and found the known-good sites (e.g. `app/_layout.tsx`).
- [ ] `makeExpoLikeResponse` really throws on a second read: a self-test calls `text()` twice and expects the `TypeError`.
- [ ] Fix any issues before proceeding.

---

## Phase A.1: Implementation (SDK 55)

### FR1
- [x] (C) `git tag build-18 aade79b && git branch release/1.1 aade79b && git push origin build-18 release/1.1`. Record `git rev-parse build-18 release/1.1`.
  - Done 2026-10-20. The push printed `* [new tag] build-18 -> build-18` and `* [new branch] release/1.1 -> release/1.1`.
  - `git rev-parse build-18 release/1.1` → `aade79b5db85e4d90e2963c8836fe43401ab262a` twice. `git ls-remote origin build-18 release/1.1` showed both at `aade79b…`. (`build-18` is a lightweight tag.)
  - After the ota-publish cherry-pick below, `release/1.1` is `7b0e328`: `git merge-base aade79b release/1.1` → `aade79b`, and `git rev-list --count aade79b..release/1.1` → 1. `build-18` stays `aade79b` on origin.
- [x] (C) `git cherry-pick 96035ea` (**only** this one; `962d413` was picked in A.0).
  - Resolve the `package.json` conflict by hand, keeping `typecheck`/`lint` and adding the strict `postinstall`.
  - For spec 06's `checklist.md`, take the incoming version.
  - Regenerate the lockfile with `npm install` instead of resolving it by hand.
  - Done 2026-10-20 → `7384790`.
    - The only conflict was `package.json` `scripts`. Resolved to `typecheck: "tsc --noEmit"` + `postinstall: "patch-package --error-on-fail --error-on-warn"`. `lint` was untouched.
    - Spec 06's `checklist.md` and the lockfile auto-merged with no conflict.
    - `npm install` → exit 0, `removed 31 packages`, `expo-widgets@55.0.5 ✔`, `react-native-reanimated@4.2.1 ✔`. The npm-written lockfile is byte-identical to git's merge result.
- [x] (C) Remove `react-native-inner-shadow` (`npm uninstall react-native-inner-shadow`) and `git rm __mocks__/react-native-inner-shadow.ts`.
  - Done 2026-10-20. Pre-check: `grep -rn inner-shadow app src components hooks constants` → comments and negative tests only (GlassCard), zero imports. `node_modules/react-native-inner-shadow` has no podspec and no `ios/`, and no lockfile package depends on it.
  - `npm uninstall` → exit 0, `removed 1 package`. The mock is deleted.
  - **Also:** `expo.install.exclude` gains `react-native-reanimated`. `patches/react-native-reanimated+4.2.1.patch` exists, so the FR4 iff rule requires it (96035ea only listed `expo-widgets`). It's now `["expo-widgets","react-native-reanimated"]`.
  - Lockfile vs `aade79b`: 0 version changes, 41 keys removed (40 `@expo/ngrok` + transitive, 1 inner-shadow). The native surface equals build 18's.
- [x] (C) `rm -rf node_modules && npm ci`. Exit 0, both patches listed as applied, no warnings.
  - Done 2026-10-20: exit 0 and `added 1178 packages`. `patch-package --error-on-fail --error-on-warn` printed `expo-widgets@55.0.5 ✔` and `react-native-reanimated@4.2.1 ✔`, with no patch-package warnings. (npm also prints 12 upstream `npm warn deprecated` registry notices for transitive packages. `release/1.1`'s tree prints 13.)
  - **Environment workaround, used for every clean install in FR1.** The first plain `npm ci` stalled in `@shopify/react-native-skia`'s postinstall `scripts/install-skia.mjs`. It was downloading the 685 MB m144c prebuilt binaries from GitHub's CDN at ~30 KB/s, an ETA of hours, so it was killed after ~12 min.
    - Clean installs run as `rm -rf node_modules && SKIP_SKIA_DOWNLOAD=1 npm ci` (the script's own skip switch). Then `libs/` is APFS-cloned (`cp -cR`) from `hg-worktrees/release18/node_modules/@shopify/react-native-skia/libs`, and `diff -rq` → identical (685M).
    - The source is the same Skia 2.4.18 / m144c with the same lockfile integrity, produced by the same postinstall.
    - Helper: `/tmp/sdk58-tools/clean-ci.sh` (ephemeral). Jest mocks Skia, so the tests never read `libs/`.
    - SDK 58's Skia 2.14 needs its own download in FR4. Expect the same slowness, and plan for it.
- [x] (C) `.github/workflows/test.yml`: `node-version: '22'` in both jobs.
  - Done 2026-10-20: both `'20'` → `'22'`. The step order is unchanged (SC8.2 green).
- [x] (C) `scripts/ota-publish.sh:86-95`: read `(b.runtime && b.runtime.version) ?? b.runtimeVersion`. FR1 tests green. Commit.
  - Done 2026-10-20: `const rtv = (b.runtime && b.runtime.version) ?? b.runtimeVersion;` feeds the `build_rtv` field. `bash -n` OK.
  - Green: `deps.test.ts` 38/38, `ci-gates.test.ts` 21/21, `ota-publish.test.ts` 44/44.
  - With only the red `cli.version` case stashed: `npm test` 0 (181 suites / 5133 tests), `npm run typecheck` 0, `npm run lint` 0 (0 errors, 499 warnings).
  - Commits: `f077a17` `chore(10-sdk-58-ios-27): FR1 adapt dependency guards, drop inner-shadow, CI on Node 22` and `c7d4c60` `fix(10-sdk-58-ios-27): ota-publish.sh reads runtime.version from eas-cli >= 22 JSON`. The second touches only the script and its test, so it cherry-picks cleanly.
- [x] (C) Cherry-pick to `release/1.1`, inside this worktree:
  - `git switch release/1.1 && git cherry-pick <sha> && rm -rf node_modules && npm ci && npm test`.
  - `git push origin release/1.1`.
  - `git switch feat/sdk-58 && rm -rf node_modules && npm ci`.
  - **Record no runtime value before this last `npm ci` finishes.**
  - Record the `release/1.1` test result and `git log release/1.1 --oneline -1 -- scripts/ota-publish.sh`.
  - Done 2026-10-20, in place (no extra worktree).
    - `git cherry-pick -x c7d4c60` → `7b0e328`. The amend before pushing only moved the `(cherry picked from …)` line above the trailer. It changes `scripts/ota-publish.sh` and its test only.
    - Clean `npm ci` on `release/1.1` (Skia workaround above): exit 0, plain `patch-package` printed both ✔.
    - **`release/1.1` `npm test` → exit 0, 180 suites / 5091 tests**: build 18's 5087 plus the 4 new shape cases.
    - `git push origin release/1.1` → `aade79b..7b0e328`. `git log release/1.1 --oneline -1 -- scripts/ota-publish.sh` → `7b0e328 fix(10-sdk-58-ios-27): ota-publish.sh reads runtime.version from eas-cli >= 22 JSON`.
    - Then `git switch feat/sdk-58` and a clean `npm ci`: exit 0, strict postinstall, both ✔.
    - No runtime value was resolved or recorded in FR1. FR8 records the baseline.
- [x] (C) `npm i -g eas-cli@latest`. Record `eas --version` (≥ 25.2.0). Set `eas.json` `cli.version` to `">= 25.2.0"`.
  - Done 2026-10-20, after the cherry-pick. `npm i -g eas-cli@latest` → exit 0. `eas --version` → `eas-cli/25.3.0 darwin-arm64 node-v22.17.0`. `eas.json` `cli.version` changed `">= 18.0.0"` → `">= 25.2.0"`, and `eas config --platform ios --profile production --json --non-interactive` → exit 0 (the CLI accepts the floor).
  - `eas build:list --help` still has `--platform`, `--status`, `--channel`, `--runtime-version`, `--limit`, `--json` and `--non-interactive`, so the script's argv is valid.
  - Shape check, read-only: `eas build:list --platform ios --status finished --channel production --limit 2 --json --non-interactive`.
    - Build objects have `runtime: {id, version}` and `updateChannel: {id, name}`, and **no** `runtimeVersion`. `appVersion` and `appBuildVersion` are unchanged.
    - The guard expression on the newest build (`05e37eef-9a8a-47ef-bcee-f37be3aebad9`, 1.1.0 (18), `gitCommitHash` `aade79b`) reads `1f59138f04a4a284c1956c0fdb6bb0e74dc8dcdb`.
    - The test fixture was updated to match (`31d46fa`). `release/1.1` keeps the first fixture, which differs only in `updateChannel` being a string; the script never reads it.
  - Commit `abe73a2` `chore(10-sdk-58-ios-27): FR1 eas.json cli.version >= 25.2.0`.
- [ ] (J) **ITMS-91053 baseline (before FR4 starts).** In the App Store Connect processing emails for builds 17 and 18, search for `ITMS-91053`. Record "none", or each binary and API category listed:
  - Build 17: pending (J). J is checking the processing emails (2026-10-20).
  - Build 18: pending (J). J is checking the processing emails (2026-10-20).
  - Must be filled in before FR4 starts.
- [x] (C) `npx expo install --check` exits 0. Three gates green. `deps.test.ts`, `ci-gates.test.ts`, `ota-publish.test.ts` and the `cli.version` case are green. Record.
  - Final FR1 run, 2026-10-20 at `31d46fa`:
    - `npm test` → **exit 0**, 181 suites / 5134 tests: baseline 5087 + 38 deps + 4 ci-gates + 4 ota-publish + 1 cli.version.
    - `npm run typecheck` → **exit 0**.
    - `npm run lint` → **exit 0**, `✖ 499 problems (0 errors, 499 warnings)`, the same as baseline, with none in the 4 touched test files.
    - The four FR1 files: `deps.test.ts` 38/38, `ci-gates.test.ts` 21/21, `ota-publish.test.ts` 44/44, `app-config.test.ts` 24/24.
  - **`npx expo install --check` → exit 1. Recorded, not fixed.**
    - The exclude works: the first line is `Skipped checking dependencies: expo-widgets and react-native-reanimated. These dependencies are listed in expo.install.exclude in package.json.`
    - The failure is the 25-package SDK 55 patch-line drift that already exists at `aade79b`, for example `expo@55.0.7 - expected version: ~55.0.31` and `react-native@0.83.2 - expected version: 0.83.10`. The lockfile has 0 version changes vs `aade79b`, so build 18 gives the identical list minus the skip line.
    - Clearing it would mean `npx expo install --fix` on SDK 55. That's spec 06 FR5, which this spec drops (spec-research Problem Context, Research Corrections 6). It would also change native versions, against checkpoint A's "nothing native changes" (Decision 2).
    - The criterion is reachable only after FR4's SDK 58 install, and FR4's own `--check` success criterion covers it.

### FR2
- [x] (C) `useIsFocused` from `'expo-router'` at `FadeInScreen.tsx:18`, `useFocusKey.ts:2` and `useStaggeredEntry.ts:29`.
  - Done 2026-10-20: three one-line import changes. On SDK 55, expo-router 55.0.7's `useIsFocused` is a re-export of `@react-navigation/native`'s (`node_modules/expo-router/build/useIsFocused.js`), so runtime behavior is identical.
- [x] (C) Test mocks:
  - In `app/(tabs)/__tests__/index.test.tsx:54`, `indexConeIntegration.test.tsx:45`, `src/components/__tests__/AITab.test.tsx:168` and `AITabConeIntegration.test.tsx:160`, move the `useIsFocused` stub into the existing `expo-router` mock and delete the `@react-navigation/native` mock.
  - In `FadeInScreen.test.tsx:22-24`, replace the `requireActual('@react-navigation/native')` mock with `jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }))`.
  - Confirm each file's test count is unchanged.
  - Done 2026-10-20. Each existing `expo-router` mock gained `useIsFocused: () => true`, and the four `@react-navigation/native` mocks are deleted. Three of them also stubbed `useNavigation`/`useRoute`; those went too, because no source file calls either (`grep -rn "useNavigation\|useRoute" app src components` → only `useRouter`). `FadeInScreen.test.tsx` now has exactly the spec's mock, and its header note was updated.
  - Counts unchanged: `FadeInScreen` 20, `index` 61, `indexConeIntegration` 23, `AITab` 60, `AITabConeIntegration` 49, `useStaggeredEntry` 66.
  - `grep -rn "useIsFocused" app src components | grep "@react-navigation"` → nothing (the pipeline exits 1).
- [x] (C) `git rm components/haptic-tab.tsx src/components/__tests__/HapticTab.test.tsx`.
  - Done 2026-10-20. Pre-check: `grep -rn "haptic-tab\|HapticTab" app src components hooks constants` → only the `app/(tabs)/_layout.tsx:12` comment ("HapticTab removed") and `native-tabs.test.tsx`'s negative assertions, all still valid.
- [x] (C) Skia sites:
  - `ScrubCursor.ts` → `MakeFromSVGString`.
  - `AIArcHero.tsx:146-150` → `<Path start={0} end={sweepProgress}>`, with the `useDerivedValue` trim removed.
  - `AIArcHero.tsx:131` fallback → `?? Skia.Path.MakeFromSVGString('M 0 0')!`.
  - Done 2026-10-20.
    - **`ScrubCursor.ts`:** `const linePath: SkPath = Skia.Path.MakeFromSVGString(\`M ${scrubX} ${topPadding} L ${scrubX} ${chartHeight - topPadding}\`) ?? Skia.Path.MakeFromSVGString('M 0 0')!`. The only caller is `AIConeChart.tsx:329` (`handleScrubIndex`, on the JS thread via `runOnJS`), so no worklet builds the string.
    - **`AIArcHero.tsx`:** the `useDerivedValue` copy/trim is deleted. The fill is `<Path path={fullSkiaPath} start={0} end={sweepProgress} …>`, with stroke, cap, color and the `SweepGradient` child unchanged. The `:131` fallback is changed as specified.
    - The Reanimated import is now `{ useSharedValue, withSpring }`: `useDerivedValue` and the unused default `Animated` are dropped. The header comments describe the new mechanism.
    - **Types:** `PathProps.end` is `AnimatedProp<number>` (`number | { value: number }`, Skia 2.4.18 `Animations.d.ts`), so the shared value type-checks.
    - **Same behavior on 2.4.18:** its `drawPath` (`sksg/Recorder/commands/Drawing.js:158-186`) clamps `start`/`end` to [0, 1], then runs `copy()` + `trim(start, end, false)` natively. That's the old worklet's trim, plus clamping for spring overshoot.
- [x] (C) Skia mock: add `MakeFromSVGString` and remove `moveTo` from the path stub.
  - Done 2026-10-20. `MakeFromSVGString` already returned a path stub (only its comment changed). `makeMockPath()` drops `moveTo`, **`lineTo` and `trim`**: all three are verified gone from `SkPath` in 2.14.0 (spec-research F2.4), so the mock matches the target API. The other stub methods are unverified, so they stay.
  - **Proof it catches leftover mutation:** the pre-FR2 `AIArcHero.tsx` and `ScrubCursor.ts` were restored temporarily (`git show HEAD:…`) against the new mock and tests. Result: 32 failures, every one `linePath.moveTo is not a function` or `p.trim is not a function`. Then the new files were put back.
  - **Collateral fix (not in the spec's file list):** `AIConeChart.test.tsx` SC2.1 and SC3.2 called `moveTo`/`lineTo` `.mockImplementation`/`.mockClear` on mock paths. Nothing asserted on those calls, because `buildActualPath` returns an SVG string. The dead lines were removed, SC3.2's title dropped "(moveTo called, no lineTo)", and the assertions are unchanged. Still 126 tests (`grep -cE "^\s*it\("` HEAD = now = 126).
- [x] (C) FR2 tests green. Three gates green.
  - Done 2026-10-20, final tree:
    - `npm test` → **exit 0**, 181 suites / 5137 tests. That's FR1's 5134, minus 14 (`HapticTab`), plus 11 (`sdk58-migration`), 1 (`ScrubCursor`) and 5 (`AIArcHeroSkia`).
    - `npm run typecheck` → **exit 0**.
    - `npm run lint` → **exit 0**, `✖ 490 problems (0 errors, 490 warnings)`. FR1 had 499. The −9 are `HapticTab.test.tsx` −3 (deleted), `AIArcHero.tsx` −1 (unused `Animated`) and `AIConeChart.test.tsx` −5 (the dead spies). Per-file counts against `HEAD` (`git show HEAD:<f> | npx eslint --stdin`) rose in no touched file, and `sdk58-migration.test.ts` has 0.
    - FR2 files: `sdk58-migration` 11/11, `ScrubCursor` 19/19, `AIArcHero` 52/52, `AIArcHeroSkia` 45/45, `AIConeChart` 126/126, plus the six count-locked files above.
  - Nothing native changed: `git diff aade79b -- app.json` → empty, and FR2 doesn't touch `package.json` or `eas.json`. These JS changes are never OTA'd to 1.1.x from this branch.
  - Commit `62df574` `refactor(10-sdk-58-ios-27): FR2 useIsFocused from expo-router, version-neutral Skia paths, drop haptic-tab`: tests and implementation together, green on all three gates. The red phase stayed local and was never committed on its own.

### FR3
- [ ] (C) `parseBody`:
  - `text.trim() === ''` → `undefined`.
  - Otherwise wrap `JSON.parse` and throw `ApiError(response.status, 'Invalid JSON response body')` on failure.
  - Update the doc comment with why PUTs also get `ApiError` (captive portal / proxy 200 HTML; `useApprovalItems.ts:155-162` refetches).
- [ ] (C) Fix any path the single-read helper exposes; none is expected.
- [ ] (C) FR3 tests green. Three gates green.

### Checkpoint A
- [ ] (C) Record:
  - HEAD, and the `npm test`/`typecheck`/`lint` counts and exit codes.
  - `git diff aade79b -- app.json` is empty, and `git diff aade79b -- eas.json` shows only `cli.version` (nothing native changed).
- [ ] (J/C) **Device run on SDK 55 (Decision 2).**
  - Dev client: an existing SDK 55 dev build (J: which one? ______), or `eas build -p ios --profile development` on this tree (`auto` → `sdk-55` image; build id ______).
  - `npx expo start --dev-client --port 8082` from this worktree. Confirm `lsof -i :8081` still shows the WS server untouched.
  - Results:
    - `AIArcHero` sweep animates to the right %: ______
    - Overview/Trend scrub-cursor line draws and follows the finger: ______
    - `FadeInScreen` / `useStaggeredEntry` entry animations on tab focus: ______
    - One approve and one reject on QA succeed (empty-body PUTs, no error): ______
- [ ] (C) Push `feat/sdk-58` (all of Phase A is green).

## Phase A.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` for FR1–FR3.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` on the Phase A commits.

### Step 2: Address Feedback
- [ ] Fix HIGH/MEDIUM findings, re-run the tests, and record the commits.

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` on the new and modified tests.

### Final Verification
- [ ] Three gates green. No regressions against the pre-flight baseline.

---

## Phase B.0: Test Foundation (FR4 only)

Only FR4's tests are written here. FR5–FR8 write their red tests at the start of their own FR (ground rules), so no red test ever sits on a green tree.

### FR4
- [ ] (C) `deps.test.ts` `SDK 58 line` describe:
  - Floors: `expo` major ≥ 58 with no prerelease; RN `0.N` with N ≥ 88; `expo-widgets` and `@expo/ui` major equal to `expo`'s; reanimated ≥ 4.7.1 and worklets satisfies `0.13.x`; Skia ≥ 2.14.0; victory major ≥ 42.
  - `@expo/ui` is a direct dependency.
  - async-storage is exactly `2.2.0`.
  - `react-test-renderer` equals `react`; `@react-native/jest-preset` `0.N` equals RN's.
  - Single copies of `react`, `react-native`, `expo-widgets`, `@expo/ui`, `test-renderer` and `react-native-css-interop`.
  - css-interop equals nativewind's dependency spec.
  - No `@react-navigation/*` and no `patches/*.patch`.
- [ ] (C) `sdk58-migration.test.ts` FR4 cases:
  - no `from '@react-navigation/`, no `unstable-native-tabs`, no root `Tabs` import from `'expo-router'`, no `initialRouteName=`;
  - `(auth)` `unstable_settings.anchor === 'welcome'`;
  - a second walk over test files finds no `jest.mock('@react-navigation/` or `requireActual('@react-navigation/`.
- [ ] (C) `native-tabs.test.tsx`: expect `expo-router/native-tabs` and `expo-router/js-tabs`, and the absence of `unstable-native-tabs`.
- [ ] (C) `FloatingPillTabBar.test.ts:310-314`: expect `from 'expo-router/js-tabs'`, and the absence of `@react-navigation/bottom-tabs`.
- [ ] (C) Record the current test counts of `__tests__/auth-screens.test.tsx` and `app/__tests__/layout-notifications.test.tsx`. Both are rewritten in B.1 and must keep their counts.
- [ ] (C) Run the FR4 set and record the red list by test name.

## Test Design Validation (MANDATORY), Phase B

- [ ] Run `red-phase-test-validator` on every Phase B.0 test file. Run it again at the start of FR5, FR6 and FR8 on that FR's new tests.
- [ ] Every floor is a floor, not a window: no case fails on SDK 59 just because the number rose.
- [ ] Single-copy checks read lockfile keys (`node_modules/*/node_modules/<pkg>`), not `npm ls` output.
- [ ] The widget-plugin fixture (FR6) is the real 58.0.21 template text, not paraphrased.
- [ ] `app-config.test.ts` uses typed JSON imports only (spec 03 contract) and reads optional keys with `toHaveProperty`.
- [ ] Fix any issues before proceeding.

---

## Phase B.1: Implementation (SDK 58)

### FR4: dependency line (atomic; one commit once green)
- [ ] (C) `git rm patches/expo-widgets+55.0.5.patch patches/react-native-reanimated+4.2.1.patch`. Remove `expo.install.exclude`.
- [ ] (C) **Write every I1 range into `package.json` first:**
  - `expo ~58.0.16`, every bundled `expo-*` and RN package, `@expo/ui ~58.0.21` (new direct), `expo-widgets ~58.0.21`.
  - The non-bundled packages.
  - Every devDependency: RNTL 14, `test-renderer 1.3.0`, Jest 30, `jest-expo ~58.0.11`, `@react-native/jest-preset 0.88.0`, `react-test-renderer 19.3.0`, TS/ESLint.
  - Remove `@react-navigation/native`, `@react-navigation/bottom-tabs` and `@react-navigation/elements`.
- [ ] (C) **Then** one `npm install`. Record its summary. On ERESOLVE, fix the conflicting range; never `--force`.
- [ ] (C) **Then** `npx expo install --check`, and `npx expo install --fix` for bundled drift, until `--check` exits 0. Record each run and any drift against I1. Never start with `npx expo install expo@~58.0.16`.
- [ ] (C) 58-only edits:
  - `app/_layout.tsx:6` → `'expo-router'`.
  - `FloatingPillTabBar.tsx:18` → `'expo-router/js-tabs'`.
  - `app/(tabs)/_layout.tsx:23` → `'expo-router/native-tabs'`; `:24` → `'expo-router/js-tabs'`.
  - `app/(auth)/_layout.tsx`: drop `initialRouteName`, add `export const unstable_settings = { anchor: 'welcome' };`.
- [ ] (C) Optionally run the codemod, then `grep -rn "@react-navigation" app src components hooks constants __tests__ __mocks__`. Nothing may remain.
- [ ] (C) `app/__tests__/layout-notifications.test.tsx`:
  - Add `DarkTheme`, `DefaultTheme` and the `ThemeProvider` passthrough to its `expo-router` mock (`:84-97`).
  - Delete the `@react-navigation/native` mock (`:103-110`).
  - The test count is unchanged.
- [ ] (C) `src/__tests__/hooks/useWidgetSync.test.ts`: `await` `renderHook`/`rerender`/`unmount`.
- [ ] (C) **Rewrite `__tests__/auth-screens.test.tsx` onto host queries (Decision 4):**
  - Replace all 73 `UNSAFE_*` calls (71 lines) with `getByText` / `getByRole` / `getByPlaceholderText` / `getByTestId`.
  - Add `testID`s in `app/(auth)/*.tsx` only where nothing else fits, and list them.
  - `await` every `render`, `fireEvent.*` and `act`.
  - `grep -c UNSAFE_` → 0. The test count equals the B.0 record.
- [ ] (C) `jest.config.js`: add `standard-navigation` to the allow-list, and add `/node_modules/react-native-reanimated/plugin/` and `/node_modules/@react-native/babel-preset/` as extra `transformIgnorePatterns` entries.
- [ ] (C) `babel.config.js:19-22`: rewrite the comment (no reanimated-patch reference).
- [ ] (C) Fix typecheck fallout: Strict TS API, TS 6, `jsx: react-jsx`. Record the error count before fixing. If it's over 60, use the escape hatch and record a dated follow-up.
- [ ] (C) **Lint fallout (Decision 12).**
  - Right after the install, record `npx expo lint -f json` error counts per rule: ______
  - Fix the local, behavior-neutral cases (e.g. `app/(tabs)/index.tsx:201` `new Date()` in render).
  - If more than 30 errors remain, or a fix would change behavior, turn off only the named `react-hooks/<rule>` entries in `eslint.config.js`, each with a dated `TODO(2026-12-31, spec-10 follow-up)`. Never turn off `rules-of-hooks` or `exhaustive-deps`.
  - Record the rules turned off: ______
- [ ] (C) `rm -rf node_modules && npm ci`. Exit 0 and `No patch files found`. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` prints nothing.
- [ ] (C) Gates, with **no allowed failures**: `npm test` 0, `npm run typecheck` 0, `npm run lint` 0, and `(cd server && npm ci && npm test)` 0. Commit and push.

### Checkpoint B (device)
- [ ] (C) `eas build -p ios --profile development` on cloud. Record:
  - the build id;
  - the image line from "Spin up build environment";
  - every `[Expo-precompiled]` line from "Install pods": ______
- [ ] (C) If `pod install` or the `ExpoWidgetsTarget` link fails because of precompiled modules, record the failing line, apply the Decision 9 fallback (`["expo-build-properties", { "ios": { "usePrecompiledModules": false } }]`), and rebuild.
- [ ] (J) Install it on the iOS 27 iPhone. Record the iOS version: ______
- [ ] (C) `npx expo start --dev-client --port 8082` from this worktree. Confirm `lsof -i :8081` still shows the WS server untouched.
- [ ] (J/C) Cold launch → sign in with the QA manager account → Home, Overview, AI and Requests each render. Record pass/fail per tab. A widget placeholder is expected until FR6.
- [ ] (C) Record `(cd server && npm test)` again on this tree.

### FR5
- [ ] (J) Decision 16 (ASC key access) chosen: ______. Under (a): `cp -R "<main checkout>/.appstore" .appstore`, then `git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8` succeeds and `git status --porcelain` shows nothing new.
- [ ] (J) Decision 10 (iPad (a) / (b)) chosen: ______
- [ ] (C) **Red first:** in `app-config.test.ts`'s `describe('10-sdk-58-ios-27')`, add every Interface Contracts case except `cli.version` (FR1) and the two plugin-order cases (FR6). The `expo-build-properties` case allows only the exact Decision 9 fallback entry. Add `sdkVersion` starts with `58.` and `UIRequiresFullScreen === false` (or `true` under Decision 10 (b)) to `app-config-introspect.test.ts`. Run them and record the red list.
- [ ] (C) `app.json`: `version` `1.2.0`, `ios.buildNumber` `"19"`.
  - Confirm the next unused number with `node .appstore/asc.js builds` from this worktree; otherwise record "blocked: ASC key access" and take 19.
  - No scene or deployment-target keys. `requireFullScreen` only under Decision 10 (b).
- [ ] (C) `package.json` `version` `1.2.0`. `npm install --package-lock-only` updates the lockfile root.
- [ ] (C) `eas.json` `build.production.ios.image = "macos-tahoe-26.6-xcode-27.1"`. Re-check docs.expo.dev/build-reference/infrastructure first and record the row. The Xcode build should be 27A9275 = Xcode 27.1 GA.
- [ ] (C) FR5 tests green. Record the `npx expo config --type introspect --json` values. Three gates green. Commit.

### FR6
- [ ] (C) **Red first:**
  - `widgetLayoutJs.test.ts`:
    - `props` undefined doesn't throw, for every family.
    - `containerBackground('#0D0D1A','widget')` is on the small, medium and large roots and not on accessories.
    - Every `HStack({`/`VStack({` sets `spacing`.
    - The `env.date` countdown is used.
    - Every called global exists in `jest.requireActual('@expo/ui/swift-ui')` (+ modifiers).
  - `__tests__/config/widget-background-plugin.test.ts`: fixture copied verbatim from `expo-widgets@58.0.21` `plugin/src/ios/withWidgetSourceFiles.ts:355-364`. Cases: inserts once, idempotent, throws without the anchor, and app.json plugin order.
  - `__tests__/config/widget-privacy-plugin.test.ts` (I10):
    - Exactly the four reasons; empty collected-data and tracking-domain lists; the XML parses.
    - The `xcode` fixture project gets a Resources phase plus one `PrivacyInfo.xcprivacy` build file, and a second run is a no-op.
    - A missing target throws.
    - The plugin is listed immediately before `withHourglassWidgetBackground`.
  - `deps.test.ts`: `expo.autolinking.android.exclude` contains `expo-widgets`.
  - `bridge.test.ts`/`clearWidgetData.test.ts`: `createWidget` is called with 3 args, the 3rd being the signed-out snapshot.
  - Run them and record the red list.
- [ ] (C) `bridge.ts`: changes (a)–(e), the `requireOptionalNativeModule` import from `'expo'`, and the widened `CreateWidget` type. Move the `jest.mock` in `clearWidgetData.test.ts:31`.
- [ ] (C) Delete the ambient `declare module 'expo-widgets'` block (`src/types/modules.d.ts:50-61`). Fix any call that doesn't match the shipped types.
- [ ] (C) Create `plugins/withHourglassWidgetBackground.js` (I7) and `plugins/withHourglassWidgetPrivacyManifest.js` (I10). List them in `app.json` as `…, "./plugins/withHourglassWidgetPrivacyManifest", "./plugins/withHourglassWidgetBackground", ["expo-widgets", {…}], …`.
- [ ] (C) Add `package.json` `expo.autolinking.android.exclude: ["expo-widgets"]`.
- [ ] (C) `npx expo-modules-autolinking resolve -p android | grep -c expo-widgets` → `0`. `-p apple` → ≥ 1.
- [ ] (C) FR6 tests green. Three gates green. Commit.

### FR7: device pass (EAS development build of the FR6 tree)
- [ ] (C) New `eas build -p ios --profile development`. Record the id and the `[Expo-precompiled]` lines (compare them with checkpoint B).
- [ ] (J/C) Device table. Record PASS/FAIL, with a note and a screenshot where useful.

| Area | Check | Result |
|---|---|---|
| Gestures | Approvals swipe-approve and swipe-reject (QA items); the threshold feels like build 18 | |
| Gestures | Overview chart scrub; AI cone scrub; no RootView error on any screen or in the Settings modal | |
| Reanimated | Entry animations (`FadeInScreen`, `useStaggeredEntry`); no `sharedTransitionTag` warning in Metro logs | |
| Skia | `AIArcHero` sweep animates to the right %; `AnimatedMeshBackground` loops; `GlassCard` inner shadow | |
| Victory 42 | `WeeklyBarChart`, `TrendSparkline` + scrub cursor line, `AIConeChart`, `AIRingChart`, `DayPatternChart`, `HourlyPatternCard`, `DailyAIRow` match the build-18 screenshots | |
| NativeWind | `className` layout on Home, Overview, AI, Requests, Settings and the auth screens | |
| Widgets | Small, medium and large added fresh: dark background, no gaps in the footer text runs, data shown | |
| Memory | 10 min of tab switching with charts animating. 1 min: ____ MB; 10 min: ____ MB; ratio ≤ 1.5 | |

- [ ] (C) For each fix: add a regression test (or a before/after screenshot pair), then re-run the three gates.
- [ ] (C) Optional experiment: remove the `metro.config.js` jsx-runtime redirect on a scratch commit, check NativeWind styles, record the result, then **revert**.

### FR8
- [ ] (C) **Red first:** `fingerprint-config.test.ts`: `EXPECTED_SOURCE_SKIPS` is the 7 sorted names. Record red.
- [ ] (C) `fingerprint.config.js`: the 7 names, with the header comment rewritten. Test green. Commit.
- [ ] (C) `rm -rf node_modules && npm ci` on `feat/sdk-58`, then run `npx expo-updates runtimeversion:resolve --platform ios` twice on a clean tree. The values are equal. Record: ______
- [ ] (C) Open a **draft** PR `feat/sdk-58` → `main` and confirm CI is green on both jobs. Record the run URL. Don't merge.

## Phase B.2: Review (MANDATORY)

### Step 0: Spec-Implementation Alignment
- [ ] Run `spec-implementation-alignment` for FR4–FR8 against I1–I3, I6–I8 and I10.

### Step 1: Comprehensive PR Review
- [ ] Run `pr-review-toolkit:review-pr` on the draft PR.

### Step 2: Address Feedback
- [ ] Fix HIGH/MEDIUM findings and re-run the gates.

### Step 3: Test Quality Optimization
- [ ] Run `test-optimiser` on the Phase B tests.

### Final Verification
- [ ] Three gates green locally and in CI. `npx expo install --check` exits 0. No `patches/*.patch` files.

---

## Phase C: Inspection and Docs

### FR9: local prebuild inspection (checkpoint C)
- [ ] (C) Record `git status --porcelain` in the worktree (it must be identical at the end of FR9).
- [ ] (C) Make the scratch copy:
  - `T=$(mktemp -d) && cp -cR "/Users/Trilogy/Documents/Claude Code/hg-worktrees/sdk58" "$T/app" && rm "$T/app/.git"`. The `.git` file is a gitdir pointer into the off-limits checkout.
  - `git -C "$T/app" init -q && git -C "$T/app" add -A && git -C "$T/app" commit -qm scratch`.
  - Confirm `$T` has no spaces.
- [ ] (C) `cd "$T/app" && npx expo-updates runtimeversion:resolve --platform ios`, **before** prebuild. Record: ______
- [ ] (C) `cd "$T/app" && npx expo prebuild --platform ios --clean --no-install 2>&1 | tee "$T/prebuild.log"`. Record every warning. None may mention `enableSceneSupport` or `requireFullScreen`.
- [ ] (C) I4 checks (paste each output):
  - [ ] `plutil -extract UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes raw ios/Hourglassxo/Info.plist` → `false`
  - [ ] `plutil -extract UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication.0.UISceneDelegateClassName raw ios/Hourglassxo/Info.plist` → `$(PRODUCT_MODULE_NAME).SceneDelegate`
  - [ ] `UILaunchStoryboardName` → `SplashScreen`; `UIBackgroundModes` → only `remote-notification`; no `NSFaceIDUsageDescription`; `UIRequiresFullScreen` → `false` and `UISupportedInterfaceOrientations~ipad` has 4 entries (Decision 10 (b): `true`, portrait entries only or the key absent)
  - [ ] `grep -n "class SceneDelegate: ExpoAppSceneDelegate" ios/Hourglassxo/SceneDelegate.swift`
  - [ ] `grep -n "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider" ios/Hourglassxo/AppDelegate.swift`
  - [ ] `grep -o "IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*" ios/*.xcodeproj/project.pbxproj | sort -u` shows only values ≥ 16.4; `cat ios/Podfile.properties.json` has no lower target
  - [ ] Both `.entitlements` files list `group.com.jalvarez0907.hourglass.widgets`
  - [ ] `grep -c "1C8F.1" ios/Hourglassxo/PrivacyInfo.xcprivacy` ≥ 1, and the manifest diff against build 18's config is empty
  - [ ] `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` exists. `grep -c` finds each of `CA92.1`, `1C8F.1`, `C617.1` and `35F9.1`. `grep -n "PrivacyInfo.xcprivacy in Resources" ios/*.xcodeproj/project.pbxproj` includes an entry in the `ExpoWidgetsTarget` Resources phase
  - [ ] `plutil -extract UIApplicationSceneManifest raw ios/ExpoWidgetsTarget/Info.plist` fails (the key is absent)
  - [ ] `grep -c "WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())" ios/ExpoWidgetsTarget/HourglassWidget.swift` → `1`; the struct is present
- [ ] (C) **Mandatory** `cd "$T/app/ios" && pod install 2>&1 | tee "$T/pod.log"`. Exit 0. Paste `grep "Expo-precompiled" "$T/pod.log"`. Re-check that `ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy` still has the four reasons.
- [ ] (C) **Mandatory** `xcodebuild -workspace Hourglassxo.xcworkspace -scheme Hourglassxo -configuration Release -destination 'generic/platform=iOS' -derivedDataPath "$T/dd" CODE_SIGNING_ALLOWED=NO build`.
  - Exit 0. Never archive or export.
  - `ls "$T/dd/Build/Products/Release-iphoneos/Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex/"`: no `Frameworks/`, and `PrivacyInfo.xcprivacy` is present.
  - On failure, record the first error, follow spec-research edge case 4, fix, and re-run FR9.
- [ ] (C) In the worktree: `npx expo-doctor` exits 0. Record the check count.
- [ ] (C) The worktree's `runtimeversion:resolve --platform ios` (the FR8 value, after a fresh `npm ci`) equals the `$T/app` pre-prebuild value. Record both.
- [ ] (C) `rm -rf "$T"`. The worktree's `git status --porcelain` is unchanged from the first FR9 step.

### FR10: docs
- [ ] (C) Update `TECH_STACK.md`, `CLAUDE.md:69`, `README.md:27,66`, `docs/ARCHITECTURE.md` (§5.7, §7.2, §8.6), `docs/RELEASING.md` ((a)–(e)), `FEATURE.md` and `site/support.html`, per FR10.
- [ ] (C) Run the FR10 success-criteria greps and paste the outputs. The forbidden-words grep uses `@expo/ngrok`, not `ngrok`.
- [ ] (C) `runtimeversion:resolve --platform ios` is unchanged from the FR8 value (docs don't fork the runtime).

## Phase C Review (MANDATORY)
- [ ] `spec-implementation-alignment` for FR9–FR10. Run `pr-review-toolkit:review-pr` on the docs diff and address the findings. Three gates green.

---

## Phase D: Build 19 to "ready to submit" (FR11)

### Gates (all required before the build)
- [ ] (C) Phases A–C complete. Draft PR CI green. HEAD recorded: ______
- [ ] (C) The image row was re-checked today and the pin is unchanged, or the update is recorded.
- [ ] (C) The build number is confirmed unused: ______
- [ ] (J) The ASC agreement is accepted (asc.js read-only call no longer returns 403).
- [ ] (C) The ASC key is reachable from this worktree (Decision 16): `test -f .appstore/AuthKey_W4UV4XTKPC.p8 && git check-ignore -q .appstore/AuthKey_W4UV4XTKPC.p8`, or the EAS-stored key under (b). Otherwise stop with "blocked: ASC key access".

### Build and verify (C)
- [ ] `eas build -p ios --profile production` on cloud. Record:
  - the EAS build id: ______
  - `gitCommitHash` (= HEAD): ______
  - the log line naming `macos-tahoe-26.6-xcode-27.1` / Xcode 27.1 (27A9275);
  - the `[Expo-precompiled]` lines.
- [ ] `eas build:list --platform ios --status finished --channel production --app-build-version 19 --limit 1 --json --non-interactive` returns that id, and `runtime.version` equals the local resolve: ______
- [ ] IPA (`D=$(mktemp -d)`, download `artifacts.buildUrl`, unzip):
  - `DTSDKName` ______ (iphoneos27*), `DTSDKBuild` ______ (24*), `DTXcode` ______ (27*).
  - `CFBundleShortVersionString` 1.2.0, `CFBundleVersion` 19, `MinimumOSVersion` 16.4.
  - The scene delegate class ends with `.SceneDelegate`.
  - Appex: `Info.plist` has no scene manifest. `PrivacyInfo.xcprivacy` exists with `CA92.1`/`1C8F.1`/`C617.1`/`35F9.1`. `test ! -e "$D"/Payload/*.app/PlugIns/ExpoWidgetsTarget.appex/Frameworks`.
- [ ] `eas submit -p ios --profile production --id <build id>`: **TestFlight upload only**.
- [ ] **ITMS-91053 result for build 19** (every binary, including `ExpoWidgetsTarget`): ______. Compare it with the FR1 baseline (build 17: ______ / build 18: ______), then take one branch:
  - **None:** proceed.
  - **It names only `ExpoWidgetsTarget`:**
    - A category or reason that I10 lacks: add it to `buildWidgetPrivacyManifest()` and its test, then rebuild with the next unused build number before "ready to submit".
    - All already declared: record it, don't block, and open a follow-up.
  - **It names the main app binary:** add the reason to `ios.privacyManifests` and the spec 03 contract test, then rebuild with the next unused build number.
  - **Build 19 never reaches `VALID`:** this is a release blocker. Stop and escalate.
- [ ] ASC `sdkBuild` `24…`, or "skipped": ______
- [ ] `eas update:list --branch production --limit 3 --json --non-interactive`. Record whether an automatic embedded-bundle entry appeared (edge case).

### TestFlight smoke (J performs on iOS 27, C records)

iPhone model / iOS: ______ · iPad model / iOS: ______

Spec 05's eight checks:
- [ ] 1. Cold launch, then sign in with the QA manager account.
- [ ] 2. Home hours and earnings load. Overview's Personal/Team toggle works (manager). The Patterns card renders.
- [ ] 3. Approvals: approve one QA item and reject one with a reason. Both succeed with no JSON parse error; these are the empty-body PUTs.
- [ ] 4. Settings → About: Privacy Policy and Support open in the in-app browser and dismiss cleanly. The version row reads `Version 1.2.0 (19)` and `Update: embedded`.
- [ ] 5. Widgets: add small, medium and large. Each shows data on a dark background with no "adopt containerBackground" placeholder, and tapping one opens the app.
- [ ] 6. Widget refresh on open: after check 3, opening the app updates the widget.
- [ ] 7. A local deadline notification fires. Tapping it opens the app; there's no deep routing (Out of Scope 5).
- [ ] 8. Sign Out clears the data, with no error toast (expo-secure-store 58's `deleteItemAsync` now rejects when the keychain refuses). The widgets show the empty signed-out view, and `curl -s <relay>/health` `tokenCount` drops by 1 against a reading taken just before.

Lifecycle, network and widget additions:
- [ ] 9. **Foreground refresh:** background for ≥ 60 s, change data in QA (e.g. approve an item on the web), then foreground. The change shows within 10 s. This proves the AppState hooks still fire under scenes.
- [ ] 10. **Notification tap from a killed state:** force-quit, wait for or trigger a deadline notification, then tap it. The app cold-launches to the tabs with data, with no blank screen or crash.
- [ ] 11. **Widget tap from a killed state:** force-quit, then tap the widget. The app opens.
- [ ] 12. **Deep link:** type `hourglassws://overview` in Safari while the app is running (warm) → the Overview tab. Force-quit and repeat (cold) → the Overview tab.
- [ ] 13. **401 path:** sign out, then onboard with a wrong password. You get the auth-error message, not a crash or parse error.
- [ ] 14. **Relay register:** after sign-in, the relay `/health` `tokenCount` rises by 1 (NODE_ENV / `.env` check).
- [ ] 15. **Sign-out clears the log:** before sign-out, Settings → Debug Log → **Share log** exports a non-empty file. After sign-out and sign-in, **Share log** contains no entries from before the sign-out. This also proves `expo-file-system/legacy` and `expo-sharing` 58 work.
- [ ] 16. **Widget gallery preview (after 1.2.0 has been opened):** the long-press → Edit → add-widget gallery shows the Hourglass previews with no red box and no placeholder.
- [ ] 17. **Update without opening:**
  - Install build 18 from TestFlight, sign in, and add all three widget sizes.
  - Install build 19 from TestFlight **without opening it**, and wait ≥ 5 min.
  - The home-screen widgets still render on a dark background, with no "adopt containerBackground" placeholder.
  - **Before opening 1.2.0:** long-press → Edit → open the widget gallery, and watch a widget being added (its placeholder). Record what the gallery preview and the placeholder show: ______. A red box here is the expected transient (Decision 5 (i)). Record it; don't fail on it unless it persists after first open.
  - **Then open 1.2.0 once:**
    - The app goes straight to the tabs with the same account, with no onboarding or credentials screen. The Keychain credentials (expo-secure-store 58) and settings survived.
    - Record whether cached data (the AsyncStorage 2.2.0 TanStack persister) appears before the network returns: ______
    - The widgets refresh, and repeating the gallery check shows no red box.
- [ ] 18. **Countdown honesty:** with the app closed for ≥ 1 h, the widget's "Due in …" label has advanced to match the clock (the `env.date` fix).
- [ ] 19. **Memory, 10 minutes:** tab switching with charts animating. Use Instruments → Activity Monitor on the TestFlight build if Xcode 27 allows it; otherwise record "dev-build only" and cite the FR7 numbers. 1 min ____ MB / 10 min ____ MB, ratio ≤ 1.5, no jetsam.
- [ ] 20. **Visual parity:** NativeWind layout, every chart and the NativeTabs glass pill match the build-18 screenshots. The Settings modal header looks right under the iOS 26+ system bar appearance.

Resizability matrix:
- **iPad:** Split View ⅓ · ½ · ⅔, Slide Over, Stage Manager narrow → wide, portrait ↔ landscape.
- **iPhone:** resize the iPhone Mirroring window on macOS 27. iOS 27 resizes iPhone windows too.
- Under Decision 10 (b), record which discrete sizes iOS offers instead of free resizing.

Each cell passes when there's no clipping or overlap, every chart re-measures within one resize, the Overview sticky bar still triggers, `AnimatedMeshBackground` fills the window, the swipe threshold scales, the tab bar stays reachable, and nothing crashes.

| Screen | ⅓ | ½ | ⅔ | Slide Over | Stage Mgr | Rotate | iPhone Mirroring |
|---|---|---|---|---|---|---|---|
| Home | | | | | | | |
| Overview (manager) | | | | | | | |
| Overview (contributor) | | | | | | | |
| AI | | | | | | | |
| Requests (swipe) | | | | | | | |
| Settings modal | | | | | | | |

- [ ] (C) For each failure: fix it on `feat/sdk-58`, add a regression test or a screenshot pair, take the next build number (20), and repeat Phase D. Never submit a build that has a failing smoke item.

### ASC prep for 1.2.0 (C, `.appstore/asc.js` from this worktree per Decision 16; each live write preceded by its `--dry-run` transcript)
- [ ] `create-version 1.2.0` (phased `INACTIVE`, `AFTER_APPROVAL`), or "blocked: <reason>" if 1.1.0's review state prevents it.
- [ ] `set-whats-new` (includes "Requires iOS 16.4 or later.") · `attach-build <19 id>` · confirm `socialMedia false` in `check-submission`.
- [ ] `submit-app-review <19 id> --dry-run` transcript only. **No live submission.**

### Stop point
- [ ] (C) Every smoke item and matrix cell is PASS (or "blocked: no device", with J informed), and the ITMS-91053 branch is recorded. Mark **"ready to submit"** here: ______
- [ ] (J) Decides whether and when to submit. That's outside implementation.

## Phase D Review (MANDATORY)
- [ ] `spec-implementation-alignment` for FR11. Every recorded value matches I5. No `POST /reviewSubmissions` in the `ASC_TRACE` output.

---

## Session Notes

**2026-10-20**: Spec created. The research pass is recorded in `spec-research.md` (tarballs in `/tmp/spec10.o6hmwI`, ephemeral). Supersedes specs 08 and 09. Decisions 3 (icons), 4 (test renderer) and 5 (native widget fallback) are chosen defaults awaiting the user's confirmation. Nothing implemented yet.

**2026-10-20 (critique pass)**: Two critics' 22 issues were each re-verified against the cited source (tarballs in `/tmp/spec10crit.zF69wC`, ephemeral). 20 were applied and 2 rejected (spec-research F4).
- Main changes:
  - The widget-extension privacy-manifest plugin (I10).
  - A mandatory `pod install` and Release compile in FR9, plus the precompiled-modules fallback.
  - eas-cli, `ota-publish.sh`, `release/1.1` and CI Node 22 moved to FR1.
  - A checkpoint A device run.
  - The RNTL 14 `auth-screens` rewrite and the React Compiler lint policy.
  - The test files that hard-code `@react-navigation`.
  - Per-FR red tests, with only green commits pushed.
  - The FR9 copy gets its own git repo.
  - New decisions 10 (iPad options) and 16 (ASC key access).
- 27A9275 is the released Xcode 27.1, so the image pin stands.
- Nothing implemented yet.

**2026-10-20 (FR1 implemented)**: FR1 is done on SDK 55, with all three gates green.
- Commits on `feat/sdk-58`: `1a18a5c` (962d413), `7384790` (96035ea), `f077a17`, `c7d4c60`, `abe73a2`, `31d46fa` and this checklist commit.
- Refs: `build-18` → `aade79b`, and `release/1.1` → `7b0e328`, which is `aade79b` plus the ota-publish cherry-pick. Both are on origin.
- eas-cli 25.3.0.
- Open items:
  - (1) ITMS-91053 for builds 17 and 18 is **pending (J)**, and it's needed before FR4.
  - (2) `npx expo install --check` exits 1 on SDK 55 because of the pre-existing patch-line drift that spec 10 drops. The exclude itself is honored. See the FR1 A.1 entry.
  - (3) Clean installs skip Skia's 685 MB GitHub download (~30 KB/s here) and restore byte-identical `libs/` from a sibling worktree. FR4's Skia 2.14 needs a real download, so start it early.
- Deviations:
  - `expo.install.exclude` also lists `react-native-reanimated`, because the iff rule requires it while its patch exists.
  - `versionAtLeast` is kept, with neutral unit values, for FR4.
