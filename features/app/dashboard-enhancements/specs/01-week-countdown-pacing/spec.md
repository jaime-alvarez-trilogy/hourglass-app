# 01-week-countdown-pacing

**Status:** Complete
**Created:** 2026-04-05
**Last Updated:** 2026-04-06
**Owner:** @jaimx

---

## Overview

This spec adds two time-awareness signals to the Hourglass home screen dashboard that help the user understand weekly pace and urgency relative to the Crossover Thursday 23:59 UTC deadline.

**What is being built:**

1. **Deadline countdown pill** — A small pill component rendered inline with the `StateBadge` in Zone 1 of the hero panel. Displays time remaining until Thursday 23:59:59 UTC (the Crossover week cutoff). Color-coded by urgency: muted (>48h), warning (24–48h), critical pulsing (<24h).

2. **Intra-week pacing signal** — A subtitle line under the hours hero value showing "Xh/day needed" to hit the weekly goal. Hidden on weekends and when the target is already met.

**How it works:**

- Two pure utility functions are added to `src/lib/hours.ts`: `computeDeadlineCountdown(now?)` and `computePacingSignal(hoursWorked, weeklyLimit, now?)`.
- `index.tsx` consumes these functions via `useMemo` and renders the countdown pill + pacing label inside Zone 1 of the hero panel.
- Critical urgency triggers a pulsing opacity animation via Reanimated's `withRepeat`/`withSequence`.
- Crossover week runs Mon 00:00 UTC → Thu 23:59 UTC. On weekends (Fri–Sun), the countdown targets the *next* Thursday.

---

## Out of Scope

1. **Push notifications for deadline** — **Descoped:** Scheduled notifications are handled by the separate `10-scheduled-notifications` spec, which owns all notification scheduling logic.

2. **Animated countdown tick** — **Descoped:** The countdown updates only when the component mounts (via `useMemo` with no reactive dependency on time). A live-ticking countdown (updating every second/minute) is not required and would add unnecessary re-render overhead for a pill that refreshes on screen focus.

3. **Pacing signal for overtime/weekend modes** — **Descoped:** When `panelState === 'overtime'`, the hero panel renders a different layout and the pacing label is not shown. Weekend returns `null` from `computePacingSignal` so no label renders.

4. **Per-day breakdown in pacing** — **Descoped:** Only a single aggregate "h/day needed" number is shown, not a per-day schedule or calendar view.

5. **User-configurable week deadline** — **Descoped:** The Thursday 23:59 UTC deadline is a Crossover platform rule and is not user-configurable.

---

## Functional Requirements

### FR1: computeDeadlineCountdown utility

**What:** Pure function in `src/lib/hours.ts` that calculates time remaining until Thursday 23:59:59 UTC.

**Signature:**
```typescript
export function computeDeadlineCountdown(now = new Date()): {
  msRemaining: number;
  label: string;        // "2d 14h left" | "23h 45m left" | "45m left"
  urgency: 'none' | 'warning' | 'critical';
}
```

**Logic:**
- UTC day 1–4 (Mon–Thu): target this week's Thursday
- UTC day 5–6, 0 (Fri–Sun): target next week's Thursday
- Urgency: `>48h` → `'none'`, `24–48h` → `'warning'`, `<24h` → `'critical'`
- Label format: days>0 → `"Xd Xh left"`, hours>0 → `"Xh Xm left"`, else → `"Xm left"`

**Success Criteria:**
- Monday 09:00 UTC → urgency `'none'`, label matches `\d+d \d+h left`
- Wednesday 15:00 UTC → urgency `'warning'`, msRemaining ≈ 118,799s
- Thursday 14:00 UTC → urgency `'critical'`, label matches `\d+h \d+m left`
- Thursday 23:30 UTC → urgency `'critical'`, label matches `\d+m left`
- Friday/Sunday → urgency `'none'`, targets next Thursday

---

### FR2: Countdown pill renders in Zone 1

**What:** An `Animated.View` pill rendered inline with `StateBadge` in the normal hero branch of Zone 1 in `app/(tabs)/index.tsx`.

**Placement:** `flexDirection: 'row'` View containing `StateBadge` followed by the pill.

**Appearance:**
- Background: `colors.surface`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3
- Text: urgency color (critical=`colors.critical`, warning=`colors.warning`, else=`colors.textMuted`), fontSize 11, fontWeight 600
- testID: `"countdown-pill"`

**Success Criteria:**
- Pill appears next to StateBadge in the normal (non-overtime) hero branch
- Text matches the label from `computeDeadlineCountdown()`
- Color matches urgency: `colors.textMuted` when none, `colors.warning` when warning, `colors.critical` when critical

---

### FR3: Critical urgency triggers pulsing animation

**What:** When `countdown.urgency === 'critical'`, the countdown pill fades in/out using Reanimated's `withRepeat`/`withSequence`.

**Animation:**
```typescript
criticalPulse.value = withRepeat(
  withSequence(
    withTiming(0.4, timingSmooth),
    withTiming(1, timingSmooth),
  ),
  -1,   // infinite
  false,
);
```
- When urgency is not critical, `criticalPulse.value = 1` (fully opaque, no animation)
- The `Animated.View` pill applies `criticalPulseStyle` only when `countdown.urgency === 'critical'`

**Success Criteria:**
- `criticalPulse` shared value oscillates between 0.4 and 1.0 when urgency is critical
- When urgency changes away from critical, opacity resets to 1
- Non-critical states do not apply the animated style

