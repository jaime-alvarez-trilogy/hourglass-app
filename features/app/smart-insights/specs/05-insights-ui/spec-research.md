# Spec Research: 05-insights-ui

## Problem

The insights computed in specs 03 and 04 need a surface. They live in the Overview tab, below the BrainLift chart, as 1–3 compact chips. When all insights are null/insufficient, the section hides entirely. The design must be pixel-perfect with the existing Overview aesthetic — same glass surfaces, same tokens, same entry animation, same 11pt readable floor.

## Exploration Findings

### Overview tab current structure (`app/(tabs)/overview.tsx:365-516`)
Render order (bottom of screen, below charts):
1. ApprovalUrgencyCard (manager-only)
2. OverviewHeroCard
3. EarningsPaceCard
4. WeekSnapshotPanel (during scrub)
5. EarningsChart (full-width)
6. Hours + AI% charts (side-by-side)
7. BrainLift chart (full-width)
→ **Insights section goes here, below BrainLift chart**

### Existing component patterns to follow (verified against real source)

**`ApprovalUrgencyCard`** (`src/components/ApprovalUrgencyCard.tsx`) — the canonical reference. It composes `GlassCard` + `SectionLabel` + `AnimatedPressable`, and reads colors from `@/src/lib/colors` (`import { colors } from '@/src/lib/colors'`). `InsightChip` follows this exact composition — it does NOT hand-roll a surface.

**`GlassCard`** (`src/components/GlassCard.tsx`) — default export. Props: `{ children, className?, padding?: 'md'|'lg', radius?: 'xl'|'2xl', elevated?, borderAccentColor?, pressable?, onPress?, layerBudget?, style?, testID? }`. Skia BackdropFilter glass surface with gradient border. **Convention: max 3 overlapping GlassCards per viewport (SIGKILL avoidance).** Insights add ≤3 chips at the bottom of a scroll view — never more than ~1–2 visible at once, within budget. Use `layerBudget` flat-fallback if a perf issue appears on device.

**`SectionLabel`** (`src/components/SectionLabel.tsx`) — default export `<SectionLabel className?>`. Base classes: `text-textSecondary font-sans-semibold text-xs uppercase tracking-widest`. This is THE section-header primitive — reuse it, do not re-implement the header inline.

**`useStaggeredEntry`** (`src/hooks/useStaggeredEntry.ts`) — options `{ count, maxStaggerIndex? }`. Returns `{ getEntryStyle, isReady }`. `getEntryStyle(i): StyleProp<ViewStyle>`. Stagger delay is the fixed internal constant `STAGGER_MS = 50` — there is NO `baseDelay` option. `count` MUST be a compile-time constant (Rules of Hooks — see D7).

