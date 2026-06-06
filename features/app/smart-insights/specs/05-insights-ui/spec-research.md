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

### Existing component patterns to follow

**`ApprovalUrgencyCard`** (`src/components/ApprovalUrgencyCard.tsx`) — glass card pattern with two lines of text + accent color. Closest structural analog to InsightChip.

**`useStaggeredEntry`** (`src/hooks/useStaggeredEntry.ts`) — all tab screens use this for card entrance animation. Inputs: `count`, `baseDelay`. Returns `animatedStyles[]`.

**NativeWind className system** — all layout via `className` props with design tokens:
- Background: `bg-surface` (#1E1D2A glass), `bg-background` (#0D0C14 base)
- Text: `text-primary` (#E0E0E0), `text-secondary` (#A0A0A0), `text-muted` (#757575)
- Accent colors: `text-gold` (#E8C97A), `text-cyan` (#00C2FF), `text-violet` (#A78BFA)
- Status: standard green `#10B981`, amber `#F59E0B`, critical `#F43F5E`
- Border: `border-surface-border` — thin rim on glass cards
- Radius: `rounded-2xl` (16px) for cards, `rounded-xl` (12px) for smaller surfaces

**Typography:**
- Display numbers: `font-display` (Inter 800 ExtraBold) for hero values
- Body text: `font-body` (Inter Regular/Medium)
- Readable floor: **11pt minimum** (WIDGET-INFO-DESIGN.md rule; applies to app too for visual consistency)
- Label caps: `uppercase tracking-wider text-[11px]` for section headers like "THIS WEEK"

**Spacing / padding:**
- Card outer padding: `p-4` (16px)
- Between cards: `gap-3` (12px) within the tab scroll
- Section header: `mb-3` before the chips

**`GlassCard` pattern** — from `src/components/` (brand-polish spec): `ZStack` with `RoundedRectangle` gradient fill + specular edge + `VStack` content. On React Native side: `View` with `bg-surface border border-surface-border rounded-2xl`.

### Insight-to-chip mapping

| Insight | Bold line | Muted line | Dot color |
|---|---|---|---|
| AI trend up | "AI up +12pts over 8 weeks" | "Your best: 94% (Apr 7)" | `text-cyan` |
| AI trend down | "AI down 8pts over 8 weeks" | "Your best was 94% — 8pts gap" | amber `#F59E0B` |
| AI flat | "AI holding steady at ~88%" | "Your best: 94% (Apr 7)" | `text-cyan` |
| BrainLift correlation | "BrainLift weeks → +17pts AI next week" | "5h+ BL: 91% avg · other weeks: 74%" | `text-violet` |
| Pace prescription (active) | "Need 5.2h today · 3.1h tomorrow" | "to hit 40h by Friday" | statusColor |
| Pace prescription (done) | "You're done for the week 🎉" | "40h hit — rest or keep going" | `#10B981` |
| Pace prescription (insufficient data) | "Need X more hours · Y days left" | "Building your work pattern…" | `text-secondary` |

### "Insights" section header
Matches the existing chart section header pattern used in the Overview tab (`text-secondary uppercase tracking-wider text-[11px] mb-3`). Text: "INSIGHTS".

### Number of chips
Maximum 3 (following `appGuidance.ts` precedent). Priority order:
1. Pace prescription (always shown if `hoursData` is loaded — most actionable)
2. AI trend (shown if trend is non-null)
3. BrainLift correlation (shown if correlation is non-null)

When all 3 are null/insufficient → section hidden entirely (no "INSIGHTS" header, no empty state).

### Entry animation
`useStaggeredEntry({ count: chips.length })` — consistent with all other cards in the tab. Returns `{ getEntryStyle, isReady }`. Each chip calls `getEntryStyle(i)` to get its animated style. Stagger delay is the internal constant `STAGGER_MS = 50` — not configurable.

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
No new hex values. All colors via existing `colors.*` from `src/lib/colors.ts` or NativeWind className tokens.

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
export function useInsightChips(window: 4 | 12 | 24): InsightChipData[]
```
- Calls `usePrescription()` and `useAIInsights(window)`
- Builds chips array in priority order: prescription first, then trend, then correlation
- Filters nulls; returns max 3

### `InsightChip` component (new, in `src/components/InsightChip.tsx`)
```typescript
import type { StyleProp, ViewStyle } from 'react-native';

interface InsightChipProps {
  boldLine: string;
  mutedLine: string;
  dotColor: string;
  animatedStyle?: StyleProp<ViewStyle>; // from useStaggeredEntry's getEntryStyle(i)
}
export function InsightChip(props: InsightChipProps): React.JSX.Element
```
**Layout:**
```
<Animated.View style={animatedStyle}>
  <View className="bg-surface border border-surface-border rounded-2xl p-4 flex-row items-start gap-3">
    <View className="w-2 h-2 rounded-full mt-[6px]" style={{ backgroundColor: dotColor }} />
    <View className="flex-1">
      <Text className="text-primary font-medium text-[13px]">{boldLine}</Text>
      <Text className="text-secondary text-[11px] mt-0.5">{mutedLine}</Text>
    </View>
  </View>
</Animated.View>
```
- Bold line: 13px medium (above 11pt floor, appropriate for one-line key value)
- Muted line: 11px (at the readable floor)
- Dot: 8px circle, `mt-[6px]` to align with first text baseline

### Insights section in `overview.tsx` (modify existing)
Insert below BrainLift chart:
```typescript
const chips = useInsightChips(window);
const { getEntryStyle } = useStaggeredEntry({ count: chips.length });

{chips.length > 0 && (
  <View className="mt-4">
    <Text className="text-secondary uppercase tracking-wider text-[11px] mb-3">INSIGHTS</Text>
    <View className="gap-3">
      {chips.map((chip, i) => (
        <InsightChip key={chip.key} {...chip} animatedStyle={getEntryStyle(i)} />
      ))}
    </View>
  </View>
)}
```

## Test Plan

### `formatPrescriptionChip`
- [ ] `status: 'done'` → boldLine = "You're done for the week 🎉", dotColor = green
- [ ] `status: 'active'`, 2 days → boldLine shows today + tomorrow hours
- [ ] `patternBased: false` → mutedLine includes "standard schedule"
- [ ] `patternBased: true` → mutedLine says "based on your pattern"

### `formatTrendChip`
- [ ] Trend up, best exists → boldLine "AI up +12pts over 8 weeks", mutedLine mentions best
- [ ] Trend down → dotColor = amber, boldLine "AI down"
- [ ] Trend flat, no best → mutedLine "building history…"
- [ ] Both trend and best null → returns null

### `formatCorrelationChip`
- [ ] r = 0.6 → boldLine "BrainLift weeks → +Xpts AI next week", correct group averages in mutedLine

### `useInsightChips`
- [ ] All insights null → returns `[]`
- [ ] Only prescription available → returns 1 chip (pace)
- [ ] All 3 available → returns 3 chips in order: pace, trend, correlation
- [ ] Prescription null (hoursData loading) → pace chip absent; up to 2 chips returned

### `InsightChip` component
- [ ] Renders boldLine and mutedLine
- [ ] Dot renders with provided dotColor
- [ ] animatedStyle applied to wrapper
- [ ] 11px mutedLine text (readable floor enforced)

**Mocks needed:**
- `Prescription` fixtures (done, active, insufficient)
- `AIInsights` fixtures (all null, all present, mixed)
- `useStaggeredEntry` mock (return array of empty style objects)

## Files to Create/Modify

| File | Change |
|---|---|
| `src/lib/insightFormatting.ts` | New — `InsightChipData` type + 3 formatter functions |
| `src/hooks/useInsightChips.ts` | New — `useInsightChips` composing hook |
| `src/components/InsightChip.tsx` | New — `InsightChip` display component |
| `app/(tabs)/overview.tsx` | Add Insights section below BrainLift chart (≤20 lines) |
| `src/__tests__/lib/insightFormatting.test.ts` | New — formatter tests |
| `src/__tests__/components/InsightChip.test.tsx` | New — component render tests |

## Verification Tiers

- **Tier 1 (unit tests):** Formatter functions and hook composition.
- **Tier 2 (live UI):** Run in Expo Go simulator. Verify:
  - Chips appear below BrainLift chart with correct spacing
  - Entry animation plays on tab switch
  - When all insights null, section is completely invisible (no stray margin/header)
  - Dot colors match design tokens (no hardcoded values)
  - Text does not truncate on narrower devices (iPhone SE width)
- **Tier 3 (TestFlight):** Open Overview tab. Verify INSIGHTS section animates in smoothly, chips are readable, tapping navigates correctly (no tap target — purely informational).
