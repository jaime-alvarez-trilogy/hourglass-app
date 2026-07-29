# Spec 02 — Help / FAQ screen

**Status:** Research complete
**Complexity:** S
**Blocks:** — (independent)

## Problem context

There is no self-serve help surface anywhere in the app. A confused user (why doesn't my AI% match what I expect? what's BrainLift? how do I add the widget? why do my hours differ from the Crossover web app?) has no in-app answer and must contact the developer directly — a support burden that scales badly and a UX gap that scales badly the other direction (silent confusion, no support contact at all, is worse).

The app already has real, validated answers to some of the most likely questions baked into its own logic and memory — e.g. the AI% formula validated to <1.3% error (`memory/MEMORY.md` "AI% Formula"), the Mon-Sun local-timezone week boundary, the manual-time/logbook explanation. This content already exists conceptually; it just isn't user-facing.

## Exploration findings

- No `help`, `faq`, or similar screen/route exists anywhere under `app/`.
- `app/modal.tsx` is the Settings surface (reached via a modal route) — the natural place to add a "Help" entry point, following the same list-item pattern already used for "Share log"/"Clear log" (`app/modal.tsx:239-252`).
- Likely FAQ topics, informed by real, previously-surfaced confusion points (from memory and the app's own domain complexity):
  - "Why doesn't my AI% match what I expect?" (formula, tagging behavior)
  - "What is BrainLift?" (second_brain tag, 5h/week target)
  - "How do I add the widget to my home/lock screen?"
  - "Why do my hours look different here than on the Crossover website?" (timezone/week-boundary differences — Mon-Sun local vs. payments API's Mon-Sun UTC, a real documented discrepancy per `memory/MEMORY.md` Bug Lessons)
  - "Is my Crossover password stored anywhere besides my device?" (reinforces the trust messaging from spec 01)
- This is static content — no API calls, no dynamic data — so it's a pure content/UI spec, lower risk than most.

## Key decisions

**1. Static Q&A array + simple list/accordion screen, not a searchable help center.** Matches the FEATURE.md's explicit out-of-scope note ("a searchable/full-text help center... is premature"). A single scrollable screen with expand/collapse per question (or just all-expanded, given the low question count — 5-8 items) is enough.

**2. New route: a Settings-reachable screen (e.g. `app/help.tsx`, pushed from the Settings modal), not a modal-within-modal.** Follows the same navigation pattern as other Settings-adjacent screens — needs confirming during spec-writing whether the existing Settings modal is itself the root or a `Stack.Screen` that could receive a child push.

**3. Content authored by hand, cross-checked against `memory/MEMORY.md`'s already-validated formulas** (AI% formula, week boundary) so the FAQ doesn't contradict what the app's own code actually does — a wrong FAQ answer is worse than no FAQ.

**4. No feedback/rating mechanism on FAQ entries** ("was this helpful?") — out of scope, adds complexity disproportionate to a first version.

## Interface contracts

```typescript
// src/lib/faq.ts (new)
export interface FaqEntry {
  question: string;
  answer: string;
}
export const FAQ_ENTRIES: FaqEntry[];

// app/help.tsx (new)
// Renders FAQ_ENTRIES as a scrollable list, each with an expand/collapse or always-expanded answer.
```

## Test plan

- [ ] Help screen renders all `FAQ_ENTRIES` questions.
- [ ] Tapping a question reveals/toggles its answer (if accordion-style chosen) — or all answers visible by default (if flat-list style chosen; decide at spec time).
- [ ] Settings modal has a "Help" entry that navigates to the help screen.
- [ ] FAQ content doesn't reference any dynamic/user-specific data (purely static strings) — a content-accuracy check, not a runtime assertion.

## Files to reference

| File | Why |
|---|---|
| `app/modal.tsx:239-252` | Existing Settings list-item pattern to mirror for a new "Help" entry point. |
| `memory/MEMORY.md` ("AI% Formula", "Bug Lessons" re: payments-API week-boundary mismatch) | Source of truth for FAQ answers that touch calculation/timezone behavior — must not contradict this. |
| `hourglassws/docs/ARCHITECTURE.md` §5 | Screens/navigation conventions for adding a new route. |

## Verification tiers

| Tier | Applies? | How |
|---|---|---|
| Unit (Jest) | ✓ | Render + navigation tests |
| Live-QA probe | ✗ | No API involved — purely static content |
| TestFlight | ✓ | Legibility/scroll check on-device, confirm Settings entry point works |
| Error log | ✗ | N/A |
