# Feature: Dashboard Enhancements

## Goal

Surface four additional signals on the Hourglass dashboard to help the user understand weekly pace, earnings trajectory, work consistency, and improve list animation quality.

## Specs

| # | Spec | Depends On |
|---|------|-----------|
| 01 | week-countdown-pacing | — |
| 02 | earnings-pace-projection | — |
| 03 | hours-variance | — |
| 04 | list-cascade | — |

All four specs are independent and can run in parallel.

## Changelog

- 2026-04-05: Feature created from session priorities 4–6 + brand guidelines §6.4 gap
- 2026-04-06: [01-week-countdown-pacing](specs/01-week-countdown-pacing/spec.md) — Deadline countdown pill + intra-week pacing signal in Zone 1 hero panel
- 2026-04-06: [02-earnings-pace-projection](specs/02-earnings-pace-projection/spec.md) — EWMA annual earnings projection card with pace bar; 44 tests passing
- 2026-04-06: [03-hours-variance](specs/03-hours-variance/spec.md) — hours consistency variance label for Weekly Hours ChartSection — **Status: Complete** (31 tests, FR1-FR4)
- 2026-04-06: [04-list-cascade](specs/04-list-cascade/spec.md) — useListCascade hook — staggered entry animation for DailyAIRow and approval cards
