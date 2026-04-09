# Spec Research: 06-wiring-and-tokens

**Feature:** features/app/brand-polish
**Source:** UX Gauntlet Run #002 synthesis — 2026-03-16

---

## Problem Context

UX Gauntlet run-002 scored the app 4.2/10 aggregate. The synthesis flagged:
- "Zero dark glass — no blur, no noise, no layered depth" ✗
- "Color violations: gold on toggle, old hex in tab bar" ⚠
- "Hero numbers not at 800 weight, letter-spacing missing" ⚠

Investigation revealed that brand-polish v1 (specs 01–05) built all the components correctly
but left three wiring/token gaps that are visually significant:

1. `NoiseOverlay` was built (spec 05) but never imported into any screen or layout
2. `_layout.tsx` (tabs) still has v1.0 hardcoded hex values for tab bar
3. `overview.tsx` 4W/12W toggle uses `colors.gold` for the active pill — violates "gold = earnings only"
4. `MetricValue` uses `font-display` (Inter 700) instead of `font-display-extrabold` (800); no letter-spacing
5. Root layout loading screen uses `#0D1117` (v1.0) and `#00FF88` (non-standard spinner)

---

## Exploration Findings

### NoiseOverlay (unconnected)

`src/components/NoiseOverlay.tsx` — fully implemented, `noise.png` exists.
Component comment says: "Place inside the root screen View, after all content."

**Best placement:** `app/(tabs)/_layout.tsx` as an absolutely positioned overlay
over the `<Tabs>` component. This covers all 4 tab screens with a single inclusion.
Alternative: `app/_layout.tsx` root, but `<Stack>` doesn't fill the screen the same way.

Ideal render position in tabs layout:
```tsx
<View style={{ flex: 1 }}>
  <Tabs .../>
  <NoiseOverlay />
</View>
```

Tab bar layout currently renders `<Tabs .../>` directly without a wrapper View.

### Tab bar token violations (`app/(tabs)/_layout.tsx`)

Lines 19–23:
```tsx
tabBarStyle: {
  backgroundColor: '#13131A',  // ← v1.0, should be colors.surface (#16151F)
  borderTopColor: '#2A2A3D',   // ← v1.0, should be colors.border (#2F2E41)
  borderTopWidth: 1,
}
```

Fix: import `{ colors }` from `@/src/lib/colors` and use tokens.

### 4W/12W toggle color violation (`app/(tabs)/overview.tsx`)

Lines 207–213:
```tsx
<Text style={{
  color: toggle4Active ? colors.gold : colors.textMuted ?? '#888',
  ...
}}>4W</Text>
```

`colors.gold` is the active color for the toggle pill. Brand guidelines rule 1:
"Gold is for money only — not toggles."

Fix: Replace with `colors.violet` (the primary interactive accent) for active state.

### MetricValue typography gaps (`src/components/MetricValue.tsx`)

Line 1–8 comment: references "Space Grotesk" (stale — Inter only since spec 02).
Line 65: `className={`font-display ${sizeClass} ${colorClass}`}`

- `font-display` maps to Inter_700Bold in tailwind.config.js
- Brand guidelines §Typography: hero numbers use "Display 700–800", 3xl = "Display 700–800"
- Synthesis: "hero numbers not at 800 weight" — Inter_800ExtraBold (`font-display-extrabold`) is loaded but unused by MetricValue
- Brand guidelines: "Letter-spacing tightens at large sizes. Display gets -0.02em" — no `letterSpacing` on MetricValue

Fix:
- `font-display` → `font-display-extrabold` (700 → 800 weight default)
- Add `letterSpacing: -0.5` to inline style (≈ -0.02em at text-4xl 36px)
- Update stale "Space Grotesk" comment to "Inter"

### Root layout loading screen (`app/_layout.tsx`)

Lines 76–78:
```tsx
<View style={{ ..., backgroundColor: '#0D1117' }}>
  <ActivityIndicator size="large" color="#00FF88" />
</View>
```

- `#0D1117` is old v1.0 background — v1.1 background is `#0D0C14` (`colors.background`)
- `#00FF88` is not a design token — loading spinner should use `colors.violet` or `colors.success`

---

## Key Decisions

**Where to add NoiseOverlay?**
→ `app/(tabs)/_layout.tsx` — covers all tab screens with one change.
Wrap `<Tabs>` in a `<View style={{ flex: 1 }}>` and place `<NoiseOverlay />` after.

**What color for toggle active?**
→ `colors.violet` — the designated interactive accent per brand guidelines §Color Rules rule 3:
"Violet is for BrainLift AND interactive UI. Violet doubles as the primary interactive accent for buttons, pressed states, and focused elements."

**What color for loading spinner?**
→ `colors.violet` — interactive primary. Keeps it consistent with other loading indicators.

**MetricValue weight — break callers?**
→ No. MetricValue is only used for hero metric displays. All callers expect the largest, boldest number. Changing the default to 800 weight is safe. No callers pass `fontClass` override.

---

## Interface Contracts

### FR1: NoiseOverlay in tabs layout

**File:** `app/(tabs)/_layout.tsx`

