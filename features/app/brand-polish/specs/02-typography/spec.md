# 02-Typography

**Status:** Draft
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Owner:** @trilogy

---

## Overview

### What Is Being Built

This spec consolidates the app's typography system from three font families (Space Grotesk, Inter, Plus Jakarta Sans) down to **Inter only**, in alignment with v1.1 brand guidelines. Hierarchy is expressed through weight (300–800) and letter-spacing rather than font family switching.

Additionally, this spec fixes seven undefined NativeWind class references discovered during exploration (`text-error`, `text-textTertiary`) and adds `fontVariant: ['tabular-nums']` to all metric display components that render numbers.

### How It Works

1. **Tailwind config alias remapping** — `font-display` and `font-body` aliases are remapped to Inter weights. No component files need to change their `className` values; the aliases update silently.
2. **Font loading** — `app/_layout.tsx` `useFonts` call is updated to load only Inter variants (300 through 800). Space Grotesk and Plus Jakarta Sans packages remain installed but are no longer loaded.
3. **Class violation fixes** — `text-error` → `text-critical` and `text-textTertiary` → `text-textMuted` across `app/(tabs)/ai.tsx`.
4. **Tabular-nums** — `style={{ fontVariant: ['tabular-nums'] }}` added alongside existing `className` on four components that render numeric metric values.

### Why This Approach

Remapping at the alias level (tailwind config) is the lowest-risk path: zero component churn, and the font weight ladder (400 → 500 → 600 → 700 → 800) fully covers v1.1 hierarchy needs. The `font-display` alias now maps to `Inter_700Bold` (previously SpaceGrotesk_700Bold) — visually distinct enough for hero numbers while maintaining design consistency.

---

## Out of Scope

1. **Removing Space Grotesk and Plus Jakarta Sans npm packages** — Packages remain installed in `package.json`. Removing them requires a separate dependency cleanup and is not needed for the visual goal. **Descoped:** No action needed for brand compliance.

2. **Variable font (single file) migration** — v1.1 brand guidelines mention Inter variable font as a future direction. Switching from discrete weight files to a single variable font file requires Expo font loading changes beyond this spec's scope. **Deferred:** Not yet decomposed in brand-polish specs.

3. **Inter_300Light availability** — If `Inter_300Light` is unavailable in `@expo-google-fonts/inter`, `font-body-light` will fall back to `Inter_400Regular`. Verifying and sourcing Inter Light is **Descoped** — the spec notes the fallback in the config comment.

4. **Letter-spacing utility classes** — The spec-research notes adding `tracking-tight` (-0.02em) to display-weight numbers as a convention. Tailwind utility classes for letter-spacing are already available via NativeWind. Documenting as a convention (not enforcement) is sufficient for this spec. **Descoped:** No config change needed.

5. **Component-level font audit beyond identified instances** — Only the four components identified in spec-research.md receive tabular-nums. A full audit of every numeric Text element in the codebase is **Descoped** for this spec; can be done as a follow-up.

6. **Dark mode font rendering differences** — No dark-mode-specific font handling needed. **Descoped:** Single theme app.

---

## Functional Requirements

### FR1: Font Aliases Remapped to Inter

Remap all `fontFamily` aliases in `tailwind.config.js` so that `font-display` and `font-body` aliases resolve to Inter weights.

**Success Criteria:**
- `font-display` maps to `Inter_700Bold` (was SpaceGrotesk)
- `font-display-medium` maps to `Inter_500Medium`
- `font-display-semibold` maps to `Inter_600SemiBold`
- `font-display-bold` maps to `Inter_700Bold`
- `font-display-extrabold` maps to `Inter_800ExtraBold` (new alias)
- `font-sans` maps remain unchanged (already Inter)
- `font-body` maps to `Inter_400Regular` (was PlusJakartaSans)
- `font-body-light` maps to `Inter_300Light` (or `Inter_400Regular` as fallback)
- `font-body-medium` maps to `Inter_500Medium`
- `tailwind.config.js` contains no references to `SpaceGrotesk` or `PlusJakartaSans` font names

---

### FR2: Font Loading Updated to Inter-Only

Update `useFonts` in `app/_layout.tsx` to load only Inter variants (300–800). Remove Space Grotesk and Plus Jakarta Sans from the load list.

**Success Criteria:**
- `useFonts` loads `Inter_300Light`, `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold`, `Inter_700Bold`, `Inter_800ExtraBold`
- `useFonts` does NOT load any `SpaceGrotesk_*` or `PlusJakartaSans_*` variants
- `@expo-google-fonts/space-grotesk` import is removed from `_layout.tsx`
- `@expo-google-fonts/plus-jakarta-sans` import is removed from `_layout.tsx`
- App renders without font-not-found errors (splash screen does not hang)

