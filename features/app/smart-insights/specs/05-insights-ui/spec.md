# 05-Insights UI

**Status:** Draft
**Created:** 2026-06-06
**Last Updated:** 2026-06-06
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

This spec adds the **Insights UI** layer for the Smart Insights feature — the surface that renders computed insights inside the Overview tab. It consists of three new files and targeted edits to two existing files:

1. **`InsightChipData` type + formatting functions** (`src/lib/insightFormatting.ts`) — pure functions that convert raw `Prescription`, `AITrendInsight`, `AIBestInsight`, and `BrainLiftCorrelationInsight` values into display-ready `{ key, boldLine, mutedLine, dotColor }` objects.

2. **`useInsightChips` hook** (`src/hooks/useInsightChips.ts`) — composes `usePrescription()` and `useAIInsights()`, null-guards each insight, calls the appropriate formatter, and returns up to 3 chips in priority order (pace → AI trend → BrainLift correlation).

3. **`InsightChip` component** (`src/components/InsightChip.tsx`) — a pure display component that renders one chip as a `GlassCard` containing a colored dot, a bold primary line, and a muted secondary line. Accepts an `animatedStyle` prop for the staggered-entry animation.

4. **`overview.tsx` edits** — bumps the existing `useStaggeredEntry({ count: 3 })` to `{ count: 6 }` so chips at indices 3/4/5 join the existing entry cascade, calls `useInsightChips()`, and conditionally renders an INSIGHTS section (using `SectionLabel`) below the BrainLift chart.

5. **`useStaggeredEntry.test.ts` update** — updates the count: 3 assertion to count: 6.

### How It Fits Into the System

```
usePrescription()  ─┐
                    ├── useInsightChips() → InsightChipData[] → <InsightChip />
useAIInsights()    ─┘                                              ↓
                                                    overview.tsx Insights section
                                                    (below BrainLift chart)
```

- Spec 03 (`usePrescription`) and Spec 04 (`useAIInsights`) are upstream dependencies — both must be complete before this spec can be implemented.
- The `InsightChip` component composes `GlassCard` (existing, glass surface) and `SectionLabel` (existing, section header primitive) — no new primitives.
- Animation reuses the single existing `useStaggeredEntry` call in `overview.tsx`; chip indices 3, 4, 5 continue the same cascade as earnings/hours/BrainLift charts at 0, 1, 2.
- When all insights are null/insufficient (zero chips), the entire section (header + chips) is hidden with no empty state.

### Design Principles

- **Token-only styling** — all colors from `src/lib/colors.ts`; all classes from the existing NativeWind palette in `tailwind.config.js`. No new hex values.
- **Composition over hand-rolling** — `InsightChip` wraps `GlassCard` (not a bare `View`) to match the glass surface aesthetic of `ApprovalUrgencyCard`.
- **Row layout on inner View** — `GlassCard` ignores `className`; flex-row layout goes on an inner `<View>` (documented in spec-research: D1/D6, Critical note).
- **Chip legibility floor** — bold line ≥13px, muted line ≥11px (local chip readability decision; other Overview elements already use 10px).
- **Priority order** — pace prescription first (most actionable), AI trend second, BrainLift correlation third. Max 3 chips total.

---

## Out of Scope

1. **Widget prescription line** — Deferred to the widget layout redesign (WIDGET-INFO-DESIGN.md). The prescription text belongs in the widget status row, but the layout spec is not finalized. Only the Overview tab receives insights in this spec.

2. **Push notification for pace urgency** — Deferred to a future notification-enhancement spec. The notification pipeline is already complex; insights must be validated on-screen before introducing a new trigger category.

3. **Tappable chips (navigation)** — Descoped. Chips are informational only — no tap target, no navigation. `AnimatedPressable` is not used. The chip layout is explicitly non-interactive.

4. **Empty state or loading indicator for insights** — Descoped. When zero chips are returned, the section disappears entirely (no "checking your data..." spinner, no "not enough data" card). Presence is meaningful; absence is silent.