---

### FR4: computePacingSignal utility

**What:** Pure function in `src/lib/hours.ts` that returns how many hours/day are needed to hit the weekly goal.

**Signature:**
```typescript
export function computePacingSignal(
  hoursWorked: number,
  weeklyLimit: number,
  now = new Date(),
): {
  hoursPerDayNeeded: number;
  label: string;  // "1.8h/day needed" | "Target met"
} | null  // null on weekend
```

**Logic:**
- `daysRemaining`: Mon=4, Tue=3, Wed=2, Thu=1 (working days left including today)
- Fri/Sat/Sun: return `null`
- `hoursWorked >= weeklyLimit`: return `{ hoursPerDayNeeded: 0, label: 'Target met' }`
- Otherwise: `hoursPerDayNeeded = (weeklyLimit - hoursWorked) / daysRemaining`
- Label: `"${hoursPerDayNeeded.toFixed(1)}h/day needed"`

**Success Criteria:**
- `computePacingSignal(20, 40, monday)` → `{ label: "5.0h/day needed", hoursPerDayNeeded: 5.0 }`
- `computePacingSignal(40, 40, tuesday)` → `{ label: "Target met", hoursPerDayNeeded: 0 }`
- `computePacingSignal(30, 40, saturday)` → `null`
- `computePacingSignal(38, 40, thursday)` → `{ label: "2.0h/day needed", hoursPerDayNeeded: 2.0 }`
- Exceeding weeklyLimit → `"Target met"`

---

### FR5: Pacing label renders under hours hero value

**What:** A `Text` component rendered between the `MetricValue` (total hours) and the "of Xh goal" subtitle in Zone 1.

**Visibility rules:**
- Hidden on weekends (`pacing === null`)
- Hidden when target is already met (`pacing.hoursPerDayNeeded === 0`)
- Shown otherwise with `pacing.label` text

**Appearance:**
- Color: `colors.textSecondary`, fontSize: via `text-sm` className
- testID: `"pacing-label"`
- Font: `font-sans`

**Success Criteria:**
- Label visible and correct during Mon–Thu when hours < weeklyLimit
- Label hidden when `pacing === null` (weekend)
- Label hidden when `pacing.hoursPerDayNeeded === 0` (target met)
- Text matches `computePacingSignal` output

---

## Technical Design

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/hours.ts` | Add `computeDeadlineCountdown` and `computePacingSignal` exports |
| `app/(tabs)/index.tsx` | Consume new utilities; add countdown pill + pacing label to Zone 1 |

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/colors.ts` | Color tokens: `colors.warning`, `colors.critical`, `colors.textMuted`, `colors.surface`, `colors.textSecondary` |
| `src/lib/reanimated-presets.ts` | `timingSmooth` preset used in pulsing animation |

### Files Created

| File | Purpose |
|------|---------|
| `src/lib/__tests__/countdownPacing.test.ts` | Unit tests for FR1 and FR4 |

---

### Data Flow

```
index.tsx
  │
  ├─ useMemo → computeDeadlineCountdown()
  │     └─ returns { msRemaining, label, urgency }
  │
  ├─ useMemo → computePacingSignal(data?.total ?? 0, weeklyLimit)
  │     └─ returns { hoursPerDayNeeded, label } | null
  │
  ├─ useSharedValue(1) → criticalPulse
  ├─ useEffect([countdown.urgency]) → starts/stops withRepeat animation
  │
  └─ JSX Zone 1 normal branch:
       ├─ MetricValue (total hours)
       ├─ {pacing && pacing.hoursPerDayNeeded > 0 && <Text testID="pacing-label">}
       ├─ <Text>of {weeklyLimit}h goal</Text>
       └─ flexRow:
            ├─ <StateBadge>
            └─ <Animated.View testID="countdown-pill" style=[pill, criticalPulseStyle?]>
                 └─ <Text color=countdownColor>{countdown.label}</Text>
```

---

### Edge Cases

| Case | Behavior |
|------|----------|
| Friday/Saturday/Sunday | Countdown targets next Thursday; pacing returns null (no label) |
| Thursday just after midnight UTC | Countdown shows ~24h, urgency 'warning' |
| Thursday 23:59 UTC (seconds remaining) | Countdown shows "Xm left" or "0m left", urgency 'critical' |
| hoursWorked > weeklyLimit | pacing returns "Target met", label hidden (hoursPerDayNeeded=0) |
| panelState === 'overtime' | Overtime branch renders instead of normal branch; countdown/pacing not shown |
| data loading (null data) | `data?.total ?? 0` used safely; countdown pill still renders (not data-dependent) |
| weeklyLimit = 0 | pacing formula: (0 - 0) / days = 0 → "Target met" (safe) |

---

### Implementation Notes

- `computeDeadlineCountdown` uses UTC exclusively. No local timezone arithmetic.
- `computePacingSignal` uses `now.getUTCDay()` to determine day of week consistently across timezones.
- The countdown `useMemo` has no dependencies `[]` — it computes once per render cycle (on mount/focus). No interval timer is needed.
- Reanimated `withRepeat(..., -1, false)` runs the sequence forward only (no reverse), creating a fade-out then fade-in effect.
- `criticalPulse.value = 1` (direct assignment without animation) immediately cancels any running animation and resets opacity.
- The countdown pill wraps in `Animated.View` (not plain `View`) so the animated style can be conditionally applied.
