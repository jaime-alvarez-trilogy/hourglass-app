# Spec Research: Notification Bootstrap

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `06-notification-bootstrap`

---

## Problem Context

**Issue #7 — New users miss their first Thursday notification**: In `src/hooks/useScheduledNotifications.ts`, the `scheduleAll` function reads `widget_data` from AsyncStorage early on:

```typescript
const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);  // 'widget_data'
if (!raw) return;  // ← BAIL: if no widget data, skip ALL notifications
```

This early return skips both the Thursday deadline reminder AND the Monday summary notification.

On a fresh install:
1. User opens app for the first time (Monday)
2. `scheduleAll` runs on mount
3. `widget_data` is null (hasn't been written yet — requires `useWidgetSync` to fire after hours data loads)
4. Early return fires → NO notifications scheduled
5. User goes through their entire first week with no deadline reminders

The `widget_data` key is only needed to read `hoursRemaining` for the logic: "skip Thursday notification if user has already hit their 40h target." But this guard should not prevent scheduling the notification entirely — it should just default to scheduling it when we don't know yet.

---

## Exploration Findings

### Current `scheduleAll` flow

```typescript
const scheduleAll = async () => {
  // 1. Check permissions — bail if not granted
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  // 2. Read widget data — bail if missing ← THE BUG
  const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (!raw) return;

  // 3. Parse hoursRemaining
  const parsed = JSON.parse(raw);
  const hoursRemaining = parseFloat(parsed?.hoursRemaining ?? '') || 0;

  // 4. Schedule Thursday notification (skipped if hoursRemaining <= 0)
  if (hoursRemaining > 0) {
    await scheduleThursdayReminder(hoursRemaining);
  }

  // 5. Schedule Monday summary
  await scheduleMondaySummary();
};
```

### Key insight

The `hoursRemaining > 0` guard at step 4 means: "don't schedule a deadline reminder if the user has already finished their hours." This makes sense and should be kept. But the default when `hoursRemaining` is unknown should be `> 0` (assume they still have hours to go), not "skip entirely."

The Monday summary doesn't even use `hoursRemaining` — it's unconditional but currently blocked by the early return.

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Permissions check before scheduling | `scheduleAll:155` | Keep — correct guard |
| `hoursRemaining` from widget_data | `scheduleAll:166-167` | Only used for Thursday skip logic |
| `scheduleThursdayReminder(hoursRemaining)` | `scheduleAll` | Takes hoursRemaining as param |
| `scheduleMondaySummary()` | `scheduleAll` | No dependency on widget data |

### Key Files

| File | Relevance |
|------|-----------|
| `src/hooks/useScheduledNotifications.ts` | The bug |

### Integration Points

- `scheduleAll` is called on mount and on app foreground transitions
- `useWidgetSync` writes `widget_data` after `useHoursData` returns data
- On fresh install: `useHoursData` takes a few seconds to fetch; `useWidgetSync` fires after; `scheduleAll` fired before all this

---

## Key Decisions

### Decision 1: What to do when widget_data is missing

**Options considered:**
1. Remove the early bail; default `hoursRemaining` to a positive value (e.g., `weeklyLimit`) when widget data is absent → always schedule Thursday notification
2. Split scheduling: schedule Monday summary unconditionally; only apply hoursRemaining guard to Thursday
3. Schedule Thursday with a generic message when widget data is absent (no hours info in the notification body)

**Chosen:** Option 1 — remove the early bail; default `hoursRemaining` to a safe positive value when widget data is absent

**Rationale:** The user's first week deserves the notification. Defaulting to "assume hours remaining > 0" is safe — the worst case is scheduling a Thursday reminder that turns out to be unnecessary (user already hit their target). That's far better than missing the notification entirely. The existing `hoursRemaining > 0` guard still prevents scheduling a "you haven't hit your target" reminder when the user actually has.

### Decision 2: What default hoursRemaining value to use

**Options considered:**
1. Default to `weeklyLimit` (e.g., 40) — conservative, treats new user as if they have all hours remaining
2. Default to `1` — just enough to pass the `> 0` check
3. Default to `null` and treat null as "schedule unconditionally"

**Chosen:** Option 2 — default to `1` (minimal positive sentinel, just enough to pass the guard)

**Rationale:** Using `weeklyLimit` requires reading config. Using `1` is simple and self-documenting: "we don't know, assume some hours remain." The exact value doesn't affect notification content — the notification body reads from config/hours data, not from this value.

---

## Interface Contracts

### Modified `scheduleAll`

```typescript
const scheduleAll = async () => {
  // 1. Check permissions — still bail if not granted
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  // 2. Read hoursRemaining from widget data IF available
  //    Default to 1 (positive) if widget data not yet written (fresh install)
  let hoursRemaining = 1;  // ← default: assume hours remain
  const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const hoursRemainingStr = typeof parsed?.hoursRemaining === 'string'
        ? parsed.hoursRemaining : '';
      const hoursFloat = parseFloat(hoursRemainingStr);
      if (!isNaN(hoursFloat)) hoursRemaining = hoursFloat;  // only override if we have real data
    } catch {
      // JSON parse failed — keep hoursRemaining = 1 (default: schedule notification)
    }
  }
  // Note: if hoursRemaining is 0 from widget data, skip Thursday (user done)
  // If widget data absent, hoursRemaining stays 1 (schedule Thursday)

  // 3. Schedule Thursday notification
  if (hoursRemaining > 0) {
    await scheduleThursdayReminder(hoursRemaining);
  }

  // 4. Schedule Monday summary (no dependency on widget data)
  await scheduleMondaySummary();
};
```

### Source Tracing

| Field | Source |
|-------|--------|
| `hoursRemaining` (normal) | `AsyncStorage.getItem('widget_data')` → parsed hoursRemaining |
| `hoursRemaining` (fresh install) | Default: `1` (sentinel positive value) |
| Thursday notification scheduled | `hoursRemaining > 0` |
| Monday summary scheduled | Always (when permissions granted) |

---

## Test Plan

### `scheduleAll` — fresh install path

**Signature:** `scheduleAll(): Promise<void>`

**Happy Path:**
- Permissions granted, widget data present with `hoursRemaining: '8.5h left'` → schedules both notifications

**New Cases (the fix):**
- Permissions granted, widget data absent (null) → schedules Thursday AND Monday (not skipped)
- Permissions granted, widget data has `hoursRemaining: '0.0h OT'` (done) → skips Thursday, schedules Monday
- Permissions granted, widget data has malformed hoursRemaining → defaults to 1 (schedule Thursday)

**Edge Cases:**
- Permissions denied → no notifications scheduled (existing behavior, unchanged)

**Mocks Needed:**
- `AsyncStorage`: return null for widget_data to simulate fresh install
- `Notifications.getPermissionsAsync`: return `{ granted: true }`
- `Notifications.scheduleNotificationAsync`: spy to verify calls

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useScheduledNotifications.ts` | modify | Remove early bail on missing widget data; default hoursRemaining to 1 |
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | modify | Add test for fresh-install (no widget data) path |

---

## Edge Cases to Handle

1. **Widget data exists but hoursRemaining field is missing** — `typeof parsed?.hoursRemaining === 'string'` check returns false → uses empty string → `parseFloat('')` → `NaN` → `|| 0` → `hoursRemaining = 0`. But 0 means "skip Thursday." Fix: only override from widget data if parsed value > 0, otherwise keep the `1` default. This way missing/malformed = schedule anyway.
2. **JSON.parse failure** — wrap in try/catch; if parse throws, keep `hoursRemaining = 1`.
3. **Overtime positive value** — `hoursRemaining` from widget might say "-2.5h OT" (overtime). `parseFloat("-2.5h OT")` = -2.5 which is < 0. The guard `if (hoursRemaining > 0)` correctly skips the Thursday notification when the user is in overtime.

---

## Open Questions

None remaining.
