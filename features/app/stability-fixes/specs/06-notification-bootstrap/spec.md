# Notification Bootstrap

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

A targeted fix to `scheduleAll` in `src/hooks/useScheduledNotifications.ts` so that first-install users receive their Thursday deadline notification even before `widget_data` has been written to AsyncStorage.

### Problem

`scheduleAll` reads `widget_data` from AsyncStorage at startup. If the data is absent (fresh install, first launch), it bails early — skipping both the Thursday deadline reminder and the Monday weekly summary. This means new users get zero notifications during their entire first week.

### Solution

Remove the early-return bail on missing `widget_data`. Instead:
- Default `hoursRemaining` to `1` (a sentinel positive value meaning "assume hours remain")
- Only override the default when `widget_data` is present and contains a valid numeric `hoursRemaining`
- Wrap JSON parsing in a try/catch so malformed data never propagates as an error
- The existing `hoursRemaining > 0` guard correctly skips Thursday when a user has finished their hours; the Monday summary always fires (no dependency on widget data)

### How It Works

```
scheduleAll()
  │
  ├─ Check permissions → bail if not granted (unchanged)
  │
  ├─ Read widget_data from AsyncStorage
  │    ├─ Absent → hoursRemaining = 1  (schedule Thursday)
  │    ├─ Present, valid → hoursRemaining = parsed float
  │    └─ Present, malformed → hoursRemaining = 1  (schedule Thursday)
  │
  ├─ if (hoursRemaining > 0) → scheduleThursdayReminder()
  │
  └─ scheduleMondaySummary()  ← always (no widget data dependency)
```

### Scope

Single-file change: `src/hooks/useScheduledNotifications.ts`. Tests updated in `src/hooks/__tests__/useScheduledNotifications.test.ts`.

---

## Out of Scope

1. **Retrying `scheduleAll` after `widget_data` is written** — The fix defaults `hoursRemaining` to 1 so the notification is always scheduled on first run. Scheduling a re-run after `useWidgetSync` fires is unnecessary complexity. **Descoped:** Not needed — the default sentinel handles it.

2. **Changing notification content for fresh-install path** — The notification body is handled inside `scheduleThursdayReminder()` independently of this fix. Customizing "first week" messaging is a UX concern outside this bug fix. **Descoped:** No action needed in this spec.

3. **Handling notification scheduling for other notification types** — Only Thursday deadline and Monday summary are in scope. Any other notification channels are not touched. **Descoped:** Out of scope for this spec.

4. **Push permission prompting** — The permissions check (`Notifications.getPermissionsAsync`) is already correct and unchanged. Prompting the user to grant permissions on first launch is handled elsewhere. **Descoped:** Not part of this fix.

5. **Syncing notification schedule after `widget_data` is updated** — When `useWidgetSync` later writes real `hoursRemaining`, re-invoking `scheduleAll` to update the Thursday notification is future work. **Descoped:** No spec currently owns this; it is not a regression introduced here.

---

## Functional Requirements

### FR1 — Remove early-return bail on missing widget data

**Description:** `scheduleAll` must not return early when `widget_data` is absent from AsyncStorage. Scheduling must continue with a safe default for `hoursRemaining`.

**Current behaviour:** `if (!raw) return;` — exits immediately when widget data is null.

**Required behaviour:** When widget data is absent, continue with `hoursRemaining = 1`.

**Success Criteria:**
- When `AsyncStorage.getItem('widget_data')` returns `null`, `scheduleAll` does NOT return early
- `scheduleThursdayReminder` is called with `hoursRemaining = 1` (the sentinel default)
- `scheduleMondaySummary` is called unconditionally (not gated on widget data)
- Permissions-denied path still returns early (unchanged)

---

### FR2 — Default `hoursRemaining` to safe positive sentinel when data is absent

**Description:** When widget data is missing or malformed, `hoursRemaining` defaults to `1` — a sentinel value that passes the `> 0` guard and schedules the Thursday notification.

**Required behaviour:**
- `let hoursRemaining = 1;` initialized before attempting to read AsyncStorage
- Widget data read in a try/catch; any parse error keeps `hoursRemaining = 1`
- Only override the default when parsed value is a valid, finite number (not NaN)
- A parsed value of `0` or negative correctly suppresses the Thursday notification (user done / in overtime)

**Success Criteria:**
- `hoursRemaining` starts at `1` (not `0`)
- `parseFloat` on malformed/missing field → `NaN` → default `1` is kept
- `parseFloat` on `"-2.5h OT"` → `-2.5` → `hoursRemaining = -2.5` (skips Thursday correctly)
- `parseFloat` on `"8.5"` → `8.5` → `hoursRemaining = 8.5` (schedules Thursday correctly)
- `parseFloat` on `"0.0"` → `0` → `hoursRemaining = 0` (skips Thursday correctly)
- JSON parse failure keeps `hoursRemaining = 1`

