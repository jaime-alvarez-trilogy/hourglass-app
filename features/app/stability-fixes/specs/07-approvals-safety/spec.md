# 07-approvals-safety

**Status:** Draft
**Created:** 2026-04-09
**Last Updated:** 2026-04-09
**Owner:** @jaime-alvarez-trilogy

---

## Overview

### What Is Being Built

`07-approvals-safety` adds null-safety guards to `parseOvertimeItems` in `src/lib/approvals.ts`. The function currently destructures a 5-level deep access chain (`assignment.selection.marketplaceMember.application.candidate`) without any null checks. If the Crossover API returns any overtime entry where an intermediate field is `null` or `undefined`, the function throws `TypeError: Cannot read properties of undefined`, crashing the entire approvals screen for the manager.

### How It Works

The fix uses TypeScript optional chaining (`?.`) throughout the candidate access chain and adds a null guard before constructing the result item. Entries where `candidate` resolves to `null` or `undefined` are filtered out with `.filter((item): item is OvertimeApprovalItem => item !== null)`. A `console.warn` is emitted for each dropped entry so the issue remains debuggable without affecting the user experience.

Additionally, `assignment.salary` is protected with a `?? 0` fallback so cost calculation does not produce `NaN` if salary is missing.

### Scope

This is a single-function surgical fix. No new UI, no schema changes, no new API calls. The change is purely defensive — it makes `parseOvertimeItems` resilient to any malformed overtime response from the Crossover API.

---

## Out of Scope

1. **Fixing `RawOvertimeResponse` TypeScript types to allow nullable fields** — **Descoped:** The type accurately reflects what the API is supposed to return. Making fields nullable would require changes across all callers. The null guard in `parseOvertimeItems` is the correct defensive layer without touching types.

2. **Adding null guards to `parseManualItems`** — **Descoped:** `parseManualItems` uses a flat structure (`user.manualTimes[]`) with no deep nesting; the crash risk does not exist there.

3. **Surfacing a warning UI to managers when items are skipped** — **Descoped:** Silently skipping malformed entries with a `console.warn` is sufficient. A UI warning would require design and adds complexity disproportionate to the edge case.

4. **Retry logic for malformed overtime API responses** — **Descoped:** Retrying would return the same malformed data. The correct response is to filter and continue.

5. **Updating `useApprovalItems.ts` error handling** — **Descoped:** `useApprovalItems` already has query-level error handling. The fix in `parseOvertimeItems` prevents the throw from reaching the hook, so no hook changes are needed.

---

## Functional Requirements

### FR1: Optional Chaining and Null-Filter in `parseOvertimeItems`

**Description:** Replace the bare 5-level deep access chain in `parseOvertimeItems` with optional chaining. Add a null guard after deriving `candidate`. Filter null results from the final array. Emit `console.warn` for every skipped entry.

**Current behavior:**
```typescript
const candidate = assignment.selection.marketplaceMember.application.candidate
```
Throws `TypeError` if any intermediate level is `null` or `undefined`.

**Required behavior:**
```typescript
const candidate = assignment?.selection?.marketplaceMember?.application?.candidate

if (!candidate) {
  console.warn('[parseOvertimeItems] Skipping entry with missing candidate:', overtimeRequest?.id)
  return null
}
```
Then chain `.filter((item): item is OvertimeApprovalItem => item !== null)` on the result.

**Also required:** Guard `assignment.salary` with `?? 0` fallback for cost calculation:
```typescript
const cost = Math.round(hours * (assignment?.salary ?? 0) * 100) / 100
```

**Also required:** Guard `overtimeRequest` itself — if `overtimeRequest` is null/undefined, return null early and warn.

**Success Criteria:**
- SC1: A well-formed overtime entry returns a valid `OvertimeApprovalItem` — no regression
- SC2: An entry where `assignment.selection` is `null` is filtered out without throwing
- SC3: An entry where `candidate` is `undefined` is filtered out without throwing
- SC4: A mix of valid and invalid entries returns only the valid items
- SC5: An empty input array returns an empty array
- SC6: All entries malformed returns an empty array (no crash)
- SC7: Missing `assignment.salary` causes `cost` to be computed with `0` (not `NaN`)
- SC8: A `console.warn` is emitted for each skipped entry
- SC9: The returned array passes TypeScript type narrowing as `OvertimeApprovalItem[]`

---

## Technical Design

### Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/approvals.ts` | Contains `parseOvertimeItems` and `RawOvertimeResponse` type |
| `src/hooks/useApprovalItems.ts` | Calls `parseOvertimeItems`; context for how errors propagate |
| `src/lib/__tests__/approvals.test.ts` | Test file to create/extend |

### Files to Create/Modify

| File | Action | Change |
|------|--------|--------|
| `src/lib/approvals.ts` | modify | Optional chaining + null guard + filter in `parseOvertimeItems` |
| `src/lib/__tests__/approvals.test.ts` | create | Add null-guard test cases for `parseOvertimeItems` |

### Implementation: `parseOvertimeItems` (approvals.ts lines 131-153)

Replace the current implementation with:

```typescript
export function parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[] {
  return raw
    .map((entry) => {
      const { overtimeRequest, assignment } = entry

      if (!overtimeRequest) {
        console.warn('[parseOvertimeItems] Skipping entry with missing overtimeRequest')
        return null
      }

      const candidate = assignment?.selection?.marketplaceMember?.application?.candidate

      if (!candidate) {
        console.warn('[parseOvertimeItems] Skipping entry with missing candidate:', overtimeRequest?.id)
        return null
      }

      const hours = overtimeRequest.durationMinutes / 60
      const cost = Math.round(hours * (assignment?.salary ?? 0) * 100) / 100
      const weekStartDate = getWeekStartDate(new Date(overtimeRequest.startDateTime))

      return {
        id: `ot-${overtimeRequest.id}`,
        category: 'OVERTIME' as const,
        overtimeId: overtimeRequest.id,
        userId: candidate.id,
        fullName: candidate.printableName,
        jobTitle: candidate.jobTitle,
        durationMinutes: overtimeRequest.durationMinutes,
        hours: hours.toFixed(1),
        cost,
        description: overtimeRequest.description,
        startDateTime: overtimeRequest.startDateTime,
        weekStartDate,
      }
    })
    .filter((item): item is OvertimeApprovalItem => item !== null)
}
```

### Data Flow

```
Crossover API → RawOvertimeResponse[]
                   │
             parseOvertimeItems()
                   │
             ┌─────┴──────────────────┐
             │                        │
        valid entries           malformed entries
        (candidate exists)      (any null in chain)
             │                        │
      OvertimeApprovalItem       console.warn + null
             │                        │
             └─────────┬──────────────┘
                       │
              .filter(item !== null)
                       │
              OvertimeApprovalItem[]
                       │
              useApprovalItems hook → approvals screen
```

### Edge Cases

| Case | Behavior |
|------|----------|
| `entry.assignment` is undefined | `assignment?.selection` → undefined → candidate null → filtered |
| `assignment.selection` is null | Optional chain short-circuits → candidate null → filtered |
| `assignment.salary` is null | `?? 0` fallback → cost = 0 (not NaN) |
| `overtimeRequest` is null | Early return with warn → filtered |
| Empty input `[]` | `.map()` returns `[]`, `.filter()` returns `[]` |
| All entries malformed | All map to null, filter returns `[]` |

### TypeScript Note

`RawOvertimeResponse` currently types all fields as non-nullable. The implementation uses optional chaining defensively at runtime even though TypeScript's type system would not require it — this is intentional to guard against real API variance that doesn't match the type definition. No type changes needed; the `as const` on `category: 'OVERTIME'` is required for the discriminated union to narrow correctly.

### Test Fixtures

Tests use inline fixtures cast with `as unknown as RawOvertimeResponse`:

```typescript
// Well-formed entry
const wellFormed: RawOvertimeResponse = {
  overtimeRequest: { id: 1, status: 'PENDING', durationMinutes: 60, description: 'Extra work', startDateTime: '2026-04-07T10:00:00Z' },
  assignment: {
    id: 100, salary: 50,
    selection: { marketplaceMember: { application: { candidate: { id: 999, printableName: 'Jane Doe', jobTitle: 'Engineer' } } } }
  }
}

// Missing selection
const missingSelection = {
  overtimeRequest: { id: 2, status: 'PENDING', durationMinutes: 30, description: 'Test', startDateTime: '2026-04-07T10:00:00Z' },
  assignment: { id: 101, salary: 50, selection: null }
} as unknown as RawOvertimeResponse

// Missing candidate
const missingCandidate = {
  overtimeRequest: { id: 3, status: 'PENDING', durationMinutes: 90, description: 'Test', startDateTime: '2026-04-07T10:00:00Z' },
  assignment: { id: 102, salary: 50, selection: { marketplaceMember: { application: { candidate: undefined } } } }
} as unknown as RawOvertimeResponse
```