**Before:**
```tsx
return (
  <Tabs screenOptions={{...}}>
    ...
  </Tabs>
);
```

**After:**
```tsx
return (
  <View style={{ flex: 1 }}>
    <Tabs screenOptions={{...}}>
      ...
    </Tabs>
    <NoiseOverlay />
  </View>
);
```

**Imports to add:** `View` from `react-native`, `NoiseOverlay` from `@/src/components/NoiseOverlay`

### FR2: Tab bar color tokens

**File:** `app/(tabs)/_layout.tsx`

**Before:**
```tsx
tabBarStyle: {
  backgroundColor: '#13131A',
  borderTopColor: '#2A2A3D',
  borderTopWidth: 1,
}
```

**After:**
```tsx
tabBarStyle: {
  backgroundColor: colors.surface,
  borderTopColor: colors.border,
  borderTopWidth: 1,
}
```

**Import to add:** `import { colors } from '@/src/lib/colors';`

### FR3: Overview toggle color

**File:** `app/(tabs)/overview.tsx`

**Instance 1 — 4W button (line 208):**
```tsx
// Before:
color: toggle4Active ? colors.gold : colors.textMuted ?? '#888'
// After:
color: toggle4Active ? colors.violet : colors.textMuted ?? '#888'
```

**Instance 2 — 12W button (line 220):**
```tsx
// Before:
color: !toggle4Active ? colors.gold : colors.textMuted ?? '#888'
// After:
color: !toggle4Active ? colors.violet : colors.textMuted ?? '#888'
```

Both instances on lines 208 and 220. No new imports needed (`colors.violet` already exists in colors.ts).

### FR4: MetricValue weight + letter-spacing

**File:** `src/components/MetricValue.tsx`

```tsx
// Before (line 65):
<Text
  className={`font-display ${sizeClass} ${colorClass}`}
  style={{ fontVariant: ['tabular-nums'] }}
>

// After:
<Text
  className={`font-display-extrabold ${sizeClass} ${colorClass}`}
  style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
>
```

Comment cleanup: Replace "Space Grotesk" references with "Inter" in lines 1–8.

### FR5: Loading screen token fix

**File:** `app/_layout.tsx`

```tsx
// Before:
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0D1117' }}>
  <ActivityIndicator size="large" color="#00FF88" />

// After:
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
  <ActivityIndicator size="large" color={colors.violet} />
```

**Import to add:** `import { colors } from '@/src/lib/colors';`

---

## Test Plan

### FR1: NoiseOverlay wiring

**Target:** `app/(tabs)/_layout.tsx`

**Happy Path:**
- [ ] TabLayout renders without crashing when NoiseOverlay is included
- [ ] NoiseOverlay is rendered as child of the wrapper View
- [ ] The Tabs component still renders all 4 screens normally

**Edge Cases:**
- [ ] pointerEvents="none" — NoiseOverlay does not intercept tab taps

**Mocks needed:** `../../assets/images/noise.png` (require mock)

### FR2: Tab bar tokens

**Target:** `app/(tabs)/_layout.tsx`

**Happy Path:**
- [ ] `backgroundColor` uses `colors.surface` value (not hardcoded string)
- [ ] `borderTopColor` uses `colors.border` value (not hardcoded string)
- [ ] No hardcoded hex values for tab bar styling remain

**Test approach:** Read source as string, assert no `'#13131A'` or `'#2A2A3D'` literal present.

### FR3: Toggle color

**Target:** `app/(tabs)/overview.tsx`

**Happy Path:**
- [ ] Active pill text color resolves to `colors.violet` (not `colors.gold`)
- [ ] Inactive pill text color remains `colors.textMuted`
- [ ] No `colors.gold` reference in toggle pill rendering

**Test approach:** Source string check — no `colors.gold` in toggle Text styles.

### FR4: MetricValue typography

**Target:** `src/components/MetricValue.tsx`

**Happy Path:**
- [ ] Component renders with `font-display-extrabold` class
- [ ] Inline style includes `letterSpacing: -0.5`
- [ ] `fontVariant: ['tabular-nums']` still present

**Regression:**
- [ ] `colorClass` and `sizeClass` props still applied correctly
- [ ] No "Space Grotesk" string in file

### FR5: Loading screen

**Target:** `app/_layout.tsx`

**Happy Path:**
- [ ] Background color is `colors.background` (not hardcoded hex)
- [ ] ActivityIndicator color is `colors.violet` (not hardcoded `#00FF88`)

---

## Files to Reference

| File | Purpose |
|------|---------|
| `app/(tabs)/_layout.tsx` | Tab bar config — FR1, FR2 |
| `app/(tabs)/overview.tsx` | 4W/12W toggle — FR3 |
| `src/components/MetricValue.tsx` | Hero typography — FR4 |
| `src/components/NoiseOverlay.tsx` | Reference implementation |
| `app/_layout.tsx` | Root layout loading screen — FR5 |
| `src/lib/colors.ts` | Color token source of truth |
| `tailwind.config.js` | Font class definitions |
| `BRAND_GUIDELINES.md` | §Color Rules, §Typography, §Surface & Depth |
