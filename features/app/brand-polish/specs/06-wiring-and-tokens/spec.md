# 06-wiring-and-tokens

**Status:** Draft
**Created:** 2026-03-16
**Last Updated:** 2026-03-16
**Owner:** @trilogy

---

## Overview

Closes five wiring/token gaps identified by UX Gauntlet run-002 (4.2/10 aggregate). The brand-polish v1 specs (01–05) built all components correctly but left these gaps visible:

1. `NoiseOverlay` component (built in spec 05) has never been imported into any screen or layout — it exists but contributes nothing visually.
2. `app/(tabs)/_layout.tsx` tab bar still references v1.0 hardcoded hex values (`#13131A`, `#2A2A3D`) instead of design tokens.
3. `app/(tabs)/overview.tsx` 4W/12W toggle uses `colors.gold` for the active pill — violates the brand rule "gold is for money only."
4. `MetricValue` uses `font-display` (Inter 700) instead of `font-display-extrabold` (800); missing `letterSpacing: -0.5`.
5. Root layout loading screen still references v1.0 `#0D1117` background and non-standard `#00FF88` spinner color.

All five changes are surgical — no new components, no data model changes, no new dependencies. This spec is independent of all other brand-polish specs and can execute immediately.

---

## Out of Scope

1. **Descoped:** Tab bar icon color tokens (`tabBarActiveTintColor`, `tabBarInactiveTintColor`) — these already use the correct v1.1 values (`#E8C97A` = gold, `#484F58` = textMuted) and are not flagged by the gauntlet.
2. **Descoped:** NoiseOverlay opacity or tile size tuning — the component renders at `opacity: 0.04` as built in spec 05; no visual adjustment is needed for this spec.
3. **Descoped:** MetricValue `sizeClass` or `colorClass` prop API changes — only the default font class and letter-spacing change; the prop interface is unchanged.
4. **Deferred to 07-chart-line-polish:** Chart glow effects (TrendSparkline, WeeklyBarChart) — separate spec, currently ready.
5. **Descoped:** Loading screen animation or branding beyond the color token swap — no spinner design changes, only token alignment.

---

## Functional Requirements

### FR1: Wire NoiseOverlay into tabs layout

**What:** Import and render `NoiseOverlay` in `app/(tabs)/_layout.tsx`, covering all four tab screens with a single change.

**How:** Wrap the existing `<Tabs>` component in a `<View style={{ flex: 1 }}>` and place `<NoiseOverlay />` after it (absolutely positioned by the component itself, `pointerEvents="none"` so tab taps pass through).

**Success Criteria:**
- `app/(tabs)/_layout.tsx` imports `NoiseOverlay` from `@/src/components/NoiseOverlay`
- `app/(tabs)/_layout.tsx` imports `View` from `react-native`
- `<Tabs>` is wrapped in `<View style={{ flex: 1 }}>`
- `<NoiseOverlay />` is rendered after `<Tabs>` inside that View
- All four tab screens still render normally (no layout breakage)
- NoiseOverlay does not intercept tab bar taps (`pointerEvents="none"` is on the overlay)

---

### FR2: Tab bar color tokens

**What:** Replace hardcoded hex values in `tabBarStyle` with `colors` design tokens.

**How:** Import `{ colors }` from `@/src/lib/colors` and substitute:
- `backgroundColor: '#13131A'` → `backgroundColor: colors.surface`
- `borderTopColor: '#2A2A3D'` → `borderTopColor: colors.border`

**Success Criteria:**
- `colors` is imported from `@/src/lib/colors` in `_layout.tsx`
- `tabBarStyle.backgroundColor` equals `colors.surface` at runtime
- `tabBarStyle.borderTopColor` equals `colors.border` at runtime
- No literal `'#13131A'` or `'#2A2A3D'` strings remain in `_layout.tsx`

---

### FR3: Overview 4W/12W toggle — gold → violet

**What:** Replace `colors.gold` with `colors.violet` in the 4W/12W toggle pill text color in `app/(tabs)/overview.tsx`.

**How:** Two instances on lines 208 and 220 — both use `colors.gold` for the active pill. Replace both with `colors.violet`. `colors.violet` is already exported from `src/lib/colors.ts`; no new import needed.

**Success Criteria:**
- Active toggle text color resolves to `colors.violet` (not `colors.gold`)
- Inactive toggle text color remains `colors.textMuted`
- No `colors.gold` reference exists in the toggle pill `Text` style expressions
- Both the 4W and 12W buttons are updated (not just one)

