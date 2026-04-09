# 03-typography-layout

**Status:** Draft
**Created:** 2026-04-02
**Last Updated:** 2026-04-02
**Owner:** @trilogy

---

## Overview

This spec addresses two related issues in the Hourglass widget: a string duplication bug in the Android widget bridge and typography/layout improvements in the iOS LargeWidget P3 (default/full dashboard) mode.

### What Is Being Built

**FR1 — Bridge "left left" bug fix:** The Android widget layout template in `bridge.ts` appends `+ ' left'` to `hoursRemaining`, which already contains "left" baked in (e.g., `"7.5h left"`). This produces `"7.5h left left"` on screen. The fix removes the redundant concatenation so the value is rendered as-is.

**FR2 — Remaining text repositioned under hours card:** In LargeWidget P3, the `hoursRemaining` value currently appears in a footer row. The target layout moves it directly into the hours `IosGlassCard`, displayed as size-11 medium-weight text in slate (#94A3B8), with "left" stripped and "remaining" appended (e.g., `"7.5h remaining"`).

**FR3 — Earnings card in hero row:** The P3 layout's hero HStack should contain two `IosGlassCard` children side-by-side: hours (left) and earnings (right). The earnings card shows the dollar amount (bold, 24) and an "EARNED" label (medium, 11).

**FR4 — StatusPill text weight:** The StatusPill's Text element should use `weight:'bold'` instead of `weight:'semibold'` to match the reference design.

**FR5 — Footer row simplified:** The P3 footer HStack consolidates to a single Text combining today delta and AI percentage (e.g., `"Today: +0.5h • AI: 74%"`). The separate `hoursRemaining` element is removed from the footer since it now lives in the hours card.

### How It Works

The bridge.ts fix is a one-line change in the Android WIDGET_LAYOUT_JS string template. The LargeWidget P3 changes are structural JSX modifications in `HourglassWidget.tsx` affecting only the P3 rendering branch. No new types, props, or APIs are introduced — all changes use existing `WidgetData` fields.

---

## Out of Scope

1. **iOS widget changes for the bridge.ts fix** — The iOS widget (`HourglassWidget.tsx`) already uses `props.hoursRemaining` directly without appending " left". No iOS change is needed. **Descoped:** not applicable.

2. **P1 (approvals) and P2 (deficit) layout changes** — Only LargeWidget P3 (default/full dashboard) is being modified. **Descoped:** P1 and P2 layouts are out of scope for this spec.

3. **SmallWidget and MediumWidget changes** — No layout or typography changes to smaller widget sizes. **Descoped:** not applicable.

4. **Android widget visual changes** — Beyond the " left" string bug fix in the WIDGET_LAYOUT_JS template, no other Android widget changes are in scope. **Descoped:** Android visual redesign is not part of this feature.

5. **New props or API changes** — All changes use existing `WidgetData` fields. No new fields, endpoints, or prop additions. **Descoped:** interface is stable.

6. **Animation or blur rendering fidelity** — Typography and layout only; no rendering pipeline changes. **Descoped:** platform-dependent rendering is out of scope.

---

## Functional Requirements

### FR1: Fix "left left" string bug in Android bridge

**Description:** Remove the redundant `+ ' left'` concatenation from `WIDGET_LAYOUT_JS` in `bridge.ts`. The `hoursRemaining` field already contains "left" (e.g., `"7.5h left"`) or "OT" (e.g., `"2.5h OT"`); appending " left" again creates a double.

**Success Criteria:**
- Given `hoursRemaining = "7.5h left"`, the Android widget template renders `"7.5h left"` (not `"7.5h left left"`)
- Given `hoursRemaining = "2.5h OT"`, the Android widget template renders `"2.5h OT"` (unchanged, no " left" appended)
- The string `"left left"` does not appear anywhere in the rendered Android widget output
- `hoursRemaining` appears exactly once in the footer text of the rendered tree

---

### FR2: Remaining text co-located under hours card in LargeWidget P3

**Description:** In LargeWidget P3, add a secondary `Text` element inside the hours `IosGlassCard` showing the stripped remaining value. The text strips "left" from `hoursRemaining` and appends "remaining" (e.g., `"7.5h remaining"` or `"2.5h OT remaining"`).

**Success Criteria:**
- The hours `IosGlassCard` in P3 hero row contains a `Text` with `font: { size: 11, weight: 'medium' }` and `foregroundStyle: '#94A3B8'`
- That text's content equals `props.hoursRemaining.replace('left', '').trim() + ' remaining'`
- Example: `hoursRemaining = "7.5h left"` → displayed as `"7.5h remaining"`
- Example: `hoursRemaining = "2.5h OT"` → displayed as `"2.5h OT remaining"`

---

### FR3: Earnings card in hero HStack alongside hours card

**Description:** The LargeWidget P3 hero row HStack contains two `IosGlassCard` children. The second card (earnings) shows the dollar amount as bold size-24 text and an "EARNED" label as medium size-11 text.

**Success Criteria:**
- The hero HStack in P3 contains exactly two `IosGlassCard` children
- The second card contains a `Text` with `font: { size: 24, weight: 'bold' }` for the earnings amount
- The second card contains a `Text` with `weight: 'medium'` and content `"EARNED"`

---

### FR4: StatusPill text weight changed to bold

**Description:** The `StatusPill` component's inner `Text` element uses `weight: 'semibold'` in the current implementation. It should be changed to `weight: 'bold'` to match the reference design.

**Success Criteria:**
- `StatusPill` tree contains a `Text` with `font.weight === 'bold'`
- No `Text` with `font.weight === 'semibold'` exists in `StatusPill`

---

### FR5: Footer row simplified to single combined text

**Description:** The LargeWidget P3 footer HStack is simplified to a single `Text` element combining today's delta and AI percentage. The separate `hoursRemaining` element is removed from the footer (it now lives in the hours card per FR2).

**Success Criteria:**
- The footer `HStack` in P3 contains a `Text` element that includes both "Today:" and the AI percentage indicator
- No `hoursRemaining` value appears in the footer (it is in the hours card)
- The footer text format is: `"Today: {today} • AI: {aiPct}"`

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/widgets/bridge.ts` | FR1: Remove `+ ' left'` at line 812 inside `WIDGET_LAYOUT_JS` string |
| `src/widgets/ios/HourglassWidget.tsx` | FR2–FR5: Restructure LargeWidget P3 layout |

### Files to Create/Modify (Tests)

| File | Change |
|------|--------|
| `src/widgets/__tests__/widgetLayoutJs.test.ts` | FR1: Add assertion that `"left left"` does not appear; add OT case |
| `src/widgets/__tests__/widgetPolish.test.ts` | FR2–FR5: Update P3 assertions for new layout structure |

### Data Flow

```
WidgetData
  ├─ hoursDisplay        → hours card primary Text (bold, 32)
  ├─ hoursRemaining      → hours card secondary Text (strip 'left', append 'remaining')
  ├─ earnings            → earnings card primary Text (bold, 24)
  ├─ paceBadge           → StatusPill label (bold text)
  ├─ daily               → IosBarChart entries
  ├─ today               → footer combined Text
  ├─ aiPct               → footer combined Text
  └─ urgency             → accent color selection
```

### bridge.ts Fix (FR1)

Locate `WIDGET_LAYOUT_JS` string in `bridge.ts` (~line 812). The current code:

```typescript
Text({ modifiers: [foregroundStyle(TEXT_SEC), font({ size: 12 })],
  children: p.hoursRemaining + ' left' })
```

Change to:

```typescript
Text({ modifiers: [foregroundStyle(TEXT_SEC), font({ size: 12 })],
  children: p.hoursRemaining })
```

### LargeWidget P3 Structural Changes (FR2–FR5)

**Current P3 structure (simplified):**
```
VStack (padding top:16 leading:16 trailing:16 bottom:28, spacing:12)
  ├─ HStack (Row 1)
  │   ├─ IosGlassCard — hours + StatusPill
  │   └─ VStack — EARNINGS card + TODAY card
  ├─ ZStack (bar chart box with RoundedRectangle)
  ├─ HStack (AI% + BrainLift)
  └─ HStack (Footer: hoursRemaining + stale indicator)
```

**Target P3 structure:**
```
VStack (padding: 16, spacing: 12)
  ├─ HStack (Hero row)
  │   ├─ IosGlassCard — hours (bold,32) + remaining (medium,11,#94A3B8)
  │   └─ IosGlassCard — earnings (bold,24) + "EARNED" (medium,11)
  ├─ HStack (StatusPill row)
  │   └─ StatusPill (bold text)
  ├─ VStack (Activity section)
  │   ├─ Text "ACTIVITY" (bold,11,#64748B)
  │   └─ IosBarChart
  ├─ Spacer
  └─ HStack (Footer)
      └─ Text "Today: {today} • AI: {aiPct}"
```

### Key Implementation Notes

1. **Remaining text stripping:** Use `.replace('left', '').trim()` on `props.hoursRemaining` — handles both `"7.5h left"` (→ `"7.5h"`) and `"2.5h OT"` (→ `"2.5h OT"`, no change). Then append `" remaining"`.

2. **Padding change:** Remove asymmetric `bottom: 28` — use uniform `16` on all sides.

3. **RoundedRectangle wrapper removal:** The activity chart section no longer uses a `ZStack` + `RoundedRectangle` wrapper — it is a plain `VStack`.

4. **StatusPill weight:** Change `weight: 'semibold'` → `weight: 'bold'` inside the `StatusPill` component definition.

5. **P1/P2 preservation:** Only the P3 branch (`else` block after `if (props.phase === 'P1')` and `if (props.phase === 'P2')` checks) is modified. P1 and P2 branches are untouched.

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `hoursRemaining = "2.5h OT"` | Remaining text: `"2.5h OT remaining"` (no "left" to strip) |
| `hoursRemaining = "0h left"` | Remaining text: `"0h remaining"` |
| `earnings = "$0"` | Earnings card shows `"$0"` in bold size-24 |
| Stale data | Stale indicator still shown in footer (alongside today+AI text) |

### Test Strategy

**FR1 tests** (`widgetLayoutJs.test.ts`):
- Evaluate `WIDGET_LAYOUT_JS` with mock `WidgetData` where `hoursRemaining = "7.5h left"`
- Assert rendered text tree does not contain `"7.5h left left"` and contains `"7.5h left"` exactly once
- Second test: `hoursRemaining = "2.5h OT"` → text equals `"2.5h OT"` (no " left" appended)

**FR2–FR5 tests** (`widgetPolish.test.ts`):
- Render `LargeWidget` in P3 mode with known props
- Find first `IosGlassCard`; assert it contains `Text` with `size:11, weight:'medium', foregroundStyle:'#94A3B8'`
- Find second `IosGlassCard`; assert earnings bold 24 + "EARNED" medium
- Find `StatusPill`; assert `Text.font.weight === 'bold'`
- Find footer `HStack`; assert single `Text` contains "Today:" and no separate hoursRemaining text
