# Crossover API Reference

**Last mapped:** 2026-05-23 (Phase A static + Phase B live verification against `api-qa.crossover.com`)
**Live samples:** `docs/api-samples/` (one redacted JSON per endpoint, captured by `scripts/probe-crossover-api.mjs`)
**Scope:** Every Crossover API call the Hourglass app makes, plus the rules that govern them (auth, IDs, timezones, state transitions).

Companion to `docs/ARCHITECTURE.md`. ARCHITECTURE explains *how the app is wired*; this doc explains *what the server says*.

## Contents

1. [Base URLs & environments](#1-base-urls--environments)
2. [Authentication lifecycle](#2-authentication-lifecycle)
3. [ID mapping — the four user IDs](#3-id-mapping--the-four-user-ids)
4. [Endpoint catalog](#4-endpoint-catalog)
5. [Auth & profile endpoints](#5-auth--profile-endpoints)
6. [Data endpoints (timesheet, payments, work diary)](#6-data-endpoints)
7. [Approvals endpoints](#7-approvals-endpoints)
8. [Approval state machine](#8-approval-state-machine)
9. [Manual time — two data paths](#9-manual-time--two-data-paths)
10. [Data relationships](#10-data-relationships)
11. [AI% & BrainLift math](#11-ai--brainlift-math)
12. [Date & timezone rules](#12-date--timezone-rules)
13. [Error model](#13-error-model)
14. [Known gotchas](#14-known-gotchas)

---

## 1. Base URLs & environments

| Env | API base | App base |
|---|---|---|
| Prod | `https://api.crossover.com` | `https://app.crossover.com` |
| QA | `https://api-qa.crossover.com` | `https://app-qa.crossover.com` |

Selected per-user via `config.useQA` (boolean). All endpoints share the same path under both bases. Switched by `getApiBase(useQA)` in `src/store/config.ts`.

---

## 2. Authentication lifecycle

### Obtaining a token

```http
POST /api/v3/token
Authorization: Basic base64(username:password)
```

**Response:** the body is *either* a plain string `"userId:secret"` *or* JSON `{"token":"userId:secret"}`. Client code (`src/api/client.ts:32-38`) reads as text and tries to parse as JSON; if parse fails, treats text as the raw token.

**Token format:** `userId:secret` where:
- `userId` is the **login/profile ID** (e.g. `1190137`) — used by the server to identify the requester
- `secret` is the ephemeral credential

**Critical:** the `userId` in the token is **not** the ID used for timesheet or work diary queries. See §3.

### Per-request token (no caching)

`getAuthToken` is called fresh **before every API request** (`src/api/client.ts:7-39`). There is no in-memory token cache, no expiry tracking, no refresh-on-401 logic. Each `apiGet`/`apiPut` triggers a `POST /api/v3/token` first.

- **Pro:** simple; never have to handle expired-token edge cases.
- **Con:** 2× request volume; double the latency on every call.
- **Con:** a failure to mint a token cascades into a request failure.

Refactoring this to cache tokens would require knowing the token TTL — currently unknown. Phase B verification should observe whether the same `secret` works across multiple calls and for how long.

### Credentials persistence

- Username + password live in **Expo SecureStore** (iOS Keychain / Android Keystore) under keys `crossover_username` / `crossover_password` (`src/store/config.ts:25`).
- Falls back to AsyncStorage on web/simulator where SecureStore is unavailable.
- Cleared on logout via `clearAll()` (`src/store/config.ts`).

### Environment probe (onboarding only)

`probeEnvironments(username, password)` (`src/api/auth.ts:222-238`) calls `POST /api/v3/token` against **both** prod and QA in parallel. Returns `{type: 'prod_only' | 'qa_only' | 'both' | 'none'}`.

- `both` → UI shows env selector
- `prod_only` or `qa_only` → auto-proceed with that env
- `none` → invalid credentials

### Authenticated requests

```http
GET /api/...
x-auth-token: <full token string, including userId prefix>
```

All non-token requests use `x-auth-token` header (not `Authorization: Bearer ...`). Header value is the entire `userId:secret` string.

PUT requests additionally set `Content-Type: application/json`.

---

## 3. ID mapping — the four user IDs

Crossover uses **four distinct IDs** for the same human. Using the wrong one causes silent 4xx or empty responses. This is the single biggest source of bugs.

| Name | Source | Used by | Example |
|---|---|---|---|
| **Token userId** | prefix of token string (`/api/v3/token` response) | `approverId` field in approval body — **AND nothing else** | `1190137` |
| **candidate.id** (a.k.a. `config.userId`) | `userAvatars[type=CANDIDATE].id` (or `assignment.selection.marketplaceMember.application.candidate.id` as fallback) | `userId` query param on **Timesheet** endpoints | `2362707` |
| **assignment.id** (a.k.a. `config.assignmentId`) | `assignment.id` from `/api/identity/users/current/detail` | `assignmentId` query param on **Work Diary** endpoints | `79996` |
| **manager.id** (a.k.a. `config.managerId`) | `assignment.manager.id` | `managerId` query param on **Timesheet** endpoints | `2372227` |

Plus `team.id` (a.k.a. `config.primaryTeamId`, e.g. `4584`) for the `teamId` query param on timesheets.

**Mistakes that recur**:
- Passing token userId to timesheet → empty response.
- Passing candidate.id to work diary → empty response.
- Passing candidate.id as `approverId` to approve manual → 422.

---

## 4. Endpoint catalog

| Endpoint | Method | Purpose | Auth | Manager-only? |
|---|---|---|---|---|
| `/api/v3/token` | POST | Mint auth token | Basic | No |
| `/api/identity/users/current/detail` | GET | Profile + assignment + IDs | Token | No |
| `/api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0` | GET | Fallback assignment lookup | Token | No |
| `/api/timetracking/timesheets` | GET | Weekly hours by day | Token | No |
| `/api/v3/users/current/payments` | GET | Earnings + hours by week | Token | No |
| `/api/timetracking/workdiaries` | GET | 10-min slot detail + tags | Token | No |
| `/api/timetracking/workdiaries/manual/pending` | GET | Manager: pending manual time | Token | **Yes (403 for contributors)** |
| `/api/timetracking/workdiaries/manual/approved` | GET | Manager: approved manual time | Token | **Yes** |
| `/api/timetracking/workdiaries/manual/rejected` | GET | Manager: rejected manual time | Token | **Yes** |
| `/api/timetracking/workdiaries/manual/notifications/status` | GET/PUT | Manager: notification dismissal state | Token | **Yes** |
| `/api/timetracking/workdiaries/manual/approved` | PUT | Approve manual entries | Token | **Yes** |
| `/api/timetracking/workdiaries/manual/rejected` | PUT | Reject manual entries | Token | **Yes** |
| `/api/overtime/request` | GET | Pending overtime requests | Token | **Yes** |
| `/api/overtime/request/approval/{id}` | PUT | Approve overtime | Token | **Yes** |
| `/api/overtime/request/rejection/{id}` | PUT | Reject overtime | Token | **Yes** |

Endpoints not currently called by Hourglass but documented in MEMORY.md exist (e.g. `/api/v2/teams`). They're not in this catalog because we don't consume them.

---

## 5. Auth & profile endpoints

### `POST /api/v3/token`

See §2 for full lifecycle. Request body is empty. Response is `userId:secret` (text or JSON).

**Implementation:** `src/api/client.ts:7-39` (`getAuthToken`).

**Errors:**
| Status | Meaning |
|---|---|
| 401 | Invalid username/password |
| 403 | Account forbidden in this environment |

### `GET /api/identity/users/current/detail`

The single most important endpoint after token. Returns everything needed to populate `CrossoverConfig`.

**Request:** No query params. `x-auth-token` header.

**Response shape** (every field tracked by `src/api/auth.ts:9-25`):

```typescript
{
  fullName: string;                  // "Jane Doe"
  avatarTypes: string[];             // ["CANDIDATE"] or ["CANDIDATE","MANAGER"]
  assignment: {
    id: number;                      // → config.assignmentId (79996)
    salary: number;                  // hourly rate, → config.hourlyRate
    weeklyLimit?: number;            // default 40
    team: {
      id: number;                    // → config.primaryTeamId (4584)
      name: string;                  // "Team Alpha"
    };
    manager: {
      id: number;                    // → config.managerId (2372227)
    };
    selection?: {
      marketplaceMember?: {
        application?: {
          candidate?: { id: number } // fallback for candidate.id
        }
      }
    };
  };
  userAvatars?: Array<{              // PRIMARY source for candidate.id
    type: string;                    // "CANDIDATE" or "MANAGER"
    id: number;                      // → config.userId when type === "CANDIDATE"
  }>;
}
```

**Field consumption** (from `src/api/auth.ts`):

| Field | Used in | What for |
|---|---|---|
| `fullName` | `auth.ts:71` | `config.fullName` |
| `avatarTypes` includes `"MANAGER"` | `auth.ts:77` | `config.isManager` |
| `assignment.id` | `auth.ts:74` | `config.assignmentId` |
| `assignment.salary` | `auth.ts:75` | `config.hourlyRate` |
| `assignment.weeklyLimit` | `auth.ts:76` | `config.weeklyLimit` (default 40) |
| `assignment.team.id` | `auth.ts:73` | `config.primaryTeamId` |
| `assignment.team.name` | `auth.ts:80` | team display |
| `assignment.manager.id` | `auth.ts:72` | `config.managerId` |
| `userAvatars[type=CANDIDATE].id` | `auth.ts:62-67` | `config.userId` (primary path) |
| `selection...candidate.id` | `auth.ts:65-66` | `config.userId` (fallback) |

**Fallback chain:** if detail endpoint fails non-401/403, `fetchAndBuildConfig` calls `/api/v2/teams/assignments` (`auth.ts:151-157`).

**Salary fallback:** if `assignment.salary === 0`, queries `/api/v3/users/current/payments` for the last ~3 months and derives an hourly rate from `amount / paidHours` (`auth.ts:176-201`).

### `GET /api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0`

Backup for `/detail`. Returns assignment array. Same field semantics; first element used. Documented but rarely needed in practice.

---

## 6. Data endpoints

### `GET /api/timetracking/timesheets`

Weekly auto-tracked hours by day. Used for the hours dashboard and widget.

**Query params** (all date strings YYYY-MM-DD):

| Param | Required | Notes |
|---|---|---|
| `date` | yes | Monday of current week, **UTC** (use `Date.UTC()` math — see §12) |
| `period` | yes | Always `"WEEK"` |
| `userId` | yes | **candidate.id**, not token userId |
| `managerId` | strategy-dependent | Manager's candidate.id |
| `teamId` | strategy-dependent | team.id |

**3-strategy fallback** (`src/api/timesheet.ts:24-71`): API parameter combinations are unstable, so we retry silently with fewer params. Only `AuthError` (401/403) escapes; other errors fall through.

1. Full: `date`, `period`, `userId`, `managerId`, `teamId`
2. Without `teamId`: drop team filter
3. Minimal: only `date`, `period`, `userId` (works for non-managers)

Returns the first strategy that yields a non-empty array. Returns `null` if all three fail.

**Response shape** — array; we take the first element:

```typescript
{
  totalHours?: number;          // Total auto-tracked hours (one of totalHours/hourWorked is present)
  hourWorked?: number;          // Alternate name for totalHours
  manualHourWorked?: number | string;
                                // Manual/logbook hours INCLUDING pending — string e.g. "0.3333"
  averageHoursPerDay: number;
  stats?: Array<{
    date: string;               // Full ISO "2026-03-09T00:00:00.000Z" — slice [0:10] for YYYY-MM-DD
    hours: number;
  }>;
}
```

**Notes:**
- `manualHourWorked` is an aggregate; per-entry detail requires the work diary.
- `stats` is typically Mon–Sun, one entry per day.

### `GET /api/v3/users/current/payments?from=YYYY-MM-DD&to=YYYY-MM-DD`

Earnings ledger with OT breakdown.

**Date semantics:** `from` is Monday UTC, `to` is Sunday UTC. **Mon–Sun UTC weeks** — distinct from the local week boundary used elsewhere. See §12.

**Response shape** (one record per week in the range; current week is at the end):

```typescript
{
  amount: number;                    // Total payment for the period
  periodStartDate: string;           // "YYYY-MM-DD" Monday
  periodEndDate: string;             // "YYYY-MM-DD" Sunday
  paidHours: number;                 // Source of truth for displayed hours (regular + approved OT)
  workedHours: number;               // Raw tracked (auto + manual), uncapped
  overtimeHours: number;             // Actual OT (hours beyond weeklyLimit)
  approvedOvertimeHours: number;     // OT authorized (may not be fully worked)
  manualMinutes: number;             // Manual minutes already included in paidHours
  status: string;                    // "CURRENT" | "PENDING" | "PROCESSED"
}
```

**Field hierarchy** (`src/lib/hours.ts:240-246`):
- `paidHours > 0` → use it (includes approved manual)
- else `workedHours > 0` → use it (auto only)
- else fall back to timesheet `totalHours`

Earnings are computed as `displayedHours × hourlyRate`, **not** `amount / hours` — keeps the visible numbers internally consistent.

### `GET /api/timetracking/workdiaries?assignmentId=N&date=YYYY-MM-DD`

10-minute slot detail. Granular activity records with optional tags.

**Query params:**
- `assignmentId` — **assignment.id** (e.g. 79996). NOT candidate.id, NOT token userId.
- `date` — single date in **local** timezone (no UTC conversion). Returns one day at a time.
- `timeZoneId` (optional) — numeric timezone ID (e.g. `408` for America/Chicago). When omitted, `slot.date` and `slot.time` are returned in **UTC**. When provided, both are local to that timezone. Most callers omit this.

**Response shape** — flat array, one element per slot (~6/hour, ~31/working day):

```typescript
{
  // Scheduling fields (confirmed 2026-06-09 from live prod response)
  date: string;              // ISO 8601 + tz offset. Without timeZoneId: UTC, e.g. "2026-06-09T12:50:00Z"
  time: string;              // "HH:MM:SS". Without timeZoneId: UTC. Use slot.date for hour extraction.
  // Hour extraction: new Date(slot.date).getHours() → device-local hour (0-23), regardless of timeZoneId

  // Activity fields (confirmed 2026-06-09)
  activityLevel: number;     // 1-100 — keyboard/mouse activity intensity
  intensityScore: number;    // 1-100 — weighted productivity intensity
  productivityCategory: "PRODUCTIVE" | "COMMUNICATION" | "UNCATEGORIZED";
  activities: string[];      // Confirmed values: "AI", "PURE_AI", "Chat", "Meeting", "Office",
                             //   "Development", "Uncategorized"

  // BrainLift (second_brain slots only; null on all others)
  secondBrainDeepDive: {
    probability: string;                      // Float-as-string, e.g. "84.4"
    ai_tool_actively_present: number;         // 0-100
    deep_ai_research_and_synthesis: number;   // 0-100
    building_custom_ai_tools: number;         // 0-100
    documenting_ai_system_or_prompts: number; // 0-100
    routine_operational_work: number;         // 0-100
  } | null;

  // Existing fields
  tags: string[];                    // ["ai_usage"], ["second_brain"], ["not_second_brain"], [], or combinations
  autoTracker: boolean;              // true = auto-tracker, false = manual entry
  status: "PENDING" | "APPROVED" | "REJECTED";   // For manual entries
  memo: string;                      // User's description ("Fix", "Meeting")
  actions: Array<{
    actionType: string;              // "ADD_MANUAL_TIME" | "APPROVE_MANUAL_TIME" | "REJECT_MANUAL_TIME"
    comment: string;                 // For REJECT: manager's reason
    actionMadeBy: number;            // userId of actor
    createdDate: string;             // ISO 8601
  }>;
  events?: Array<{                   // Only on auto-tracker slots
    processName: string;             // "Cursor", "Slack", "Chrome"
    idle: boolean;
    activity: string;                // "AI" | "PURE_AI" | "OTHER"
  }>;
  type?: "WEB" | "MOBILE";           // Submission source for manual entries
}
```

**Example — productive AI slot (no BrainLift):**
*(captured with `timeZoneId=408`; without it, `date` is UTC: `"2026-06-09T12:50:00Z"`)*
```json
{
  "date": "2026-06-09T06:50:00-06:00",
  "time": "06:50:00",
  "activityLevel": 100,
  "intensityScore": 100,
  "productivityCategory": "PRODUCTIVE",
  "activities": ["AI", "PURE_AI"],
  "tags": ["ai_usage"],
  "autoTracker": true,
  "status": "APPROVED",
  "secondBrainDeepDive": null
}
```

**Example — BrainLift slot:**
*(captured with `timeZoneId=408`)*
```json
{
  "date": "2026-06-09T12:20:00-06:00",
  "time": "12:20:00",
  "activityLevel": 90,
  "intensityScore": 85,
  "productivityCategory": "PRODUCTIVE",
  "activities": ["AI"],
  "tags": ["second_brain"],
  "autoTracker": true,
  "status": "APPROVED",
  "secondBrainDeepDive": {
    "probability": "84.4",
    "ai_tool_actively_present": 90,
    "deep_ai_research_and_synthesis": 85,
    "building_custom_ai_tools": 60,
    "documenting_ai_system_or_prompts": 45,
    "routine_operational_work": 10
  }
}
```

**Tag set:**
- `ai_usage` — using AI tools (target: 75% of tagged slots/week)
- `second_brain` — BrainLift session (target: 5h/week ≈ 30 slots)
- `not_second_brain` — explicitly *not* BrainLift (use exact-match check; don't substring-match)

To detect contributor's pending manual time: iterate week dates, filter `autoTracker === false && status === "PENDING"`, count slots × 10 minutes.

---

## 7. Approvals endpoints

### `GET /api/timetracking/workdiaries/manual/pending?weekStartDate=YYYY-MM-DD`

Manager-only (403 for contributors). One manager, all team manual time pending in the week.

**Response shape:**

```typescript
Array<{
  userId: number;
  fullName: string;
  manualTimes: Array<{
    status: "PENDING" | "APPROVED" | "REJECTED";
    durationMinutes: number;
    description: string;
    startDateTime: string;            // ISO 8601
    timecardIds: number[];            // Composite primary key
    type: "WEB" | "MOBILE";
  }>;
}>
```

Parsed to `ManualApprovalItem` (`src/lib/approvals.ts:51-63`):
- `id = "mt-" + timecardIds.join("-")` — composite key
- `category = "MANUAL"`
- `hours = (durationMinutes / 60).toFixed(1)`

Also exist with same query signature (not currently called for the queue, but exist):
- `/api/timetracking/workdiaries/manual/approved`
- `/api/timetracking/workdiaries/manual/rejected`

### `GET /api/overtime/request?status=PENDING&weekStartDate=YYYY-MM-DD`

Manager-only. Pending overtime requests for the team.

**Response shape:**

```typescript
Array<{
  overtimeRequest: {
    id: number;
    status: "PENDING" | "APPROVED" | "REJECTED";
    durationMinutes: number;
    description: string;
    startDateTime: string;
  };
  assignment: {
    id: number;
    salary: number;                   // Hourly rate
    selection: {
      marketplaceMember: {
        application: {
          candidate: {
            id: number;
            printableName: string;
            jobTitle: string;
          };
        };
      };
    };
  };
}>
```

Parsed to `OvertimeApprovalItem` (`src/lib/approvals.ts:65-78`):
- `id = "ot-" + overtimeRequest.id`
- `category = "OVERTIME"`
- `hours = (durationMinutes / 60).toFixed(1)`
- `cost = Math.round(hours * salary * 100) / 100`

### `PUT /api/timetracking/workdiaries/manual/approved`

Manager-only. Approve one or more manual time entries.

**Body:**
```json
{
  "approverId": "1190137",     // TOKEN userId (login/profile ID) — NOT candidate.id
  "timecardIds": [12345, 12346],
  "allowOvertime": false        // Hard-coded false in current code
}
```

**Response:** Empty body, 200 OK. (See the recent `1adca60` fix — empty responses no longer crash JSON parsing.)

**Critical:** `approverId` is the **token userId** (stored at `config.userId` only if you grabbed it from the token; the field name `config.userId` is overloaded — re-read `src/hooks/useApprovalItems.ts:150` for the exact extraction). Using candidate.id here → 422.

### `PUT /api/timetracking/workdiaries/manual/rejected`

Manager-only. Reject one or more manual time entries.

**Body:**
```json
{
  "approverId": "1190137",
  "timecardIds": [12345],
  "rejectionReason": "Duplicate of yesterday's entry"
}
```

**Response:** Empty body, 200 OK.

### `PUT /api/overtime/request/approval/{overtimeId}`

Manager-only. Approve a single overtime request.

**Path param:** `overtimeId` = `overtimeRequest.id` from the pending query (numeric).

**Body:** `{}` (empty JSON object — not empty string; some Crossover endpoints reject zero-byte bodies).

**Response:** Empty body, 200 OK.

### `PUT /api/overtime/request/rejection/{overtimeId}`

Manager-only. Reject a single overtime request.

**Body:**
```json
{ "memo": "Insufficient justification" }
```

**Response:** Empty body, 200 OK.

---

## 8. Approval state machine

Both manual time and overtime share this shape:

```
        ┌───────────┐
        │  PENDING  │
        └──┬─────┬──┘
           │     │
   PUT /approved │  PUT /rejected
           │     │
           ▼     ▼
     ┌────────┐ ┌────────┐
     │APPROVED│ │REJECTED│
     └────────┘ └────────┘
```

**Important properties:**

1. **State is implied by which endpoint you call** — the request body does not include a `status` field. Calling `/approved` flips the row to APPROVED; calling `/rejected` flips it to REJECTED.
2. Both terminal states are removed from the pending queue. The manager queue only ever shows PENDING.
3. Approved items contribute to `paidHours` on the next payments-API response.
4. Rejected items leave a trail in the work diary's `actions` array with `actionType: "REJECT_MANUAL_TIME"` and the manager's `comment`. They do **not** disappear from the contributor's view.
5. APPROVED → no further transitions. REJECTED → no further transitions. There's no "re-pending" workflow we've observed.

---

## 9. Manual time — two data paths

**The same row is visible through two different APIs depending on who's looking.**

### Manager view

`GET /api/timetracking/workdiaries/manual/pending?weekStartDate=...`

Returns aggregated by-user submissions across the team. Manager-only (403 for contributors).

### Contributor view (their own entries)

`GET /api/timetracking/workdiaries?assignmentId=...&date=...`

Same data, but accessed via the **work diary endpoint** (which is contributor-readable). Filter by `autoTracker === false`.

**Why two paths exist:**
- The manager `/manual/*` endpoints are scoped by team, not by user. They show all team manual time at once.
- The work diary is scoped by assignmentId (a single contributor), and is the only contributor-readable source.

**Implications:**
- Contributors **cannot** access `/manual/pending` (we've confirmed 403). Earlier reverse-engineering attempts tried 8 variations (`manual?assignmentId`, `timecards?assignmentId`, `manual/my`, etc.); all returned 404/405/400. The work diary is the only viable contributor path.
- To compute "pending manual hours for this contributor this week": iterate `[Mon..Sun]`, fetch the work diary for each day, filter `autoTracker === false && status === "PENDING"`, sum `slots.length * 10` minutes.
- For grouping in the UI ("My Requests"), slots on the same day with the same `memo` are coalesced into one entry. Aggregation rules: status precedence REJECTED > PENDING > APPROVED. See `src/lib/requestsUtils.ts:42-94`.

### Action trail

When state changes, an entry is appended to the slot's `actions` array:

| actionType | Set on | What it tells you |
|---|---|---|
| `ADD_MANUAL_TIME` | Contributor submits | `actionMadeBy` = contributor; `comment` = memo |
| `APPROVE_MANUAL_TIME` | Manager approves | `actionMadeBy` = manager |
| `REJECT_MANUAL_TIME` | Manager rejects | `actionMadeBy` = manager; `comment` = rejection reason (extract from here) |

---

## 10. Data relationships

The same human's week appears in three overlapping APIs. Tracing how a single action (manual time submission, manager approval) flows through:

### Submission → approval cycle

1. Contributor logs 30 minutes manual time via Crossover web UI.
2. Crossover creates **3 work-diary slots** (`autoTracker: false`, `status: "PENDING"`, `memo: "Meeting"`, with one `actions` entry of type `ADD_MANUAL_TIME`).
3. Timesheet API now reports `manualHourWorked: "0.5"` (aggregated, no per-entry detail).
4. Payments API still shows old `paidHours` (manual not yet approved).
5. Manager queries `/manual/pending` and sees the new submission.
6. Manager approves → `PUT /manual/approved` with the 3 timecardIds.
7. Work-diary slot status → `APPROVED`; a new `APPROVE_MANUAL_TIME` action is appended.
8. Payments API on next fetch shows `paidHours` increased by 0.5, and `manualMinutes` increased by 30.
9. Manager's pending queue no longer contains the entry.

### Mismatch windows

Because the three APIs aren't transactional with each other:
- Between steps 2 and 8, **timesheet says 0.5 manual hours, payments says 0 paid hours, work diary says PENDING**. UI must reconcile.
- A widget refresh during this window will display "0.5h pending" rather than "+0.5h earnings."

This is the system you have. There is no "give me all of week X in one call" endpoint.

### Approval action → refresh

After a manager approval (`src/hooks/useApprovalItems.ts:149,191`):
1. Optimistic local removal of the item from the queue.
2. PUT fires.
3. On settle (success **or** failure): `queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })`.
4. Full **6-call** parallel refetch (`fetchAllApprovalItems`): manual + overtime × 3 weeks (current + 2 prior).
5. `useWidgetSync` detects the new `approvalItems` and writes to widget storage.

---

## 11. AI% & BrainLift math

**AI% formula** (validated ±2% max error across 4 weeks, ~0.75% avg — see `docs/AI_VALIDATION.md` and MEMORY.md):

```
aiPct = (slots tagged ai_usage OR second_brain) / (total slots − untagged) × 100
```

Rules:
- Union of `ai_usage` and `second_brain` (a slot with both is counted once).
- Exclude untagged slots from the denominator (untagged = `tags.length === 0`).
- Display as a `±2%` range to match real measurement error: `[round(aiPct - 2), round(aiPct + 2)]` clamped to 0–100.
- Edge case: if `taggedSlots === 0`, show `0%–0%`, not `0%–2%` (don't suggest progress when there is none).

**BrainLift hours:**

```
brainliftHours = (count of slots tagged second_brain) × 10 / 60
```

- Each slot is 10 minutes. Target: 5 h/week ≈ 30 slots.
- BrainLift is **not** a subset of AI% — it's a separate metric (though semantically overlapping).

**Cone math** (forward-looking possibility cone — `src/lib/aiCone.ts:1-245`):

Given current position (hours worked, AI% achieved), project remaining-week possibilities:

```
slotsRemaining = (weeklyLimit − currentHours) × 6   // 6 slots/hour
upperBound = ((aiSlots + slotsRemaining) / (taggedSlots + slotsRemaining)) × 100
lowerBound = (aiSlots / (taggedSlots + slotsRemaining)) × 100
achievable = upperBound >= 75 || currentAIPct >= 75   // 75% is the hardcoded target
```

**Week boundary for AI math:** **Mon–Sun local** (not UTC). Distinct from payments which is Mon–Sun UTC.

---

## 12. Date & timezone rules

There are **two** week boundary conventions in use simultaneously:

| Convention | Used by | Why |
|---|---|---|
| **Mon–Sun UTC** | Payments API (`from`/`to` params), deadline calculation | Server-side billing cycles |
| **Mon–Sun local** | Timesheet display, work diary fetches, AI/BrainLift aggregation | User-visible "this week" |

### Formatting dates for the API

**For UTC week parameters (payments):**

```typescript
// CORRECT
const utcDay = now.getUTCDay();
const daysToMonday = (utcDay + 6) % 7;
const monday = new Date(Date.UTC(
  now.getUTCFullYear(), now.getUTCMonth(),
  now.getUTCDate() - daysToMonday
));
const param = monday.toISOString().slice(0, 10);
```

**WRONG:**

```typescript
// BUG: toISOString() on a local Date shifts to UTC, may change the day.
// Local Mon 7pm EST → toISOString() yields Tuesday UTC → wrong date sent.
const monday = new Date(); /* local Monday */
const param = monday.toISOString().slice(0, 10);
```

See `src/api/payments.ts:13-37` and `src/lib/hours.ts:95-118` for correct implementations.

### For local timezone (work diary, displays)

Pass YYYY-MM-DD strings computed from local `getFullYear`/`getMonth`/`getDate` — no UTC conversion.

### The deadline

Crossover's hard deadline is **Sunday 23:59:59 UTC** for the week. The Thursday 6pm notification is *our* reminder, not a Crossover deadline.

---

## 13. Error model

All client requests can throw three classes (`src/api/errors.ts`):

| Class | When |
|---|---|
| `NetworkError` | `fetch()` itself throws (offline, DNS, timeout) |
| `AuthError` | HTTP 401 or 403 |
| `ApiError` | Any other non-2xx (400, 422, 500, etc.) — `.statusCode` carries the number |

**Mapping:** `src/api/client.ts:42-52` — `handleStatus(status)` throws AuthError on 401/403, ApiError otherwise.

**Empty response bodies:** PUT endpoints (`/approved`, `/rejected`, overtime approval/rejection) return empty body on 200. Naïve `response.json()` would throw — `apiPut` reads as text first and returns `undefined` for empty bodies (`src/api/client.ts:97-101`, fixed in commit `1adca60`).

**Error envelopes** from the server: not consistently documented. Some 4xx return JSON `{message: "..."}`, others return plain text, others empty body. We never display the raw server message to the user — only generic copy keyed off the error class.

**No retry policy** anywhere. A flaky network → user sees a failed action. This is a known gap; design for retry-with-pending is documented but not implemented.

---

## 14. Known gotchas

1. **Wrong-ID empty responses.** Passing token userId where candidate.id belongs (or vice versa) silently returns empty arrays. There's no "you used the wrong ID" error. See §3.

2. **`approverId` is the token userId.** Not `candidate.id`, not `assignment.id`. Easy to mix up because `config.userId` looks like it should be the canonical user ID. `src/hooks/useApprovalItems.ts:150`.

3. **Endpoint nouns, not verbs.** `/manual/approved` not `/manual/approve`. `/manual/rejected` not `/manual/reject`. Easy to "fix" the URL the wrong way.

4. **3-strategy timesheet fallback is silent.** Strategy 1 failing doesn't bubble up — strategy 2 runs, then strategy 3. The caller only sees the first non-empty result or `null`. This means a partial 401 won't surface as auth failure; a 500 in strategy 1 looks identical to "team filter not supported."

5. **3-week parallel fetches.** Manager queue = 6 simultaneous calls (manual + overtime × 3 weeks). Contributor "My Requests" = N day-by-day calls (one per date in the 3-week window). Tolerant of partial failure (uses `Promise.allSettled`); only surfaces error if *all* days fail.

6. **Cross-week notification trigger.** Because we widened the approval window to include 2 prior weeks (commits `3636a64`, `8cedb63`), the count-based dedup in the push handler (`prev_approval_count`) can spike on the first refresh after the change — surfacing as "new approvals" notifications for items the user has already seen. See ARCHITECTURE.md §8.1.

7. **Manual time has two source-of-truth APIs.** Manager queue (`/manual/pending`) and work diary (`/workdiaries`). They must be reconciled by the UI; they don't refer to each other. See §9.

8. **PUT empty-body bug history.** Crossover's approve/reject endpoints return literal empty bodies on success. Before commit `1adca60`, `response.json()` would throw "Unexpected end of input" — surfaced to the user as a JSON parse error during approval. The fix (read as text, parse only if non-empty) is now in `src/api/client.ts`.

9. **Token has no in-memory cache.** Every API call mints a fresh token. We don't know the token TTL — possibly we could keep one for the duration of a session and only re-fetch on 401. Phase B should verify.

10. **`amount` vs `paidHours × hourlyRate` mismatch.** We display `paidHours × hourlyRate` for internal consistency. Crossover's actual paid amount (`amount`) may differ slightly due to rounding or special-case adjustments. UI never shows `amount` directly.

11. **`manualHourWorked` can be a string.** Timesheet API sometimes returns it as `"0.3333"` (string), sometimes as `0.3333` (number). `parseFloat` it before use (`src/lib/hours.ts`).

12. **No webhooks.** Everything is poll-based. The Railway ping server (`server/`) does silent pushes every 30 min to wake the app for background refresh, but those don't deliver Crossover data — they just trigger the app to call the API itself.

---

## 15. Phase B live findings (2026-05-23)

Probed `api-qa.crossover.com` with a Manager / COMPANY_ADMIN account. Raw redacted samples are in `docs/api-samples/`. Findings below are facts observed against the live server, not the code.

### F1. Auth tokens are reusable for at least 12 seconds

The same token successfully authenticated 3 calls at t=0, t=2s, t=12s. The current `getAuthToken`-on-every-request pattern doubles request volume needlessly. **TTL is unknown but ≥ 12s.** Recommend caching the token in memory for the duration of a foreground session, refreshing on first 401. (Long enough to verify against would be a 5-minute and 30-minute follow-up probe.)

Source: `docs/api-samples/01b-token-reuse.json`

### F2. Token response is JSON, not plain text (in QA)

```
content-type: application/json;charset=UTF-8
body: {"token":"765054:..."}
```

Static code defends against both plain-text and JSON (`client.ts:32-38`), so this is consistent. The "or plain text" path may be a legacy/prod variation.

### F3. Bad tokens return 500 HTML, not 401

```
GET /api/identity/users/current/detail
x-auth-token: not-a-token:bogus
→ 500
   <!doctype html><html lang="en"><head><title>HTTP Status 500 – Internal Server Error</title>...
```

**This breaks our auth-error detection.** `handleStatus(status)` in `src/api/client.ts:42-52` maps 401/403 → AuthError and everything else → ApiError. Bad/expired tokens hit this Tomcat error page, which becomes `ApiError(500)`, not `AuthError`. The re-onboarding-on-401 flow can therefore never fire from an expired token.

**Action item (not done here):** in `apiGet`/`apiPut`, detect HTML responses (content-type `text/html`) on 5xx and treat as auth failure, or probe for a missing-token-shaped error.

Source: `docs/api-samples/09-error-cases.json`

### F4. Structured error envelope exists for "expected" failures

When the server can construct a domain error, it returns JSON:

```json
{
  "errorCode": "CROS-XXXX",
  "type": "ERROR",
  "httpStatus": 400,
  "text": "Human-readable message — sometimes safe to display"
}
```

Codes observed:

| errorCode | status | Meaning |
|---|---|---|
| `CROS-0002` | 403 | Forbidden (e.g. payments endpoint for a manager without contributor role) |
| `CROS-0005` | 400 | Validation failure — `text` names the bad field, e.g. `"\"teamId\" is not a valid value"` |
| `CROS-0400` | 400 | Generic internal error with a server-side reference code (e.g. `"DDF88BDA"`) |

Our `ApiError` currently surfaces only `statusCode`. **Action item:** capture `errorCode` and `text` from JSON responses so we can:
- Distinguish validation errors from server bugs (CROS-0005 vs CROS-0400).
- Surface the server's human-readable message in some contexts (validation only — generic internal errors aren't user-safe).

Source: `docs/api-samples/04-timesheet.json`, `05-payments-current-week.json`

### F5. The detail endpoint returns a *completely different schema* for users with no contributor role

The QA test user is `MANAGER + COMPANY_ADMIN` with **no CANDIDATE avatar**. The response is **not** the schema documented in §5:

```json
{
  "applications": {
    "MANAGER": [
      {"name": "Activities", "identifier": "ACTIVITIES", "enabled": true, "appUserType": "TEAM"},
      {"name": "Check-in Chats", "identifier": "CHECKIN_CHATS", "enabled": true, ...},
      ...
    ]
  }
}
```

No `assignment`, no `userAvatars`, no `fullName`. It's a "what features can I see" payload, not a profile.

**Implication:** the code path in `src/api/auth.ts:9-25` that destructures `data.assignment`, `data.userAvatars` will **crash silently** (returns `undefined` for everything, then attempts to use those values downstream).

Confirmed in our probe: `candidate.id`, `assignment.id`, `manager.id`, `team.id` were all `undefined`, which is why every subsequent endpoint failed (400 "userId is not a valid value", etc.).

**This is a real production gap:** pure managers who don't also have a contributor role would have a broken onboarding. We don't currently know if any real human is in this state — the QA fixture may be artificial.

Source: `docs/api-samples/02-user-detail.json`

### F6. `/api/v2/teams/assignments` uses Spring page envelope

Not a flat array — wrapped in pagination metadata:

```json
{
  "content": [],
  "last": true,
  "totalElements": 0,
  "totalPages": 1,
  "first": true,
  "numberOfElements": 0,
  "size": 0,
  "number": 0
}
```

The actual records (when present) are at `.content`. Current fallback code in `auth.ts:151-157` should be re-checked to confirm it reads `.content`, not the response root.

Source: `docs/api-samples/03-assignments.json`

### F7. Timesheet "3-strategy fallback" doesn't help when the user lacks fields

Probed against the no-candidate manager with `userId=undefined, managerId=undefined, teamId=undefined`:
- Strategy 1: 400 `CROS-0400` "internal error"
- Strategy 2: 400 `CROS-0005` `"teamId" is not a valid value`
- Strategy 3 (minimal — only `userId`): 400 `CROS-0005` `"teamId" is not a valid value`

The server complained about `teamId` even when we didn't send one — likely because `userId=undefined` triggered cascading validation that surfaces an unhelpful first error.

**Implication:** the 3-strategy fallback was designed for "different param sets get different success rates," but in the no-candidate case **none of the strategies succeed**. The user-detail breakage (F5) cascades to every other endpoint.

### F8. Payments endpoint is 403 for the test manager

```
GET /api/v3/users/current/payments?from=2026-05-18&to=2026-05-24
→ 403 CROS-0002
```

A pure manager (no candidate role) cannot query their own payments. **Implication:** the salary-fallback path in `src/api/auth.ts:176-201` (which queries `/payments` when `assignment.salary === 0`) would fail with 403 for these users. The code catches non-fatal errors, so the rate stays 0 — but the dashboard would show $0 earnings forever.

### F9. Manual pending and overtime pending endpoints return empty arrays cleanly

Manager-only endpoints worked even without an assignment:
- `GET /api/timetracking/workdiaries/manual/pending?weekStartDate=2026-05-18` → 200 `[]`
- `GET /api/overtime/request?status=PENDING&weekStartDate=2026-05-18` → 200 `[]`

No 403 — these are scoped by the manager's view, not by their own assignment. Good news for the manager queue.

### F10. Schema unknowns not resolved by this probe

Because the QA user is a manager-only account with no team data in this snapshot:
- Real-shape `manualTimes` records (response of `/manual/pending` when populated)
- Real-shape `overtimeRequest` records
- Real work diary slots with tags
- Real timesheet `stats` array

These remain documented from static analysis. To capture them, a future probe needs a **contributor account** (or a populated manager test team).

### F11. Re-run / extension instructions

The probe script is `scripts/probe-crossover-api.mjs`. To re-run after adding a contributor account:

```bash
# add TEST_QA_CONTRIB_USERNAME / TEST_QA_CONTRIB_PASSWORD to .env.local
node scripts/probe-crossover-api.mjs
```

The samples it writes to `docs/api-samples/` are gitignored if they contain unredacted PII. The current redactor (`scripts/probe-crossover-api.mjs:30-49`) masks `fullName`, `printableName`, `firstName`, `lastName`, `email`, `username`, `phone`, `avatarUrl`, `token`, `password`, `secret`, `x-auth-token`. If you add more sensitive fields to any endpoint, extend `REDACT_KEYS`.

---

## Open questions for the next Crossover liaison conversation

1. **Token TTL**: confirmed >12s. What's the actual expiration? Hours? Session-bound?
2. **Bad-token response**: is the Tomcat 500 page intentional or a server bug? Should it be 401?
3. **`appUserType: "BOTH"` vs `"TEAM"`** in the manager applications payload — what's the contract?
4. **Pure manager accounts**: are these production-real, or is the QA fixture artificial?
5. **`errorCode` catalog**: is there a published list of `CROS-XXXX` codes we can reference?
6. **Pagination**: only one of our endpoints (`/assignments`) returned a page envelope. Do timesheet/payments paginate at scale?
