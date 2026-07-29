# Spec 01 — Declare lock-screen accessory widget families

**Status:** Research complete
**Complexity:** S
**Blocks:** 02
**Blocked By:** — (independent)

## Problem context

`src/widgets/bridge.ts` already has full render branches for all three lock-screen accessory families — `accessoryCircular` (line 811), `accessoryInline` (817), `accessoryRectangular` (821) — confirmed present and implemented. But `app.json`'s `expo-widgets` plugin config only declares:

```json
"supportedFamilies": ["systemSmall", "systemMedium", "systemLarge"]
```

Without the accessory families in `supportedFamilies`, iOS never offers them in the widget gallery — the code that renders them is dead weight today. This is a **one-line-array config gap**, not a rendering gap.

## Exploration findings — the `feat/widget-vnext` overlap, resolved

Per the FEATURE.md's instruction to check the overlap before implementing from scratch, I diffed `feat/widget-vnext`'s `app.json` against `main`'s directly:

```diff
-                "systemLarge",
-                "accessoryCircular",
-                "accessoryRectangular",
-                "accessoryInline"
+                "systemLarge"
```

(plus an unrelated `buildNumber` difference: vnext branch is frozen at `"10"`, main is at `"15"` — not part of this fix, ignore.)

**This confirms the overlap note's prediction exactly: the fix on that branch is a single, clean, 4-line `supportedFamilies` array addition, fully isolated from the rest of the branch's unrelated foundation work (WidgetData extensions, etc.).** The cherry-pick-if-clean path applies — this is NOT a fresh re-derivation; it's copying 3 array entries from a branch where they were already written and (per that branch's own FEATURE.md marking spec 01 Complete) presumably validated.

**Decision: hand-port the exact 3-line array addition to `main`'s `app.json`.** Do not attempt an actual `git cherry-pick` of the vnext commit (it would drag in the `buildNumber` change and likely touch other vnext-specific files) — a manual one-line diff applied directly to `main`'s current `app.json` is simpler and safer than reconciling a cherry-pick across branches that have otherwise diverged.

## Key decisions

**1. Add exactly `"accessoryCircular", "accessoryRectangular", "accessoryInline"` to the existing `supportedFamilies` array in `app.json`, alongside the current `systemSmall`/`systemMedium`/`systemLarge`.** No changes to `src/widgets/bridge.ts` — its render branches are already correct and complete per the vnext branch's validation.

**2. No `buildNumber` change as part of this spec** — that's an unrelated concern (native build versioning), out of scope here; `hourglassws/CLAUDE.md`'s version-bump rule for `hourglass.js` doesn't even apply to this repo (that's the deprecated Scriptable widget at repo root) — but any actual version bump for this Expo app's release process is a separate, standard EAS build/submit step, not part of this spec's diff.

**3. Verify device-render of all three families post-change is a TestFlight task, not something this spec's code can self-verify** — per the FEATURE.md's own note that widget-gallery rendering isn't unit-testable. The `WIDGET_RING_PRIMITIVES` memory note already documents that the accessory-family rendering primitives (fill-ring + tick technique) were previously verified against the ES5 bundle globals — this spec's job is exposing that already-correct code to the gallery, not re-verifying the primitives themselves.

## Interface contracts

No new types or functions. Config-only change:

```json
// app.json — expo-widgets plugin config, "widgets" > "HourglassWidget" > "supportedFamilies"
"supportedFamilies": [
  "systemSmall",
  "systemMedium",
  "systemLarge",
  "accessoryCircular",
  "accessoryRectangular",
  "accessoryInline"
]
```

## Test plan

- [ ] `app.json` parses as valid JSON with the updated array (trivial, but worth a config-shape assertion if one already exists for widget config).
- [ ] No regression to existing `systemSmall`/`systemMedium`/`systemLarge` behavior — confirm no existing widget config tests break.
- [ ] `src/widgets/__tests__/` (if it has any test exercising family-based branching in `bridge.ts`) still passes unchanged — this spec doesn't touch `bridge.ts`.
- [ ] Manual/TestFlight: after a fresh EAS build, long-press the lock screen → Customize → confirm Hourglass appears as an option for circular, rectangular, and inline accessory slots.

## Files to reference

| File | Why |
|---|---|
| `app.json` (widget extension `supportedFamilies` array) | The single line this spec changes. |
| `src/widgets/bridge.ts:811,817,821` | Confirmed-existing render branches for the three accessory families — no changes needed here. |
| `feat/widget-vnext:app.json` (via `git show`) | Source of the already-validated fix, hand-ported rather than re-derived. |
| `memory/MEMORY.md` "Widget Ring Primitives (feasibility)" | Prior validation of the fill-ring+tick rendering technique used inside these accessory branches. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ (limited) | Config-shape/regression checks only — no meaningful unit-testable logic in a JSON array change |
| Live-QA probe | ✗ | No API involved |
| TestFlight | ✓ **(load-bearing)** | Long-press lock screen, confirm all 3 accessory families are installable and render correctly with live data |
| Error log | ✗ | No runtime error path introduced |
