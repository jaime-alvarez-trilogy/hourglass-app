# 01-design-tokens

**Status:** Draft
**Created:** 2026-03-15
**Last Updated:** 2026-03-15
**Owner:** @trilogy

---

## Overview

Upgrade the app's color token system from v1.0 to v1.1 of the brand guidelines. This involves updating four base palette tokens to the deep eggplant hue family, adding a new `goldBright` accent for hero gradient use, updating `cyan` to a more electric value, and synchronising these changes across both `src/lib/colors.ts` (JS/TS imports) and `tailwind.config.js` (NativeWind class names). Additionally, two hardcoded color violations in `app/modal.tsx` are corrected: the background hex is replaced with a token reference, and Switch toggle `trackColor` props are changed from gold to violet (toggles are interactive UI, not money indicators).

**What is being built:**
- Updated `colors.ts` with v1.1 palette values and new `goldBright` token
- Updated `tailwind.config.js` mirroring all changes exactly
- Fixed `app/modal.tsx` to use token references instead of hardcoded hex values

**How it fits:**
- This spec is the foundation that unblocks specs 02–05 (all depend on the updated palette)
- All downstream specs read from `colors.ts` and NativeWind classes — a correct token layer here prevents color drift throughout the feature

---

## Out of Scope

1. **Typography token changes** — Font family aliases, tabular-nums, and Inter consolidation are handled in spec `02-typography`. Only color tokens are in scope here.

2. **Animation tokens** — Spring config values, easing curves, and duration constants are handled in specs `03-touch-and-navigation` and `04-card-entry-animations`. Not part of the design token layer.

3. **Glass surface tokens** — Blur radii, noise texture opacity, and glow intensity values belong to `05-panel-glass-surfaces`. Out of scope here.

