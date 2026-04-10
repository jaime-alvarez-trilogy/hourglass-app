# Spec Research: Approvals Safety

**Date:** 2026-04-09
**Author:** @jaime-alvarez-trilogy
**Spec:** `07-approvals-safety`

---

## Problem Context

**Issue #10 — parseOvertimeItems crashes on malformed API response**: In `src/lib/approvals.ts`, `parseOvertimeItems` destructures each overtime entry and immediately accesses a 5-level deep chain without null guards:

```typescript
const candidate = assignment.selection.marketplaceMember.application.candidate
```

If the Crossover API returns an overtime entry where any intermediate level is `null` or `undefined` (partial data, API changes, edge-case accounts), this throws:
```
TypeError: Cannot read properties of undefined (reading 'marketplaceMember')
```

This would crash the approvals screen for any manager who has even one malformed overtime entry in their queue.

---

## Exploration Findings

### The full `parseOvertimeItems` function (approvals.ts lines 131-153)

```typescript
export function parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[] {
  return raw.map((entry) => {
    const { overtimeRequest, assignment } = entry
    const candidate = assignment.selection.marketplaceMember.application.candidate
    const hours = overtimeRequest.durationMinutes / 60
    const cost = Math.round(hours * assignment.salary * 100) / 100
    const weekStartDate = getWeekStartDate(new Date(overtimeRequest.startDateTime))
    return {
      id: `ot-${overtimeRequest.id}`,
      category: 'OVERTIME',
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
}
```

### Access chain vulnerability

5 levels: `assignment.selection.marketplaceMember.application.candidate`

Any of these can fail:
- `assignment` undefined if `entry` is malformed
- `assignment.selection` undefined if API omits this field  
- `.marketplaceMember` undefined (optional field in some assignment types)
- `.application` undefined (pending applications may lack this)
- `.candidate` undefined (the final target)

### Existing Patterns

| Pattern | Used In | Notes |
|---------|---------|-------|
| Optional chaining `?.` | Various utility functions | Standard TypeScript pattern |
| `.filter(Boolean)` after map | Some array processing | Removes null entries |
| Guard with early return | Most hook functions | Standard approach |

### Key Files

| File | Relevance |
|------|-----------|
| `src/lib/approvals.ts` | `parseOvertimeItems` and the deep access chain |
| `src/hooks/useApprovalItems.ts` | Calls `parseOvertimeItems`; renders in approval list |

### Integration Points

- `parseOvertimeItems` is called in `useApprovalItems.ts` when processing the overtime API response
- Result is merged with manual approval items and rendered in `approvals.tsx`
- If `parseOvertimeItems` throws, `useApprovalItems` query errors and the whole approvals screen breaks

---

## Key Decisions

### Decision 1: How to handle items with missing candidate data

**Options considered:**
1. Optional chaining throughout + filter null results: `assignment?.selection?.marketplaceMember?.application?.candidate` → filter out items where candidate is null
2. Try/catch per item: wrap each map iteration in try/catch, skip items that throw
3. Return partial item with placeholder values for missing fields

**Chosen:** Option 1 — optional chaining + filter null candidates

**Rationale:** Optional chaining is the idiomatic TypeScript approach. Filtering is cleaner than try/catch. A partial item with placeholder values could confuse managers. Better to skip a malformed entry and show the rest correctly than to crash or show garbage data.

### Decision 2: Log or silently drop

**Options considered:**
1. Silently drop malformed items — clean but hard to debug
2. Log a console.warn for dropped items — keeps UI clean, allows debugging

**Chosen:** Option 2 — `console.warn` for each dropped item

**Rationale:** Malformed overtime data is unexpected; a warning helps with debugging without affecting the user experience.

---

## Interface Contracts

### Modified `parseOvertimeItems`

```typescript
export function parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[] {
  return raw
    .map((entry) => {
      const { overtimeRequest, assignment } = entry;
      const candidate = assignment?.selection?.marketplaceMember?.application?.candidate;

      if (!candidate) {
        console.warn('[parseOvertimeItems] Skipping entry with missing candidate:', overtimeRequest?.id);
        return null;
      }

      const hours = overtimeRequest.durationMinutes / 60;
      const cost = Math.round(hours * (assignment?.salary ?? 0) * 100) / 100;
      const weekStartDate = getWeekStartDate(new Date(overtimeRequest.startDateTime));

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
      };
    })
    .filter((item): item is OvertimeApprovalItem => item !== null);
}
```

### Source Tracing

| Field | Source |
|-------|--------|
| `candidate` | `assignment?.selection?.marketplaceMember?.application?.candidate` |
| `userId` | `candidate.id` (after null guard) |
| `fullName` | `candidate.printableName` |
| `jobTitle` | `candidate.jobTitle` |
| `cost` | `overtimeRequest.durationMinutes / 60 * (assignment?.salary ?? 0)` |

---

## Test Plan

### `parseOvertimeItems`

**Signature:** `parseOvertimeItems(raw: RawOvertimeResponse[]): OvertimeApprovalItem[]`

**Happy Path:**
- Well-formed entry with full candidate chain → returns OvertimeApprovalItem
- Multiple entries all well-formed → returns all items

**Error Cases:**
- Entry where `assignment.selection` is null → item filtered out, no crash
- Entry where `candidate` is undefined → item filtered out, no crash
- Mix of valid and invalid entries → valid items returned, invalid filtered

**Edge Cases:**
- Empty array → returns empty array
- All entries malformed → returns empty array (no crash)
- `assignment.salary` missing → `cost` uses 0 (fallback)

**Mocks Needed:**
- Raw API response fixtures with various levels of null data

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/approvals.ts` | modify | Optional chaining + filter null candidates in `parseOvertimeItems` |
| `src/lib/__tests__/approvals.test.ts` | modify or create | Add null-guard test cases |

---

## Edge Cases to Handle

1. **`overtimeRequest` itself is null** — add a guard for `!overtimeRequest` as well, return null early
2. **`assignment.salary` null** — use `?? 0` fallback already included in the proposed fix
3. **TypeScript types** — `RawOvertimeResponse` types should already allow null/undefined at each level if they come from the API; if the types are strict, use `as any` or update the type to reflect reality. Don't tighten types without verifying against real API responses.

---

## Open Questions

None remaining.
