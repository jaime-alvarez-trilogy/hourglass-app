# Spec Research: 02-typography

## Problem Context

The app currently loads three font families:
- Space Grotesk (Display tier — hero numbers)
- Inter (Sans tier — UI labels)
- Plus Jakarta Sans (Body tier — descriptive copy)

The v1.1 brand guidelines consolidate to **Inter only**. Hierarchy is now expressed through weight and letter-spacing rather than font family. Additionally there are NativeWind class violations and missing `tabular-nums` on several metric components.

## Exploration Findings

**Font loading** — `app/_layout.tsx` lines 55–67 loads all three families via `@expo-google-fonts/*` packages.

**Tailwind fontFamily config** — `tailwind.config.js` lines 55–73 maps:
- `font-display` → SpaceGrotesk_*
- `font-sans` → Inter_*
- `font-body` → PlusJakartaSans_*

**Strategy for consolidation:** Remap `font-display` and `font-body` aliases to use Inter weights. This means all components using `font-display-bold` automatically get Inter 700 without changing each component. No component files need to change their className — only the tailwind config aliases change.

**Font packages** — fonts come from npm (`@expo-google-fonts/*`), not local files. After remapping aliases, the Space Grotesk and Plus Jakarta packages can remain installed (they just won't be loaded). The `useFonts` call in `_layout.tsx` must be updated to only load Inter variants.

**Class violations found:**
- `app/(tabs)/ai.tsx` line 256: `text-error` → undefined. Fix: `text-critical`
- `app/(tabs)/ai.tsx` lines 280, 350, 351, 352, 442, 449: `text-textTertiary` → undefined. Fix: `text-textMuted`

**Missing tabular-nums:**
- `app/(tabs)/index.tsx` SubMetric component (~line 84): renders `value.toFixed(1) + unit`
- `src/components/ApprovalCard.tsx` lines 98–99, 107–108: hours and cost values
- `src/components/MyRequestCard.tsx` lines 84–86: duration display
- `app/(tabs)/ai.tsx` line 317: BrainLift sub-target line

## Key Decisions

1. **Alias remapping strategy** — remap tailwind fontFamily aliases to Inter at all weights. No component changes needed. Clean, low-risk.
2. **Font loading** — remove Space Grotesk and Plus Jakarta Sans from `useFonts`. Only load Inter family (Regular 400, Medium 500, SemiBold 600, Bold 700, ExtraBold 800).
3. **Inter 800 for Display** — Add `Inter_800ExtraBold` to match v1.1 Display 700–800 spec.
4. **Letter-spacing** — add `tracking-tight` (-0.02em) to display-weight number classes via tailwind config or document as a convention.
5. **tabular-nums** — add `fontVariant: ['tabular-nums']` as `style` prop alongside existing `className` on all affected components.
6. **Class violations** — straightforward find-and-replace.

## Interface Contracts

```javascript
// tailwind.config.js — fontFamily remapping (after change)
fontFamily: {
  // Display tier — Inter heavy weights for numbers
  'display':         ['Inter_700Bold'],
  'display-medium':  ['Inter_500Medium'],
  'display-semibold':['Inter_600SemiBold'],
  'display-bold':    ['Inter_700Bold'],
  'display-extrabold':['Inter_800ExtraBold'],  // NEW

  // Sans tier — Inter standard weights (unchanged underlying font)
  'sans':            ['Inter_400Regular'],
  'sans-medium':     ['Inter_500Medium'],
  'sans-semibold':   ['Inter_600SemiBold'],
  'sans-bold':       ['Inter_700Bold'],

  // Body tier — now also Inter (was Plus Jakarta Sans)
  'body':            ['Inter_400Regular'],
  'body-light':      ['Inter_300Light'],    // Inter Light if available, else 400
  'body-medium':     ['Inter_500Medium'],
}
```

```typescript
// app/_layout.tsx — useFonts (after change)
const [loaded] = useFonts({
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  // Removed: SpaceGrotesk_*, PlusJakartaSans_*
});
```

```typescript
// Pattern for tabular-nums addition (all affected components)
<Text
  className="font-display text-lg text-textPrimary"
  style={{ fontVariant: ['tabular-nums'] }}
>
  {value.toFixed(1)}{unit}
</Text>
```

### Source Tracing
| Change | Source |
|--------|--------|
| Inter consolidation | Brand guidelines v1.1 §Typography — "Inter for everything" |
| tabular-nums gaps | UX Gauntlet synthesis — Typography disagreement; brand guidelines §Typography Rules rule 2 |
| text-error fix | Exploration: class undefined in tailwind config |
| text-textTertiary fix | Exploration: class undefined in tailwind config |

## Test Plan

### FR1: Font aliases map to Inter
- [ ] `font-display` renders Inter (not Space Grotesk)
- [ ] `font-body` renders Inter (not Plus Jakarta Sans)
- [ ] `font-sans` renders Inter (unchanged)

### FR2: Font loading updated
- [ ] `useFonts` in `_layout.tsx` does not load SpaceGrotesk or PlusJakartaSans
- [ ] `Inter_800ExtraBold` is loaded
- [ ] App still renders without font errors

### FR3: Class violations fixed
- [ ] No `text-error` className anywhere in codebase
- [ ] No `text-textTertiary` className anywhere in codebase

### FR4: tabular-nums added
- [ ] SubMetric in index.tsx has `fontVariant: ['tabular-nums']`
- [ ] ApprovalCard hours/cost display has `fontVariant: ['tabular-nums']`
- [ ] MyRequestCard duration display has `fontVariant: ['tabular-nums']`
- [ ] BrainLift sub-target in ai.tsx has `fontVariant: ['tabular-nums']`

## Files to Modify

- `tailwind.config.js` — remap fontFamily aliases to Inter
- `app/_layout.tsx` — update useFonts to Inter-only
- `app/(tabs)/ai.tsx` — fix text-error, text-textTertiary (7 instances), add tabular-nums
- `app/(tabs)/index.tsx` — add tabular-nums to SubMetric
- `src/components/ApprovalCard.tsx` — add tabular-nums
- `src/components/MyRequestCard.tsx` — add tabular-nums