---

### FR3: Class Violations Fixed

Replace undefined NativeWind class names with the correct token equivalents in `app/(tabs)/ai.tsx`.

**Success Criteria:**
- `text-error` replaced with `text-critical` (1 instance, ~line 256)
- `text-textTertiary` replaced with `text-textMuted` (6 instances, ~lines 280, 350, 351, 352, 442, 449)
- No occurrence of `text-error` anywhere in the codebase (grep confirms zero hits)
- No occurrence of `text-textTertiary` anywhere in the codebase (grep confirms zero hits)

---

### FR4: Tabular-Nums Added to Metric Components

Add `style={{ fontVariant: ['tabular-nums'] }}` to all Text elements that render numeric metric values, ensuring digits align in tabular layout.

**Success Criteria:**
- `SubMetric` component in `app/(tabs)/index.tsx` (~line 84) has `fontVariant: ['tabular-nums']` on the value Text element
- `ApprovalCard.tsx` hours value Text (~lines 98–99) has `fontVariant: ['tabular-nums']`
- `ApprovalCard.tsx` cost value Text (~lines 107–108) has `fontVariant: ['tabular-nums']`
- `MyRequestCard.tsx` duration display Text (~lines 84–86) has `fontVariant: ['tabular-nums']`
- BrainLift sub-target line in `app/(tabs)/ai.tsx` (~line 317) has `fontVariant: ['tabular-nums']`
- Each element retains its existing `className` prop unchanged; `style` is additive

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `tailwind.config.js` | Current fontFamily aliases to remap |
| `app/_layout.tsx` | useFonts call with current three-family load |
| `app/(tabs)/ai.tsx` | Class violations + tabular-nums target |
| `app/(tabs)/index.tsx` | SubMetric tabular-nums target |
| `src/components/ApprovalCard.tsx` | Hours/cost tabular-nums targets |
| `src/components/MyRequestCard.tsx` | Duration tabular-nums target |

### Files to Modify

| File | Change |
|------|--------|
| `tailwind.config.js` | Remap `display` and `body` font alias groups to Inter weights |
| `app/_layout.tsx` | Replace three-family useFonts with Inter-only; remove non-Inter imports |
| `app/(tabs)/ai.tsx` | Fix `text-error` → `text-critical` (×1); `text-textTertiary` → `text-textMuted` (×6); add tabular-nums to BrainLift line |
| `app/(tabs)/index.tsx` | Add tabular-nums to SubMetric value Text |
| `src/components/ApprovalCard.tsx` | Add tabular-nums to hours and cost Text elements |
| `src/components/MyRequestCard.tsx` | Add tabular-nums to duration Text element |

### No New Files

This spec makes no new files. All changes are modifications to existing files.

### Data Flow

No runtime data flow changes. All changes are static (config/styling/class names). The font loading change affects app startup:

```
App launch
  → useFonts([Inter variants only])
  → fonts loaded
  → SplashScreen.hideAsync()
  → NativeWind resolves font-display/font-body aliases → Inter weights
  → Metric Text elements render with tabular-nums
```

### Edge Cases

1. **Inter_300Light not available** — If `@expo-google-fonts/inter` does not export `Inter_300Light`, the `font-body-light` alias must fall back to `Inter_400Regular`. The tailwind config should note this with a comment: `// fallback: Inter_400Regular if 300 unavailable`.

2. **Existing SpaceGrotesk/PlusJakartaSans usage outside ai.tsx** — Before removing imports from `_layout.tsx`, confirm no other file imports these packages directly. A grep confirms they are only used via tailwind aliases.

3. **useFonts returns false on first render** — This is existing behaviour; the loading gate (`if (!loaded) return null`) already handles it. No change needed.

4. **tabular-nums on non-numeric Text** — Only add `fontVariant` to Text elements that render numeric content. Do not add to label or heading Text nodes.

5. **Interaction with existing `style` props** — If a target Text element already has a `style` prop, merge: `style={[existingStyle, { fontVariant: ['tabular-nums'] }]}` to avoid overwriting.

### Testing Approach

All tests are static (no runtime test environment needed):

- **FR1/FR2**: Read `tailwind.config.js` and `_layout.tsx`, assert correct font names present/absent using string matching
- **FR3**: Grep codebase for `text-error` and `text-textTertiary` — assert zero hits
- **FR4**: Read each component file, assert `fontVariant.*tabular-nums` present on the correct Text elements

Tests live in the existing Jest/RNTL test suite under `src/components/__tests__/` and `app/__tests__/`.