5. **`GlassCard` className fix** — Descoped. `GlassCard` is a shared, SIGKILL-sensitive Skia component. The observation that it ignores `className` is documented in spec-research; the correct fix is to put layout classes on an inner `<View>`. Making `GlassCard` honor `className` is out of scope and risky in this sprint.

6. **Second `useStaggeredEntry` instance** — Descoped. A new `useStaggeredEntry` call for insights alone would create a separate cascade and violate the single-cascade design. The existing call at `overview.tsx:221` is bumped from `count: 3` to `count: 6`; chips use indices 3/4/5.

7. **Earnings-at-risk from pending manual time** — Descoped. Requires joining work diary status with approval state — separate feature, separate research.

8. **AI% normalization / quality weighting** — Descoped. Existing midpoint formula is validated and sufficient. No change to how AI% is computed.

9. **Social / peer comparison** — Never in scope. Hourglass is personal-only.

10. **Trend chip color change on direction** — Descoped per spec-research N2. Both up and down trends use `colors.cyan` (the AI-color lock). Direction is conveyed in the bold line text ("AI up" vs "AI down"), not by hue change.

11. **Emoji in chip text** — Descoped per spec-research N4. The green dot carries the positive signal for the "done" prescription state; the `summaryLine` text from Spec 03 is emoji-free.

---

## Functional Requirements

### FR1 — `InsightChipData` type and formatter functions (`src/lib/insightFormatting.ts`)

Create `src/lib/insightFormatting.ts` exporting:

```typescript
export interface InsightChipData {
  key: string;        // stable React list key: 'pace' | 'ai-trend' | 'brainlift'
  boldLine: string;   // primary text line, max ~55 chars
  mutedLine: string;  // secondary text line, max ~55 chars
  dotColor: string;   // hex from colors.* palette only (no raw hex literals)
}
```

Three formatter functions, each JSDoc'd:

**`formatPrescriptionChip(p: Prescription): InsightChipData`**
- `status === 'done'` → boldLine = `"You're done for the week"`, mutedLine = `"40h hit — rest or keep going"`, dotColor = `colors.success`
- `status === 'active'` → boldLine = Prescription's `summaryLine` field (already formatted by Spec 03), mutedLine = `"based on your pattern"` when `patternBased === true`, else `"based on standard schedule"`, dotColor = `colors.success` (on-track pace color)
- `status === 'insufficient_data'` → boldLine derived from remaining hours/days (e.g. `"Need X more hours · Y days left"`), mutedLine = `"Building your work pattern…"`, dotColor = `colors.textSecondary`
- Always returns key `'pace'`

**`formatTrendChip(trend: AITrendInsight | null, best: AIBestInsight | null): InsightChipData | null`**
- Returns null when `trend === null` AND `best === null` (no data)
- `trend.direction === 'up'` → boldLine `"AI up +{Math.round(trend.slopePts)}pts over {trend.weeksUsed} weeks"`
- `trend.direction === 'down'` → boldLine `"AI down {Math.round(Math.abs(trend.slopePts))}pts over {trend.weeksUsed} weeks"`
- `trend.direction === 'flat'` → boldLine `"AI holding steady at ~{Math.round(best?.currentPct ?? 0)}%"` (use `best.currentPct` if available, else omit the tilde-number)
- When `best` is non-null → mutedLine includes best value and date label: `"Your best: {peakPct}% ({weekLabel})"`; or append `"– {ptsBelowBest}pts gap"` for down-trend (all fields from `AIBestInsight`)
- When `best` is null → mutedLine `"building history…"`
- dotColor = `colors.cyan` (AI color lock — up/down direction conveyed in text only, not hue)
- Returns key `'ai-trend'`

**`formatCorrelationChip(c: BrainLiftCorrelationInsight): InsightChipData`**
- Receives a non-null `BrainLiftCorrelationInsight` (caller guards)
- boldLine = `"BrainLift weeks → +{delta}pts AI next week"` where `delta = Math.round(highBLAvgAIPct - lowBLAvgAIPct)`
- mutedLine = `"5h+ BL: {highBLAvgAIPct}% avg · other weeks: {lowBLAvgAIPct}%"` (both rounded to nearest int)
- dotColor = `colors.violet`
- Returns key `'brainlift'`

