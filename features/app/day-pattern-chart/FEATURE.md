# Day-of-Week Pattern Chart

## Overview

A 7-bar chart (Mon–Sun) showing average hours worked per day, computed against the active window (4W / 12W / 24W). On the Overview tab the bars carry trend arrows that show whether each day's average is rising or falling compared to the prior period of the same length. On the Home tab a static (no-arrow) version shows the current overall work pattern.

## Motivation

The 4W / 12W / 24W toggle on Overview already surfaces earnings, hours, and AI% trends over time. Adding a day-of-week breakdown lets users see *when* they work and whether that pattern is shifting — useful for managers checking if support coverage has crept into weekends, or for contributors tracking whether they've been consistently light on Mondays lately.

## Design Summary

### Trend Arrows (Overview only)

| Window | Current group | Prior group | Arrow shown when |
|--------|---------------|-------------|-----------------|
| 4W | Most recent 4 calendar weeks | Preceding 4 calendar weeks (weeks 5–8) | prior group has ≥ 2 valid weeks |
| 12W | Most recent 12 calendar weeks | Preceding 12 weeks (weeks 13–24) | prior group has ≥ 2 valid weeks |
| 24W | All available history | — | Never (no prior data) |

- **↑ above the bar** — day avg increased by ≥ 0.5 h vs prior period
- **↓ inside the bar** (at the top) — day avg decreased by ≥ 0.5 h vs prior period
- **No arrow** — |delta| < 0.5 h, 24W window, or insufficient prior data

### Bar Rendering

- Height proportional to `avgHours` for that day; scale = `maxHours` across all 7 days
- Work-day bars (`avg ≥ 0.5 h`): `colors.success`
- Rest-day bars (`avg < 0.5 h`): faint `colors.surface` or 2px stub
- Day labels below: M T W T F S S (muted on rest days)

### Data Sources

| Use | Source |
|-----|--------|
| Overview (windowed) | `computeDayWindowAvgs(snapshots, window)` from `useWeeklyHistory()` |
| Home (all-time) | `useWorkPattern().avgDailyHours` |

`WeeklySnapshot.dailyHours` (Mon=0…Sun=6) is the raw per-day source. Weeks without `dailyHours` are skipped in averages (not zeroed).

## Spec Breakdown

| Spec | Description | Blocked By | Blocks |
|------|-------------|-----------|--------|
| 01-computation | `computeDayWindowAvgs` pure function + types | — | 02, 03, 04 |
| 02-chart-component | `DayPatternChart` visual component | 01 | 03, 04 |
| 03-overview-integration | Wire into Overview tab (window-aware, with trend arrows) | 02 | 04 |
| 04-home-integration | Wire into Home tab (static, no arrows) | 03 | — |

04 is sequenced after 03 (not parallel) to avoid merge conflicts on `useStaggeredEntry.test.ts`.

## Files Produced

| File | Spec |
|------|------|
| `src/lib/dayPatternUtils.ts` | 01 |
| `src/lib/__tests__/dayPatternUtils.test.ts` | 01 |
| `src/components/DayPatternChart.tsx` | 02 |
| `src/components/__tests__/DayPatternChart.test.tsx` | 02 |
| `app/(tabs)/overview.tsx` (modified) | 03 |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` (FR5 block updated) | 03 |
| `app/(tabs)/index.tsx` (modified) | 04 |
| `src/hooks/__tests__/useStaggeredEntry.test.ts` (FR2 block updated) | 04 |

## Changelog

| Date | Spec | Description |
|------|------|-------------|
| 2026-06-06 | [01-computation](specs/01-computation/spec.md) | Add spec, checklist, and implementation for `computeDayWindowAvgs` pure function |
| 2026-06-06 | [02-chart-component](specs/02-chart-component/spec.md) | Add spec and checklist for `DayPatternChart` visual component |
| 2026-06-06 | [03-overview-integration](specs/03-overview-integration/spec.md) | Add spec, checklist, and implementation for wiring DayPatternChart into Overview tab |
| 2026-06-06 | [04-home-integration](specs/04-home-integration/spec.md) | Add spec, checklist, and implementation for wiring static DayPatternChart into Home tab |

## Checklist

- [x] 01-computation: spec written
- [x] 01-computation: implemented
- [x] 02-chart-component: spec written
- [x] 02-chart-component: implemented
- [x] 03-overview-integration: spec written
- [x] 03-overview-integration: implemented
- [x] 04-home-integration: spec written
- [x] 04-home-integration: implemented