**Real NativeWind tokens** (from `tailwind.config.js`, v1.1 eggplant palette — these are the ACTUAL class names; the earlier draft used names that do not exist and would render invisibly):
- Background: `bg-background` (#0D0C14), `bg-surface` (#16151F), `bg-surfaceElevated` (#1F1E29)
- Text: `text-textPrimary` (#E0E0E0), `text-textSecondary` (#A0A0A0), `text-textMuted` (#757575)
- Accent: `text-gold` (#E8C97A), `text-cyan` (#00C2FF), `text-violet` (#A78BFA)
- Border: `border-border` (#2F2E41)
- Radius: `rounded-2xl` (16px), `rounded-xl` (12px)

**Typography** (v2.0 three-font system; reference `BRAND_GUIDELINES.md`):
- Display: `font-display` = **SpaceGrotesk_700Bold** (hero metrics/headings — NOT Inter 800)
- Body weights: `font-sans` / `font-body` (Inter 400), `font-sans-medium` / `font-body-medium` (Inter 500), `font-sans-semibold` (Inter 600)
- **Chip legibility floor: ≥11px.** This is a *local spec decision* for chip readability, not an app-wide rule — the Overview already ships 10px axis/labels (`overview.tsx:408+`). We hold chip text ≥11px so the two-line chip stays scannable.

**Spacing / padding:**
- Use `GlassCard padding="md"` for chip inner padding (matches other cards).
- Between chips: `gap-3` (12px).
- Section header: `<SectionLabel className="mb-3">`.

### Insight-to-chip mapping

Color is locked to meaning (`colors.*` from `src/lib/colors.ts`): gold=money, cyan=AI, violet=BrainLift, statusColor=pace.

| Insight | Bold line | Muted line | Dot color |
|---|---|---|---|
| AI trend up | "AI up +12pts over 8 weeks" | "Your best: 94% (Apr 7)" | `colors.cyan` |
| AI trend down | "AI down 8pts over 8 weeks" | "Your best was 94% — 8pts gap" | `colors.cyan` (direction conveyed in text, not hue — keeps cyan=AI lock; see N2) |
| AI flat | "AI holding steady at ~88%" | "Your best: 94% (Apr 7)" | `colors.cyan` |
| BrainLift correlation | "BrainLift weeks → +17pts AI next week" | "5h+ BL: 91% avg · other weeks: 74%" | `colors.violet` |
| Pace prescription (active) | "Need 5.2h today · 3.1h Tue" | "based on your pattern" | statusColor (pace) |
| Pace prescription (done) | "You're done for the week" | "40h hit — rest or keep going" | `colors.success` (green) |
| Pace prescription (insufficient data) | "Need X more hours · Y days left" | "Building your work pattern…" | `colors.textSecondary` |

Note: pace `summaryLine` text comes pre-formatted from spec 03's `Prescription.summaryLine` — no emoji (dropped per N4; the green dot carries the positive signal). The bold/muted split here is the chip-formatting layer's job.

### "Insights" section header
Reuse `<SectionLabel className="mb-3">INSIGHTS</SectionLabel>` — do NOT hand-code a `<Text>`. The earlier draft's `tracking-wider`/`text-[11px]`/`text-secondary` did not match the real `SectionLabel` (`tracking-widest`/`text-xs`/`text-textSecondary`/`font-sans-semibold`).

### Number of chips
Maximum 3 (following `appGuidance.ts` precedent). Priority order:
1. Pace prescription (always shown if `hoursData` is loaded — most actionable)
2. AI trend (shown if trend is non-null)
3. BrainLift correlation (shown if correlation is non-null)

When all 3 are null/insufficient → section hidden entirely (no "INSIGHTS" header, no empty state).

### Entry animation — reuse the existing cascade, do not create a second instance
The Overview already runs ONE `useStaggeredEntry({ count: 3 })` at `overview.tsx:221`, driving the Earnings→Hours/AI→BrainLift cascade via `getEntryStyle(0/1/2)`. The insights section CONTINUES that single cascade rather than starting a new one:
- Bump the existing call `count: 3` → `count: 6` (chips occupy indices 3, 4, 5).
- Insight chips call `getEntryStyle(3 + i)`.
- `count` stays a compile-time literal (`6`) — never `chips.length` (Rules-of-Hooks violation; see D7).
- The existing stagger test `src/hooks/__tests__/useStaggeredEntry.test.ts` asserts count `3` — update its relevant assertion to `6` (added to Files to Modify).

## Key Decisions

**D1: `InsightChip` is a single pure display component.**
Takes `{ boldLine, mutedLine, dotColor }`. No logic — formatting done by the hook/lib. Easy to test, easy to style.

**D2: Section wrapper hides when `chips.length === 0`.**
No empty state, no spinner, no "no data" message. Presence = meaningful. Absence = silent.

**D3: Dot indicator, not an icon.**
A 8px filled circle (`rounded-full w-2 h-2`) in the accent color. Lower visual weight than SF Symbols or emoji. Keeps the chip looking like a data item, not a notification.

**D4: `useInsightChips` hook assembles all chips in priority order.**
Consumes `usePrescription()` and `useAIInsights(window)`. Returns `InsightChipData[]`. Single hook for the UI.

**D5: Chip text formatting lives in `src/lib/insightFormatting.ts`.**
Pure functions: `formatTrendChip(trend, best)`, `formatCorrelationChip(corr)`, `formatPrescriptionChip(prescription)`. Each returns `{ boldLine, mutedLine, dotColor }`. Decoupled from hooks — testable independently.

**D6: Design token compliance is enforced by code review, not lint (as per CLAUDE.md).**
No new hex values. All colors via existing `colors.*` from `src/lib/colors.ts` or NativeWind className tokens. `InsightChip` composes `GlassCard` + `SectionLabel` (the established card/header primitives) rather than hand-rolling a `View` surface.

**D7: `useStaggeredEntry` count is a compile-time constant — reuse the existing instance.**
Rules of Hooks forbid a variable hook-call count. The number of internal `useSharedValue`/`useAnimatedStyle` calls inside `useStaggeredEntry` is fixed by `count` at mount; passing `chips.length` (which grows 0→3 as async data loads) would throw "Rendered more/fewer hooks than previous render" and crash the Overview tab. Resolution: do not add a second `useStaggeredEntry`; bump the existing `count: 3`→`6` at `overview.tsx:221` and have chips use `getEntryStyle(3 + i)`. Out-of-range indices return a harmless resting style.

**D8: Every new exported function gets a 2–3 line JSDoc (CLAUDE.md rule).**
`formatPrescriptionChip`/`formatTrendChip`/`formatCorrelationChip` and `useInsightChips` each get a short JSDoc (what it returns; null behavior; composed hooks). `InsightChip` is a component — no JSDoc required.

## Interface Contracts

### `InsightChipData` type (new, in `src/lib/insightFormatting.ts`)
```typescript
export interface InsightChipData {
  key: string;        // stable key for React list ('pace' | 'ai-trend' | 'brainlift')
  boldLine: string;   // primary line — max ~55 chars
  mutedLine: string;  // secondary line — max ~55 chars
  dotColor: string;   // hex from existing palette only
}
```

### `insightFormatting.ts` (new, in `src/lib/insightFormatting.ts`)
```typescript
export function formatPrescriptionChip(p: Prescription): InsightChipData
export function formatTrendChip(trend: AITrendInsight | null, best: AIBestInsight | null): InsightChipData | null
export function formatCorrelationChip(c: BrainLiftCorrelationInsight): InsightChipData
```

### `useInsightChips` hook (new, in `src/hooks/useInsightChips.ts`)
```typescript
/**
 * Assembles up to 3 insight chips in priority order (pace → AI trend → BrainLift
 * correlation). Composes usePrescription() + useAIInsights(). Returns [] when no
 * insight is available (caller hides the whole section). Never longer than 3.
 */
export function useInsightChips(): InsightChipData[]
```
- Calls `usePrescription()` and `useAIInsights()` (NO window param — insights always use full history; see spec 04 M3 fix)
- Null-guards BEFORE formatting (the formatters for pace + correlation require non-null input; `formatTrendChip` self-guards):
```typescript
const p = usePrescription();              // Prescription | null
const ai = useAIInsights();               // AIInsights (fields nullable)
const chips: InsightChipData[] = [];
if (p) chips.push(formatPrescriptionChip(p));
const t = formatTrendChip(ai.trend, ai.best);
if (t) chips.push(t);
if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));
return chips.slice(0, 3);
```
- Note: `formatTrendChip` returns `InsightChipData | null` (self-guards); `formatPrescriptionChip` and `formatCorrelationChip` require non-null inputs — hence the explicit guards above.

### `InsightChip` component (new, in `src/components/InsightChip.tsx`)
```typescript
import type { StyleProp, ViewStyle } from 'react-native';

interface InsightChipProps {
  boldLine: string;
  mutedLine: string;
  dotColor: string;
  animatedStyle?: StyleProp<ViewStyle>; // from useStaggeredEntry's getEntryStyle(3 + i)
}
export function InsightChip(props: InsightChipProps): React.JSX.Element
```
**Layout — composes `GlassCard`, row layout on an INNER View (matches `ApprovalUrgencyCard.tsx:116`):**

> **Critical:** `GlassCard` does NOT honor `className` — the prop is declared and destructured but never applied to any rendered element (`src/components/GlassCard.tsx:85,101`; children are hard-wrapped in `<View style={{ padding, flex: 1 }}>` at line 248, default column direction), and the repo has no `cssInterop`/`remapProps` to auto-wire it. So flex/layout classes MUST go on an inner `<View>`, exactly as `ApprovalUrgencyCard` does. Do NOT pass layout `className` to `GlassCard`, and do NOT "fix" GlassCard to honor className (it's a shared, SIGKILL-sensitive Skia component — out of scope and risky).

```tsx
<Animated.View style={animatedStyle}>
  <GlassCard padding="md">
    <View className="flex-row items-start gap-3">
      <View className="w-2 h-2 rounded-full mt-[6px]" style={{ backgroundColor: dotColor }} />
      <View className="flex-1">
        <Text className="text-textPrimary font-sans-medium text-[13px]">{boldLine}</Text>
        <Text className="text-textSecondary text-[11px] mt-0.5">{mutedLine}</Text>
      </View>
    </View>
  </GlassCard>
</Animated.View>
```
- Row layout (`flex-row items-start gap-3`) lives on the inner View, NOT on GlassCard.
- Bold line: 13px `font-sans-medium`, `text-textPrimary`
- Muted line: 11px `text-textSecondary` (chip legibility floor)
- Dot: 8px circle (`w-2 h-2`), `dotColor` is a `colors.*` hex passed via `style`, `mt-[6px]` to align with first text baseline

### Insights section in `overview.tsx` (modify existing)
1. Bump the existing stagger call at `overview.tsx:221`: `useStaggeredEntry({ count: 3 })` → `useStaggeredEntry({ count: 6 })`. (Single shared cascade — see D7. `window` state at `overview.tsx:227` is reused as-is; no new state.)
2. Add the chips hook near the other hook calls: `const insightChips = useInsightChips();`
3. Insert below the BrainLift chart block:
```tsx
{insightChips.length > 0 && (
  <View className="mt-4">
    <SectionLabel className="mb-3">INSIGHTS</SectionLabel>
    <View className="gap-3">
      {insightChips.map((chip, i) => (
        <InsightChip key={chip.key} {...chip} animatedStyle={getEntryStyle(3 + i)} />
      ))}
    </View>
  </View>
)}
```
- `getEntryStyle` is already destructured at `overview.tsx:221` — reuse that binding (do NOT re-destructure; that would be a duplicate-const error).
- Imports to add: `InsightChip` from `@/src/components/InsightChip`, `SectionLabel` from `@/src/components/SectionLabel` (if not already imported), `useInsightChips` from `@/src/hooks/useInsightChips`.

## Test Plan

### `formatPrescriptionChip`
- [ ] `status: 'done'` → boldLine = "You're done for the week" (NO emoji), dotColor = `colors.success`
- [ ] `status: 'active'`, 2 days → boldLine shows today + tomorrow hours (from `Prescription.summaryLine`)
- [ ] `patternBased: false` → mutedLine includes "standard schedule"
- [ ] `patternBased: true` → mutedLine says "based on your pattern"
- [ ] `status: 'insufficient_data'` → dotColor = `colors.textSecondary`, mutedLine "Building your work pattern…"

### `formatTrendChip`
- [ ] Trend up, best exists → boldLine "AI up +12pts over 8 weeks", mutedLine mentions best
- [ ] Trend down → boldLine "AI down 8pts…", dotColor stays `colors.cyan` (direction in text, not hue)
- [ ] Trend flat, no best → mutedLine "building history…"
- [ ] Both trend and best null → returns null

### `formatCorrelationChip`
- [ ] r = 0.6 → boldLine "BrainLift weeks → +Xpts AI next week", correct group averages in mutedLine

### `useInsightChips`
- [ ] All insights null → returns `[]`
- [ ] Only prescription available → returns 1 chip (pace)
- [ ] All 3 available → returns 3 chips in order: pace, trend, correlation
- [ ] Prescription null (hoursData loading) → pace chip absent; up to 2 chips returned
- [ ] Null-guard order: a null `brainliftCorrelation` must NOT be passed to `formatCorrelationChip` (verifies the explicit guard, not post-format filtering)

### `InsightChip` component
- [ ] Renders boldLine and mutedLine
- [ ] Dot renders with provided dotColor
- [ ] animatedStyle applied to wrapper
- [ ] Composes `GlassCard` (assert GlassCard is rendered, not a bare View)
- [ ] Row layout (`flex-row`) is on the INNER View, NOT passed as `className` to GlassCard (GlassCard ignores className — guards the N5 regression; assert the inner wrapper carries the flex-row class)
- [ ] 11px mutedLine text (chip legibility floor)

**Mocks needed:**
- `Prescription` fixtures (done, active, insufficient)
- `AIInsights` fixtures (all null, all present, mixed)
- `useStaggeredEntry` mock — return `{ getEntryStyle: () => ({}), isReady: true }` (matches real `{ getEntryStyle, isReady }` shape, NOT an array)
- `GlassCard` mock or real render (assert composition)

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/insightFormatting.ts` | New — `InsightChipData` type + 3 formatter functions (each JSDoc'd) |
| `src/hooks/useInsightChips.ts` | New — `useInsightChips()` composing hook (no window param) |
| `src/components/InsightChip.tsx` | New — composes `GlassCard` + dot + two text lines |
| `app/(tabs)/overview.tsx` | Bump existing `useStaggeredEntry({count:3})`→`{count:6}` (line 221); add `useInsightChips()` call; add Insights section below BrainLift chart using `getEntryStyle(3+i)` (≤20 lines) |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | **Required.** The FR5 test "calls useStaggeredEntry with count: 3" (~line 380, regex `/useStaggeredEntry\s*\(\s*\{\s*count\s*:\s*3/`) WILL fail after the bump — change it to `count: 6`. Do NOT change the other two FR5 tests ("exactly 3 getEntryStyle calls" ~line 398, "toggle ≤ 3" ~line 411): chip calls are written `getEntryStyle(3 + i)` (space + identifier), which the `/getEntryStyle\(\d+\)/g` literal-arg regex does not match, so those assertions stay correct. |
| `app/(tabs)/__tests__/overview.test.tsx` | Update if the new section changes the render tree the test asserts (verify existing assertions; add INSIGHTS-hidden-when-empty case) |
| `src/lib/__tests__/insightFormatting.test.ts` | New — formatter tests (dominant lib-test convention) |
| `src/components/__tests__/InsightChip.test.tsx` | New — component render tests (co-located with `ApprovalUrgencyCard.test.tsx`, the dominant component-test convention) |

## Verification Tiers

- **Tier 1 (unit tests):** Formatter functions and hook composition.
- **Tier 2 (live UI):** Run in Expo Go simulator. Verify:
  - Chips appear below BrainLift chart with correct spacing, as `GlassCard` surfaces matching the other cards
  - Entry animation continues the single Earnings→Hours/AI→BrainLift→insights cascade (chips at stagger indices 3/4/5), not a separate timeline
  - When all insights null, section is completely invisible (no stray margin/header)
  - Text renders in `textPrimary`/`textSecondary` (NOT default black — proves tokens resolve)
  - INSIGHTS header is visually identical to other `SectionLabel` headers on the screen
  - Text does not truncate on narrower devices (iPhone SE width)
- **Tier 3 (TestFlight):** Open Overview tab. Verify INSIGHTS section animates in smoothly, chips are readable, tapping navigates correctly (no tap target — purely informational).
