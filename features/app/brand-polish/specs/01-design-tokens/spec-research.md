# Spec Research: 01-design-tokens

## Problem Context

The app's color tokens are defined in two places that must stay in sync:
- `src/lib/colors.ts` — JS object imported by components
- `tailwind.config.js` — NativeWind class names

The v1.0 palette uses generic near-black (#0A0A0F). v1.1 upgrades to a deep eggplant (#0D0C14) with proportionally shifted surface tiers. New tokens: `goldBright` for hero earnings gradients, `cyan` bumped from #00D4FF → #00C2FF.

Additionally, `app/modal.tsx` uses a hardcoded hex `#0D1117` (not a token) for its background.

The Settings toggle in modal.tsx has `trackColor={{ true: '#E8C97A' }}` — hardcoded gold inline, violating the gold=money-only rule.

## Exploration Findings

**`src/lib/colors.ts`** — defines all tokens as a plain object. Used by components that can't use NativeWind (e.g. StyleSheet, inline styles, Reanimated worklets).

**`tailwind.config.js`** lines 22–45 — mirrors colors.ts. Must be kept in sync manually.

**`app/modal.tsx`** line 115: `backgroundColor: '#0D1117'` — should use `colors.background`.
**`app/modal.tsx`** lines 81, 95: `trackColor={{ false: '#2A2A3D', true: '#E8C97A' }}` — Switch toggles using hardcoded gold. Should be `colors.border` (false) and `colors.violet` (true) — toggles are interactive UI, not money.

**`UrgencyBanner.tsx`** — correctly uses `bg-critical` token. The "pink" complaint from the UX review is about the critical color itself (#F43F5E). The v1.1 guidelines keep this color unchanged. No fix needed here.

## Key Decisions

1. **Eggplant palette** — shift all four base tokens: background #0D0C14, surface #16151F, surfaceElevated #1F1E29, border #2F2E41. Both colors.ts and tailwind.config.js updated in lockstep.
2. **goldBright added** — #FFDF89 as a gradient endpoint for Crushed It state. Added to colors.ts and tailwind as `gold-bright`.
3. **cyan updated** — #00D4FF → #00C2FF. More electric, less generic.
4. **Switch toggles** — change from gold to violet. Toggles are interactive UI elements, not money. `violet` is now the primary interactive accent per v1.1.
5. **Modal hardcoded color** — replace with `colors.background`.

## Interface Contracts

```typescript
// src/lib/colors.ts — updated values
export const colors = {
  // Base palette v1.1
  background:      '#0D0C14',  // was #0A0A0F
  surface:         '#16151F',  // was #13131A
  surfaceElevated: '#1F1E29',  // was #1C1C28
  border:          '#2F2E41',  // was #2A2A3D

  // Accents — updated
  gold:      '#E8C97A',  // unchanged
  goldBright:'#FFDF89',  // NEW — gradient endpoint for Crushed It
  cyan:      '#00C2FF',  // was #00D4FF
  violet:    '#A78BFA',  // unchanged

  // Status — unchanged
  success:     '#10B981',
  warning:     '#F59E0B',
  critical:    '#F43F5E',
  destructive: '#F85149',

  // Text — unchanged
  textPrimary:   '#FFFFFF',
  textSecondary: '#8B949E',
  textMuted:     '#484F58',
}
```

```javascript
// tailwind.config.js — colors section (mirrors above)
colors: {
  background:       '#0D0C14',
  surface:          '#16151F',
  'surface-elevated': '#1F1E29',
  border:           '#2F2E41',
  gold:             '#E8C97A',
  'gold-bright':    '#FFDF89',
  cyan:             '#00C2FF',
  // ... rest unchanged
}
```

### Source Tracing
| Token | Source |
|-------|--------|
| All base tokens | Brand guidelines v1.1 §Colour System |
| goldBright | Brand guidelines v1.1 §Accent Colours |
| cyan update | Brand guidelines v1.1 §Accent Colours |
| Switch fix | UX Gauntlet synthesis — gold misuse rule |

## Test Plan

### FR1: colors.ts updated
- [ ] `colors.background` equals `#0D0C14`
- [ ] `colors.surface` equals `#16151F`
- [ ] `colors.surfaceElevated` equals `#1F1E29`
- [ ] `colors.border` equals `#2F2E41`
- [ ] `colors.goldBright` equals `#FFDF89`
- [ ] `colors.cyan` equals `#00C2FF`

### FR2: tailwind config synced
- [ ] NativeWind `bg-background` resolves to `#0D0C14`
- [ ] NativeWind `bg-surface` resolves to `#16151F`
- [ ] NativeWind `text-cyan` resolves to `#00C2FF`
- [ ] NativeWind `bg-gold-bright` class exists

### FR3: Switch toggles fixed
- [ ] Manager Preview toggle `trackColor.true` uses violet, not gold
- [ ] Overtime Preview toggle `trackColor.true` uses violet, not gold

### FR4: Modal background tokenized
- [ ] `modal.tsx` uses `colors.background` not `'#0D1117'`

## Files to Modify

- `src/lib/colors.ts` — update base palette, add goldBright, update cyan
- `tailwind.config.js` — mirror all color changes
- `app/modal.tsx` — tokenize background, fix switch trackColors