**Success Criteria:**
- [ ] All three functions are exported from `src/lib/insightFormatting.ts`
- [ ] `InsightChipData` interface is exported
- [ ] Each function has a 2–3 line JSDoc
- [ ] No raw hex literals in functions — all colors via `colors.*`
- [ ] `formatTrendChip` returns `null` when both args are null
- [ ] `formatPrescriptionChip` handles all three `status` values without throwing
- [ ] `formatCorrelationChip` does not null-check its input (caller's responsibility)

---

### FR2 — `useInsightChips` hook (`src/hooks/useInsightChips.ts`)

Create `src/hooks/useInsightChips.ts`:

```typescript
/**
 * Assembles up to 3 insight chips in priority order (pace → AI trend → BrainLift
 * correlation). Composes usePrescription() + useAIInsights(). Returns [] when no
 * insight is available (caller hides the whole section). Never longer than 3.
 */
export function useInsightChips(): InsightChipData[]
```

Implementation:
```typescript
const p = usePrescription();
const ai = useAIInsights();
const chips: InsightChipData[] = [];
if (p) chips.push(formatPrescriptionChip(p));
const t = formatTrendChip(ai.trend, ai.best);
if (t) chips.push(t);
if (ai.brainliftCorrelation) chips.push(formatCorrelationChip(ai.brainliftCorrelation));
return chips.slice(0, 3);
```

- Does NOT accept a `window` parameter — always uses full history (per Spec 04 M3)
- Null-guards pace (`if (p)`) and correlation (`if (ai.brainliftCorrelation)`) before calling formatters
- `formatTrendChip` self-guards (handles its own null inputs)
- Returns at most 3 chips via `.slice(0, 3)`

**Success Criteria:**
- [ ] Hook exported from `src/hooks/useInsightChips.ts`
- [ ] Hook has JSDoc matching spec-research D8
- [ ] Returns `[]` when all insights are null/insufficient
- [ ] Returns chips in priority order: pace first, AI trend second, BrainLift correlation third
- [ ] Never passes null to `formatPrescriptionChip` or `formatCorrelationChip`
- [ ] Calls `useAIInsights()` with no arguments
- [ ] Result never longer than 3 items

---

### FR3 — `InsightChip` component (`src/components/InsightChip.tsx`)

Create `src/components/InsightChip.tsx`:

```typescript
interface InsightChipProps {
  boldLine: string;
  mutedLine: string;
  dotColor: string;
  animatedStyle?: StyleProp<ViewStyle>;
}
export function InsightChip(props: InsightChipProps): React.JSX.Element
```

Layout structure:
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

Key layout constraints (from spec-research Critical note):
- `flex-row items-start gap-3` lives on the INNER `<View>`, NOT on `GlassCard` (GlassCard ignores className)
- Dot is a `View` with `rounded-full w-2 h-2` and `backgroundColor: dotColor` via inline style
- `mt-[6px]` on dot aligns it with the first text baseline
- Bold line: 13px, `text-textPrimary`, `font-sans-medium`
- Muted line: 11px, `text-textSecondary` (chip legibility floor)
- Wrapper: `Animated.View` from `react-native-reanimated`

**Success Criteria:**
- [ ] Component exported from `src/components/InsightChip.tsx`
- [ ] Renders `boldLine` and `mutedLine` text
- [ ] Dot rendered as 8px circle with `dotColor` applied via inline style
- [ ] `animatedStyle` applied to the outermost `Animated.View` wrapper
- [ ] Composes `GlassCard` (not a bare `View` surface)
- [ ] `flex-row` layout is on the inner `<View>`, NOT on `GlassCard`
- [ ] Muted line is exactly 11px
- [ ] No TypeScript errors

---

### FR4 — Insights section in `overview.tsx` and stagger bump

Modify `app/(tabs)/overview.tsx`:

1. **Bump stagger count** (line ~221): `useStaggeredEntry({ count: 3 })` → `useStaggeredEntry({ count: 6 })`

2. **Add hook call** near other hook calls: `const insightChips = useInsightChips();`

3. **Insert Insights section** below the BrainLift chart block:
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

4. **Add imports**: `InsightChip` from `@/src/components/InsightChip`, `useInsightChips` from `@/src/hooks/useInsightChips`, `SectionLabel` from `@/src/components/SectionLabel` (if not already imported).

5. **Update `useStaggeredEntry.test.ts`**: Change the assertion matching `count: 3` at ~line 380 to `count: 6`. Do NOT change the "exactly 3 getEntryStyle calls" or "toggle ≤ 3" assertions.

**Success Criteria:**
- [ ] `useStaggeredEntry` call in `overview.tsx` uses `count: 6`
- [ ] `useInsightChips()` is called in `overview.tsx`
- [ ] Insights section renders below BrainLift chart when chips are non-empty
- [ ] Section is completely absent (no header, no margin) when `insightChips.length === 0`
- [ ] Chips use `getEntryStyle(3 + i)` — the existing binding, not a new one
- [ ] `SectionLabel` used for section header (not inline Text)
- [ ] `useStaggeredEntry.test.ts` count assertion updated to 6
- [ ] No duplicate `getEntryStyle` const declarations
- [ ] Existing TypeScript compilation succeeds

---

## Technical Design

### Files to Reference

| File | Why |
|---|---|
| `src/lib/colors.ts` | Source of truth for dot colors: `colors.cyan`, `colors.violet`, `colors.success`, `colors.textSecondary`, `colors.statusColors.onTrack` |
| `src/lib/prescription.ts` | `Prescription` type: `status`, `summaryLine`, `patternBased`, `hoursPerDay`, `daysLeft` |
| `src/lib/aiInsights.ts` | `AIInsights`, `AITrendInsight`, `AIBestInsight`, `BrainLiftCorrelationInsight` types |
| `src/hooks/usePrescription.ts` | Hook to compose in `useInsightChips` |
| `src/hooks/useAIInsights.ts` | Hook to compose in `useInsightChips` (no args — full history always) |
| `src/components/GlassCard.tsx` | Surface primitive; props: `padding`, `radius`, `elevated`, `layerBudget`, `testID` |
| `src/components/ApprovalUrgencyCard.tsx` | Canonical pattern for GlassCard + inner View composition |
| `src/components/SectionLabel.tsx` | Section header primitive; renders `text-textSecondary font-sans-semibold text-xs uppercase tracking-widest` |
| `app/(tabs)/overview.tsx` | Target screen; stagger call at ~line 221; BrainLift chart block is insertion point |
| `src/hooks/useStaggeredEntry.ts` | Hook signature: `({ count, maxStaggerIndex? }) → { getEntryStyle, isReady }` |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Has assertion `count: 3` at ~line 380 that must change to `count: 6` |
| `tailwind.config.js` | Token reference for className validation |
| `app/(tabs)/__tests__/overview.test.tsx` | May need updates after overview.tsx changes |

### Files to Create

| File | Description |
|---|---|
| `src/lib/insightFormatting.ts` | `InsightChipData` type + `formatPrescriptionChip`, `formatTrendChip`, `formatCorrelationChip` |
| `src/hooks/useInsightChips.ts` | `useInsightChips()` composing hook |
| `src/components/InsightChip.tsx` | `InsightChip` display component |
| `src/lib/__tests__/insightFormatting.test.ts` | Formatter unit tests |
| `src/components/__tests__/InsightChip.test.tsx` | Component render tests |

### Files to Modify

| File | Change |
|---|---|
| `app/(tabs)/overview.tsx` | Bump stagger count 3→6; add `useInsightChips()` call; add Insights section ≤20 new lines |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` | Change `count: 3` assertion (~line 380) to `count: 6` |
| `app/(tabs)/__tests__/overview.test.tsx` | Verify existing assertions; add INSIGHTS-hidden-when-empty case if needed |
| `hourglassws/features/app/smart-insights/FEATURE.md` | Add changelog entry |

### Data Flow

```
usePrescription()
  ↓ Prescription | null
  
useAIInsights()
  ↓ AIInsights { trend, best, brainliftCorrelation }

useInsightChips()
  ↓ null-guard pace → formatPrescriptionChip → InsightChipData
  ↓ formatTrendChip (self-guarding) → InsightChipData | null
  ↓ null-guard correlation → formatCorrelationChip → InsightChipData
  ↓ InsightChipData[] (0–3 items)

overview.tsx
  ↓ chips.length > 0 gate
  
<View className="mt-4">
  <SectionLabel>INSIGHTS</SectionLabel>
  <View className="gap-3">
    {chips.map((chip, i) => (
      <InsightChip key={chip.key} {...chip} animatedStyle={getEntryStyle(3 + i)} />
    ))}
  </View>
</View>
```

### Architecture Notes

**Color sourcing:**
```typescript
import { colors } from '@/src/lib/colors';
// Use:
colors.cyan              // AI trend
colors.violet            // BrainLift correlation
colors.success           // Pace "done" 
colors.textSecondary     // Pace "insufficient_data"
colors.success               // Pace "active" (on-track pace color)
```

**GlassCard layer budget:**
- Overview tab currently uses ≤3 overlapping GlassCards in the viewport
- Insight chips are below BrainLift chart; at most 1–2 chips visible at once (scroll view)
- Budget is maintained; no `layerBudget` flat-fallback needed

**Animation — single cascade:**
The existing stagger call at `overview.tsx:221`:
```typescript
// Before:
const { getEntryStyle, isReady } = useStaggeredEntry({ count: 3 });
// After:
const { getEntryStyle, isReady } = useStaggeredEntry({ count: 6 });
```
- Indices 0/1/2 → existing charts (Earnings, Hours/AI, BrainLift) — unchanged
- Indices 3/4/5 → insight chips
- `getEntryStyle(i)` for out-of-range i returns a harmless resting style (no crash)

**React list keys:**
- Chip keys are stable strings: `'pace'`, `'ai-trend'`, `'brainlift'`
- Priority order ensures the first chip is always `'pace'` when present, so no key collisions

### Edge Cases

| Scenario | Handling |
|---|---|
| All insights null | `useInsightChips()` returns `[]`; Insights section not rendered at all |
| Only prescription available | Returns `[pace]`; section shows 1 chip with `SectionLabel` |
| `hoursData` loading, prescription null | Pace chip absent; up to 2 chips (AI + BrainLift) |
| `brainliftCorrelation` is null | Explicit null-guard in `useInsightChips`; `formatCorrelationChip` never called with null |
| `trend` and `best` both null | `formatTrendChip` returns null; no AI trend chip |
| `trend` direction = 'flat', no best | mutedLine = "building history…" |
| `summaryLine` empty for active prescription | `formatPrescriptionChip` falls back to constructed boldLine using `hoursPerDay` and `daysLeft` |
| `overview.tsx` compilation after stagger bump | `count: 6` is a literal; no hook-count violation |
| Chip count > 3 (future) | `.slice(0, 3)` in `useInsightChips` hard-caps at 3 |

### Test Architecture

**Lib tests** (`src/lib/__tests__/insightFormatting.test.ts`):
- Pure function tests — no mocking of hooks
- Fixture objects for `Prescription` (done, active, insufficient) and `AIInsights` (all null, all present, mixed)
- Assert text content, color values, and key strings

**Hook tests** (inline in `src/hooks/__tests__/useInsightChips.test.ts` — new file):
- Mock `usePrescription` and `useAIInsights`
- Assert chip array length and order
- Assert null-guard: verify `formatCorrelationChip` not called when `brainliftCorrelation` is null

**Component tests** (`src/components/__tests__/InsightChip.test.tsx`):
- Mock `GlassCard` or render real (assert GlassCard in tree)
- Assert `boldLine`, `mutedLine` text present
- Assert dot color applied via inline style
- Assert `animatedStyle` on outer wrapper
- Assert `flex-row` class on inner View (not on GlassCard)
- Assert muted line is `text-[11px]`

**Mocks needed:**
- `useStaggeredEntry` → `{ getEntryStyle: () => ({}), isReady: true }`
- `usePrescription` → various fixtures
- `useAIInsights` → various fixtures
- `GlassCard` → passthrough mock or real render