---

### FR4: MetricValue — 800 weight + letter-spacing

**What:** Upgrade `MetricValue`'s default font class from `font-display` (700) to `font-display-extrabold` (800) and add `letterSpacing: -0.5` to match brand guidelines for hero numbers.

**How:**
- Line 65: `className={`font-display ${sizeClass} ${colorClass}`}` → `className={`font-display-extrabold ${sizeClass} ${colorClass}`}`
- `style={{ fontVariant: ['tabular-nums'] }}` → `style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}`
- Lines 1–8 comment: replace "Space Grotesk" with "Inter" (stale reference from before spec 02 consolidated fonts)

**Success Criteria:**
- `className` includes `font-display-extrabold` (not `font-display`)
- Inline style includes `letterSpacing: -0.5`
- `fontVariant: ['tabular-nums']` still present
- No "Space Grotesk" string anywhere in the file
- `colorClass` and `sizeClass` props continue to apply correctly

---

### FR5: Root layout loading screen — token cleanup

**What:** Replace v1.0 hardcoded colors in the loading overlay with design tokens.

**How:** In `app/_layout.tsx`, import `{ colors }` from `@/src/lib/colors` and substitute:
- `backgroundColor: '#0D1117'` → `backgroundColor: colors.background`
- `color="#00FF88"` (ActivityIndicator) → `color={colors.violet}`

**Success Criteria:**
- `colors` is imported from `@/src/lib/colors` in `_layout.tsx`
- Loading overlay background equals `colors.background` at runtime
- `ActivityIndicator` color equals `colors.violet` at runtime
- No literal `'#0D1117'` or `'#00FF88'` strings remain in `_layout.tsx`

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/components/NoiseOverlay.tsx` | Component to wire in — already implemented |
| `src/lib/colors.ts` | Token source of truth (`colors.surface`, `colors.border`, `colors.violet`, `colors.background`) |
| `tailwind.config.js` | Confirm `font-display-extrabold` maps to `Inter_800ExtraBold` |
| `BRAND_GUIDELINES.md` | §Color Rules, §Typography, §Surface & Depth |

### Files to Modify

| File | FRs | Changes |
|------|-----|---------|
| `app/(tabs)/_layout.tsx` | FR1, FR2 | Add View wrapper + NoiseOverlay; swap hex → tokens |
| `app/(tabs)/overview.tsx` | FR3 | 2× `colors.gold` → `colors.violet` in toggle |
| `src/components/MetricValue.tsx` | FR4 | Font class, letterSpacing, stale comment |
| `app/_layout.tsx` | FR5 | 2× hardcoded hex → token imports |

No new files are created.

### Data Flow

All changes are purely presentational — no data fetching, no hook changes, no state changes. Changes affect only:
1. Which JSX element wraps the Tabs (FR1)
2. Which values are passed to StyleSheet-compatible style props (FR2, FR5)
3. Which NativeWind class string is passed to Text (FR4)
4. Which color token value is interpolated into inline styles (FR3)

### Edge Cases

**FR1 — View wrapper depth:** The outer `<View style={{ flex: 1 }}>` must have `flex: 1` to prevent the tab bar from being pushed off screen. NoiseOverlay uses `StyleSheet.absoluteFillObject` internally, so it fills the parent View correctly.

**FR3 — Third `colors.gold` on overview.tsx line 246:** The overview screen has a third `colors.gold` reference on line 246 (earnings amount text). This must NOT be changed — that reference is correct usage (earnings display). Only the toggle pill Text styles (lines 208, 220) are in scope.

**FR4 — `font-display-extrabold` availability:** `Inter_800ExtraBold` was loaded in `app/_layout.tsx` as part of spec 02. `tailwind.config.js` must already map `font-display-extrabold` to this font. Verify before implementing.

**FR5 — Import deduplication:** `app/_layout.tsx` does not currently import `colors`. The import must be added at the top of the file alongside existing imports.

### Test Approach

Tests for FR1 and FR2 share the same file (`app/(tabs)/_layout.tsx`) and can be co-located in a single test file. FR3 tests read `overview.tsx` source as string. FR4 tests render `MetricValue` and assert className/style props. FR5 tests read `app/_layout.tsx` source as string for token verification.

Source-string checks are appropriate for FR2, FR3, FR5 because the success criteria are "no hardcoded hex remains" — render-based tests cannot easily assert absence of a value in the style chain.