---

### FR3 — Monday summary always scheduled when permissions granted

**Description:** `scheduleMondaySummary()` is called regardless of whether widget data is present. It has no dependency on `hoursRemaining`.

**Required behaviour:**
- `scheduleMondaySummary()` is called after the Thursday logic in all widget-data-absent cases
- `scheduleMondaySummary()` is called after the Thursday logic when widget data is present
- The only gate is permissions (existing behaviour)

**Success Criteria:**
- Fresh install (no widget data): `scheduleMondaySummary` called
- Widget data present: `scheduleMondaySummary` called
- Permissions denied: `scheduleMondaySummary` NOT called (return before reaching it)

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/hooks/useScheduledNotifications.ts` | Contains `scheduleAll` — the function being modified |
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | Existing tests — add new cases here |

### Files to Create / Modify

| File | Action | Change |
|------|--------|--------|
| `src/hooks/useScheduledNotifications.ts` | **Modify** | Replace `if (!raw) return` pattern with sentinel default |
| `src/hooks/__tests__/useScheduledNotifications.test.ts` | **Modify** | Add 4 new test cases for fresh-install and edge paths |

### Implementation

**Before (buggy):**
```typescript
const scheduleAll = async () => {
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (!raw) return;  // ← BUG: skips everything on fresh install

  const parsed = JSON.parse(raw);
  const hoursRemaining = parseFloat(parsed?.hoursRemaining ?? '') || 0;

  if (hoursRemaining > 0) {
    await scheduleThursdayReminder(hoursRemaining);
  }
  await scheduleMondaySummary();
};
```

**After (fixed):**
```typescript
const scheduleAll = async () => {
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  // Default to 1 (positive sentinel): assume hours remain when widget data not yet available
  let hoursRemaining = 1;
  const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const hoursRemainingStr = typeof parsed?.hoursRemaining === 'string'
        ? parsed.hoursRemaining : '';
      const hoursFloat = parseFloat(hoursRemainingStr);
      if (!isNaN(hoursFloat)) hoursRemaining = hoursFloat;
    } catch {
      // JSON parse failed — keep hoursRemaining = 1 (schedule notification)
    }
  }

  if (hoursRemaining > 0) {
    await scheduleThursdayReminder(hoursRemaining);
  }
  await scheduleMondaySummary();
};
```

### Edge Cases

| Scenario | `raw` | `parsed.hoursRemaining` | `hoursFloat` | Result |
|----------|-------|------------------------|-------------|--------|
| Fresh install | `null` | — | — | `hoursRemaining = 1` → Thursday scheduled |
| Overtime (`"-2.5h OT"`) | present | `"-2.5h OT"` | `-2.5` | `hoursRemaining = -2.5` → Thursday skipped |
| Done (`"0.0h"`) | present | `"0.0h"` | `0.0` | `hoursRemaining = 0` → Thursday skipped |
| Normal (`"8.5"`) | present | `"8.5"` | `8.5` | `hoursRemaining = 8.5` → Thursday scheduled |
| Missing field | present | `undefined` | `NaN` | `hoursRemaining = 1` → Thursday scheduled |
| Malformed JSON | present (bad) | parse throws | — | catch → `hoursRemaining = 1` → Thursday scheduled |

### Data Flow

```
scheduleAll()
  ├─ Notifications.getPermissionsAsync() → { granted }
  │    └─ !granted → return (no-op)
  │
  ├─ AsyncStorage.getItem('widget_data')
  │    ├─ null   → hoursRemaining = 1
  │    └─ string → try JSON.parse
  │                  ├─ parse ok, valid float → hoursRemaining = float
  │                  └─ parse fail / NaN     → hoursRemaining = 1
  │
  ├─ hoursRemaining > 0 → scheduleThursdayReminder(hoursRemaining)
  │
  └─ scheduleMondaySummary()
```

### Mocks Required for Tests

| Mock | Value | Purpose |
|------|-------|---------|
| `AsyncStorage.getItem` | `null` | Simulate fresh install |
| `AsyncStorage.getItem` | `'{"hoursRemaining":"8.5"}'` | Normal case |
| `AsyncStorage.getItem` | `'{"hoursRemaining":"0.0"}'` | Done case |
| `AsyncStorage.getItem` | `'not-json'` | Malformed JSON |
| `Notifications.getPermissionsAsync` | `{ granted: true }` | Allow scheduling |
| `Notifications.getPermissionsAsync` | `{ granted: false }` | Block scheduling |
| `scheduleThursdayReminder` | spy | Verify call / no-call |
| `scheduleMondaySummary` | spy | Verify always called |