4. **Fixing the `bg-critical` color (#F43F5E)** — The UX Gauntlet flagged "pink" as a concern. Research confirmed brand guidelines v1.1 keep `#F43F5E` unchanged. No action needed.

5. **`UrgencyBanner.tsx` changes** — Already uses the `bg-critical` token correctly. No changes required in this spec.

6. **Adding new semantic tokens** (e.g. `interactive`, `moneyPositive`) — Descoped: v1.1 brand guidelines do not define these aliases. Direct token references are used.

---

## Functional Requirements

### FR1: Update colors.ts to v1.1 palette

Update `src/lib/colors.ts` with the v1.1 brand palette values.

**Changes:**
- `background`: `#0A0A0F` → `#0D0C14`
- `surface`: `#13131A` → `#16151F`
- `surfaceElevated`: `#1C1C28` → `#1F1E29`
- `border`: `#2A2A3D` → `#2F2E41`
- `goldBright`: Add new token `#FFDF89` (gradient endpoint for Crushed It state)
- `cyan`: `#00D4FF` → `#00C2FF`
- All other tokens remain unchanged

**Success Criteria:**
- `colors.background === '#0D0C14'`
- `colors.surface === '#16151F'`
- `colors.surfaceElevated === '#1F1E29'`
- `colors.border === '#2F2E41'`
- `colors.goldBright === '#FFDF89'` (new key exists)
- `colors.cyan === '#00C2FF'`
- `colors.gold`, `colors.violet`, all status and text tokens are unchanged

---

### FR2: Sync tailwind.config.js with updated palette

Update the `colors` section of `tailwind.config.js` to mirror the changes in FR1.

**Changes:**
- `background`: update to `#0D0C14`
- `surface`: update to `#16151F`
- `surfaceElevated`: update to `#1F1E29` (note: camelCase, matching existing key in config)
- `border`: update to `#2F2E41`
- `goldBright`: Add new entry `#FFDF89` (note: camelCase, matching colors.ts convention)
- `cyan`: update to `#00C2FF`
- All other entries remain unchanged

**Success Criteria:**
- `tailwindConfig.theme.extend.colors.background === '#0D0C14'`
- `tailwindConfig.theme.extend.colors.surface === '#16151F'`
- `tailwindConfig.theme.extend.colors.surfaceElevated === '#1F1E29'`
- `tailwindConfig.theme.extend.colors.border === '#2F2E41'`
- `tailwindConfig.theme.extend.colors.goldBright === '#FFDF89'`
- `tailwindConfig.theme.extend.colors.cyan === '#00C2FF'`

---

### FR3: Fix Switch toggle trackColors in modal.tsx

Update the two `<Switch>` components in `app/modal.tsx` so their `trackColor` props use token references instead of hardcoded hex values. Toggles are interactive UI elements; per v1.1 brand rules gold is reserved for money display only.

**Changes (lines ~81 and ~95):**
- `trackColor={{ false: '#2A2A3D', true: '#E8C97A' }}` →
  `trackColor={{ false: colors.border, true: colors.violet }}`
- Ensure `colors` is imported using the `@/` alias: `import { colors } from '@/src/lib/colors'` (consistent with existing imports in the file)

**Success Criteria:**
- No `Switch` component in `modal.tsx` has `trackColor.true` set to `'#E8C97A'` or any gold hex
- `trackColor.true` resolves to `colors.violet` (`#A78BFA`)
- `trackColor.false` resolves to `colors.border` (`#2F2E41` after FR1)

---

### FR4: Tokenize modal.tsx background color

Replace the hardcoded hex background in `app/modal.tsx` with a reference to `colors.background`.

**Change (line ~115):**
- `backgroundColor: '#0D1117'` → `backgroundColor: colors.background`

**Success Criteria:**
- No `'#0D1117'` string literal appears in `modal.tsx`
- The modal background StyleSheet entry references `colors.background`
- Import of `colors` is present in the file

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/colors.ts` | Update 4 base tokens, update cyan, add goldBright |
| `tailwind.config.js` | Mirror all color changes from colors.ts |
| `app/modal.tsx` | Replace hardcoded background hex; fix Switch trackColor props |

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/colors.ts` | Source of truth for JS/TS token values |
| `tailwind.config.js` | NativeWind class names config (must mirror colors.ts) |
| `app/modal.tsx` | Contains two violations to fix |
| `src/components/__tests__/AIConeChart.test.tsx` | Existing test pattern to follow for new tests |

### Data Flow

```
Brand Guidelines v1.1
        │
        ▼
src/lib/colors.ts  ──────────────────────────────→  Components using StyleSheet / inline styles
        │                                             (AIConeChart, Reanimated worklets, etc.)
        ▼
tailwind.config.js  ─────────────────────────────→  Components using NativeWind className props
```

Both `colors.ts` and `tailwind.config.js` are updated from the same source (brand guidelines). There is no runtime sync — they must be kept in sync manually whenever tokens change.

### Naming Conventions

- `colors.ts` keys: camelCase (`goldBright`, `surfaceElevated`, `textPrimary`)
- `tailwind.config.js` keys: camelCase — matching `colors.ts` exactly (`goldBright`, `surfaceElevated`)
- NativeWind class generation: NativeWind converts camelCase config keys to kebab-case classes automatically (`goldBright` → `bg-gold-bright`, `surfaceElevated` → `bg-surface-elevated`)

### Edge Cases

1. **Import path in modal.tsx** — The file does NOT currently import `colors`. Add: `import { colors } from '@/src/lib/colors'` — consistent with how other imports in the file use the `@/` alias (e.g. `from '@/src/store/config'`, `from '@/src/hooks/useConfig'`).

2. **tailwind.config.js structure** — Colors are under `theme.extend.colors` (confirmed by inspection). Keys use camelCase matching colors.ts (`surfaceElevated`, `goldBright`). Do not change key names — only update hex values and add the new `goldBright` entry.

3. **Other files using old hex values** — This spec does NOT do a repo-wide search-and-replace. Other hardcoded hex values in other files are the responsibility of their respective specs. Only the 3 files listed above are in scope.

4. **No new source files** — This spec creates no new source files. It is purely updates to existing files.

### Test File

New test file: `src/lib/__tests__/colors.test.ts`

Tests verify:
- Token values match spec exactly (FR1)
- Tailwind config values match spec exactly (FR2)
- modal.tsx string literal checks for FR3/FR4 violations (via source inspection or snapshot)
