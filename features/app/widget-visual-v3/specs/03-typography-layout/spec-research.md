# Spec Research: 03-typography-layout

## Problem

Two issues to fix:

### Issue A: "left left" string bug (bridge.ts)

`formatHoursRemaining()` in `bridge.ts` already returns a string with "left" baked in (e.g., `"7.5h left"`). However at bridge.ts line 812, the Android widget layout template appends `+ ' left'` again, producing `"7.5h left left"` on screen.

**Root cause:** `hoursRemaining` field is pre-formatted as `"X.Xh left"` or `"X.Xh OT"`. Any consumer that appends "left" creates the double.

**Scope:** Only the Android WIDGET_LAYOUT_JS string (bridge.ts line 812) has this bug. The iOS widget (HourglassWidget.tsx) uses `props.hoursRemaining` directly without appending — iOS is NOT affected.

### Issue B: LargeWidget P3 layout & typography

The user's reference implementation shows the "remaining" text should sit directly below the hours metric inside the hours `IosGlassCard`, styled as:
```tsx
<Text font={{ size: 11, weight: 'medium' }} foregroundStyle="#94A3B8">
  {props.hoursRemaining.replace('left', '').trim()} remaining
</Text>
```

Note: `hoursRemaining` contains "left" already, so `.replace('left', '').trim()` strips it and "remaining" is appended — producing clean output like `"7.5h remaining"` or `"2.5h OT remaining"`.

The current LargeWidget P3 layout shows `hoursRemaining` in the footer row, not under the hours card. The user wants it co-located with the hours number for a "of 40h goal" pattern.

Additionally the user wants `StatusPill` text font weight changed from `'semibold'` to `'bold'` per the reference code.

## Exploration Findings

### bridge.ts bug (Android-only path)

**IMPORTANT: This is the Android widget layout template only.** `bridge.ts` contains a `WIDGET_LAYOUT_JS` string (lines ~800–830) that is evaluated by the Android widget renderer. The bug is entirely within this string template — it has **no effect on the iOS widget** (`HourglassWidget.tsx`), which already uses `props.hoursRemaining` directly without any concatenation.

**File:** `src/widgets/bridge.ts` line 812 (inside `WIDGET_LAYOUT_JS` string)

```typescript
// Current (buggy) — Android WIDGET_LAYOUT_JS template
Text({ modifiers: [foregroundStyle(TEXT_SEC), font({ size: 12 })],
  children: p.hoursRemaining + ' left' })

// Fix
Text({ modifiers: [foregroundStyle(TEXT_SEC), font({ size: 12 })],
  children: p.hoursRemaining })
```

**Test coverage:**
- Android path: `src/widgets/__tests__/widgetLayoutJs.test.ts` — evaluates the WIDGET_LAYOUT_JS string and traverses the rendered tree. Add assertion: given `hoursRemaining = "7.5h left"`, the footer text equals `"7.5h left"` (not `"7.5h left left"`).
- iOS path: `src/widgets/__tests__/widgetPolish.test.ts` — no change needed (iOS was never affected).

### LargeWidget P3 layout

**File:** `src/widgets/ios/HourglassWidget.tsx`

Current P3 layout (simplified):
```
ZStack
  └─ WidgetBackground
  └─ VStack (padding top:16 leading:16 trailing:16 bottom:28, spacing:12)
     ├─ HStack (Row 1: two columns)
     │   ├─ Left: IosGlassCard — THIS WEEK + hours + StatusPill
     │   └─ Right: VStack — EARNINGS card + TODAY card
     ├─ ZStack (Row 2: bar chart box)
     │   ├─ RoundedRectangle (background)
     │   └─ VStack — ACTIVITY label + IosBarChart
     ├─ HStack (Row 3: AI% + BrainLift)
     └─ HStack (Footer: hoursRemaining + stale indicator)
```

Target P3 layout (from user reference):
```
ZStack
  └─ WidgetBackground
  └─ VStack (padding:16, spacing:12)
     ├─ HStack (Header Hero Row)
     │   ├─ IosGlassCard — hours (bold, 32) + remaining (medium, 11, #94A3B8)
     │   └─ IosGlassCard — earnings (bold, 24) + EARNED label (medium, 11)
     ├─ HStack (Status Pill row)
     │   └─ ZStack — Capsule fill + Capsule stroke + Text
     ├─ VStack (Activity section)
     │   ├─ Text "ACTIVITY" (bold, 11, #64748B)
     │   └─ IosBarChart
     ├─ Spacer
     └─ HStack (Footer)
         └─ Text: "Today: {today} • AI: {aiPct}"
```

