# Spec Research: 01-week-countdown-pacing

## What to Build

Two related signals on the **home screen** (`app/(tabs)/index.tsx`):

1. **Deadline countdown pill** — shows time remaining until Thursday 23:59 UTC (Crossover week cutoff). Displayed below or alongside the hero panel state badge. Changes color as deadline approaches:
   - > 48h remaining: `colors.textMuted` (no urgency)
   - 24–48h: `colors.warning`
   - < 24h: `colors.critical` (pulsing animation via `withRepeat`)

2. **Intra-week pacing signal** — "Xh/day needed" label computed as `(weeklyLimit - hoursWorked) / daysRemaining`. Shown as a subtitle line under the hours hero value in Zone 1.

## Key Files

- **Screen:** `app/(tabs)/index.tsx` — add countdown and pacing signal
- **Utility:** `src/lib/hours.ts` — add `computeDeadlineCountdown(now?: Date)` and `computePacingSignal(hoursWorked, weeklyLimit, now?: Date)`
- **Colors:** `src/lib/colors.ts` — `colors.warning`, `colors.critical`, `colors.textMuted`
- **Reanimated presets:** `src/lib/reanimated-presets.ts` — `springSnappy`, `timingSmooth`

## Deadline Logic

- Crossover week runs Mon 00:00 UTC → Thu 23:59 UTC (4 working days)
- Deadline = next Thursday 23:59:59 UTC
- If today is Friday/Sat/Sun, countdown shows time until NEXT Thursday (next week's deadline)
- Format: "2d 14h left" / "23h 45m left" / "45m left"

```typescript
// In src/lib/hours.ts
export function computeDeadlineCountdown(now = new Date()): {
  msRemaining: number;
  label: string;        // "2d 14h left" | "23h 45m left" | "45m left"
  urgency: 'none' | 'warning' | 'critical';
}

export function computePacingSignal(
  hoursWorked: number,
  weeklyLimit: number,
  now = new Date(),
): {
  hoursPerDayNeeded: number;
  label: string;  // "1.8h/day needed" | "On track" | "Target met"
} | null  // null on weekend
```

## UI Placement

### Countdown pill
In index.tsx Zone 1 hero panel, near the `StateBadge`. Small pill component:
```tsx
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
  backgroundColor: colors.surface, borderRadius: 10,
  paddingHorizontal: 8, paddingVertical: 3 }}>
  <Text style={{ color: urgencyColor, fontSize: 11, fontWeight: '600' }}>
    {countdown.label}
  </Text>
</View>
```

### Pacing signal
Subtitle line under hours hero value (or replace existing subtitle if behind pace):
```tsx
<Text style={{ color: colors.textSecondary, fontSize: 12 }}>
  {pacing.label}
</Text>
```

## Pacing Logic

- `daysRemaining` = working days left in week (Mon=0 to Thu=3), capped at 1 minimum (avoid div/0)
- Weekend: return null (no pacing signal)
- If `hoursWorked >= weeklyLimit`: return `{ label: "Target met", hoursPerDayNeeded: 0 }`
- Formula: `hoursPerDayNeeded = (weeklyLimit - hoursWorked) / daysRemaining`

## Tests

File: `src/lib/__tests__/countdownPacing.test.ts`

- `computeDeadlineCountdown` on Monday → > 48h → urgency 'none'
- `computeDeadlineCountdown` on Wednesday 15:00 UTC → ~32h → urgency 'warning'
- `computeDeadlineCountdown` on Thursday 14:00 UTC → ~10h → urgency 'critical'
- `computePacingSignal(20, 40, monday)` → "5.0h/day needed"
- `computePacingSignal(40, 40, tuesday)` → "Target met"
- `computePacingSignal(30, 40, saturday)` → null

## Acceptance Criteria

- FR1: `computeDeadlineCountdown` returns correct label + urgency for all weekday cases
- FR2: Countdown pill renders in home screen Zone 1 with correct urgency color
- FR3: Critical urgency triggers pulsing opacity animation (`withRepeat`)
- FR4: `computePacingSignal` returns correct label for behind/on-track/weekend cases
- FR5: Pacing label renders under hours hero value, hidden on weekends