**Key structural changes:**
1. Hours + remaining co-located in a single `IosGlassCard`
2. Earned card alongside hours card in same HStack
3. StatusPill in its own HStack row
4. Activity chart in VStack (no RoundedRectangle wrapper)
5. Footer simplified: just today + AI (no separate hoursRemaining line)
6. Outer padding simplified: uniform 16pt (vs asymmetric bottom:28)

**IMPORTANT:** This redesign affects only LargeWidget **P3 (default/full dashboard)** mode. P1 (approvals) and P2 (deficit) modes are preserved unchanged.

## Interface Contracts

### bridge.ts fix

```typescript
// No interface change — hoursRemaining type stays string
// Just remove the ' left' concatenation at line 812
```

**Source:** `hoursRemaining` ← `formatHoursRemaining(raw, overtime)` ← `buildWidgetData()`

### LargeWidget P3 layout

No new types or props. Uses existing `WidgetData` fields:
| Field | Source | Usage |
|-------|--------|-------|
| `props.hoursDisplay` | `buildWidgetData()` | Main hours text (e.g. "27.3h") |
| `props.hoursRemaining` | `formatHoursRemaining()` | Remaining text after strip |
| `props.earnings` | `buildWidgetData()` | Earned dollar amount |
| `props.paceBadge` | `buildWidgetData()` | StatusPill label key |
| `props.daily` | `buildDailyEntries()` | IosBarChart entries |
| `props.today` | `buildWidgetData()` | Footer today delta |
| `props.aiPct` | `buildWidgetData()` | Footer AI percentage |
| `props.urgency` | `buildWidgetData()` | Accent color selection |

## Test Plan

### FR1: bridge.ts "left left" fix

**Contract:** Android widget template renders `hoursRemaining` without appending " left"

- [ ] String `"left left"` does not appear in the Android WIDGET_LAYOUT_JS output when `hoursRemaining = "7.5h left"`
- [ ] String `"7.5h left"` appears exactly once (not duplicated)
- [ ] OT case: `"2.5h OT"` renders as-is without " left" appended

### FR2: LargeWidget P3 — remaining text under hours card

**Contract:** In LargeWidget P3, the hours IosGlassCard contains a Text with `weight:'medium'` and the stripped remaining value

- [ ] First IosGlassCard in P3 hero row contains a `Text` element with size=11, weight='medium', color='#94A3B8'
- [ ] That text uses `hoursRemaining` with 'left' stripped (output: "7.5h remaining")

### FR3: LargeWidget P3 — earnings card in hero row

**Contract:** Second IosGlassCard in P3 hero row shows earnings (bold, 24) and EARNED label (medium, 11)

- [ ] HStack contains two IosGlassCard children
- [ ] Second card has Text with size=24, weight='bold' for earnings
- [ ] Second card has Text "EARNED" with weight='medium'

### FR4: StatusPill text weight bold

**Contract:** StatusPill Text uses weight='bold'

- [ ] StatusPill tree contains Text with `font.weight === 'bold'`
- [ ] No Text with `font.weight === 'semibold'` in StatusPill

### FR5: Footer row simplified

**Contract:** LargeWidget P3 footer HStack contains one Text combining today + aiPct

- [ ] Footer Text contains "Today:" label
- [ ] No separate hoursRemaining element in footer (it's now inside hours card)

## Files to Reference

- `src/widgets/bridge.ts` — line 812 (bug fix), lines 35–40 (formatHoursRemaining)
- `src/widgets/ios/HourglassWidget.tsx` — LargeWidget P3 layout (approximately lines 397–556)
- `src/__tests__/widgets/bridge.test.ts` — bridge tests, hoursRemaining assertions
- `src/widgets/__tests__/widgetPolish.test.ts` — SC2.1/SC2.2 padding assertions (may need updating if padding changes)
- `src/widgets/__tests__/widgetLayoutJs.test.ts` — Android layout string tests
