# Widget Information-Design Spec

**Status:** Reference (governs widget-vnext task #5 — re-introducing widget visuals)
**Created:** 2026-06-04
**Owner:** @jaime-alvarez-trilogy

The rulebook for what data each widget surface shows, at what density, and why. Born from the lesson that the first widget-vnext redesign **failed by cramming 14 features into one widget** (hero buried, clipped text, mismatched rings). This spec exists so density is a **budget**, not a free-for-all. Implement **one surface at a time, with an on-device look after each**.

## The principle

Every surface answers one question in under 3 seconds: **"Where does my week stand?"**

- **Hours is always the hero** (the single biggest element). For managers it's still their *own* hours; the pending count is a **swap-in on the lowest slot**, never a competing hero.
- **Pace is carried by color at zero text cost** — panel gradient on home, fill-ring on lock. It never spends a text row.
- **Earnings is the clear tier-2** answer.
- **Swap, never stack.** When a persona changes priority (manager has a queue), replace the lowest-tier element — do not add a row.
- **11pt readable floor.** Nothing below 11pt except text inside a filled pill/capsule (reads as a colored token, not body text).
- **Spend reclaimed space on breathing room before another datum.** "Airy and large beats complete and tiny."
- **Color is locked to meaning:** gold = money only, statusColor = pace only, cyan = AI only, violet = BrainLift only. All collapse on the monochrome lock screen → lock surfaces separate by position + dividers, never hue.

## Shared spacing + type system

| Token / Role | Value | Use |
|---|---|---|
| pad-card | 16 | Canonical card/edge padding (small, large edges) |
| pad-medium | 14 | Medium outer padding |
| pad-inner | 12 | Inside any glass card |
| pad-bottom-large | 20 | Large bottom edge (deeper for chart axis) |
| gap-zone | 8 / 10 / 12 | Between major zones — small 8, med 10, large 12 |
| gap-card | 10 / 12 | Between side-by-side cards |
| gap-label-value | 4 | Label → value inside a card |
| gap-value-delta | 2 | Value → its hugging delta chip |
| gap-bars | 6 | Between 7-day chart bars |
| **Hero (hours)** | 26–30 bold rounded, text1 `#E0E0E0` | small 30 · med 26 · large 28 · lock-circ 18 |
| **Value (tier-2)** | 17–22 bold rounded, gold `#E8C97A` for earnings | small 17 · med 20 · large 22 · lock-rect 14 |
| **Label / caption** | 11 medium, text2 `#A0A0A0`, all-caps | "THIS WEEK", "EARNED", axis letters |
| **Delta chip** | 11 semibold, success `#10B981` (+) / critical `#F43F5E` (−) | hugs hero numbers; **free** (doesn't count against budget) |
| **Pace pill** | 10–11 semibold statusColor, inside Capsule fill statusColor@~18% | the only sub-11 text allowed (it's a token) |
| **Status / footer** | 11–12, text2 (critical bold when urgent) | "7.5h left", "AI 73% · BL 3.2h/5h" |
| **Readable floor** | **11pt** | hard floor for all body/data text |
| Type roles | max 2 (Display-rounded numbers + Inter labels) | never >3 number tiers |

## Per-surface mapping

### systemSmall (usable ~123×123pt · pad 16 · spacing 8)
Contributor: pace gradient (free) · "THIS WEEK" 11 · hours 30 hero · earnings 17 gold · pace pill 11.
```
 THIS WEEK
 32.5h            ← 30pt hero, gradient tint = pace
 (spacer)
 $1,300           ← 17pt gold
 ( ON TRACK )     ← 11pt pill, statusColor@18% fill
```
Manager (pending>0): SWAP pace pill → `! 3 to approve` (11pt bold critical); gradient = critical when EOW.

### systemMedium (usable ~301×127pt · pad 14 · spacing 10 · cards pad 12)
Contributor: hero hours 26 + weekDeltaHours chip · earnings 20 gold + weekDeltaEarnings chip · pace pill 10 + faint glow · status token 11.
```
 +---------------------------+  +-------------------------+
 | THIS WEEK                 |  | EARNED                  |
 |  32.5h    +2.1h           |  | $1,300   +$84           |
 +---------------------------+  +-------------------------+
 ( ON TRACK )                              7.5h left
```
Manager (EOW-urgent): SWAP status token + pill → `( ! 2 PENDING )` ... `! Due in 6h` (critical).

### systemLarge (usable ~306×318pt · pad top16/sides16/bottom20 · spacing 12)
Contributor: hero row (h80) → status line (h18) → 7-day bars (h56, today bar = pace hue, past = dusty-blue, future muted, axis 11pt) → footer 12 (AI cyan · BL violet). ~60pt slack = airy.
```
 THIS WEEK 32.5h +2.1h    EARNED $1,300 +$84
 [ ON TRACK ]                       7.5h left
   ▆   ▃   █   ▁   ▄   ▂   _
   M   T   W   T   F   S   S
 AI 73%  ·  BL 3.2h/5h
```
Manager (pending>0): SWAP chart+footer → "PENDING APPROVALS (3)" header + up to **3** rows (name 13 / hours 13 / category 10); own status to bottom.

### Lock accessories (monochrome — no hue, separate by position)
- **accessoryCircular** (~58pt safe square): hours 18 bold + "WK" 11 inside a concentric-Circle fill-ring (frame-fraction = week pace; no `.trim`/arc available).
- **accessoryRectangular** (~172×76pt): line1 `32.5h · $1,300` (14 bold / 14 semibold); line2 `7.5h left` (12) — manager: `3 to approve`. AI cut.
- **accessoryInline** (~16 chars): `⧖ 32.5h · 7.5h left` — manager: `⧖ 32.5h · 3 to approve`. Earnings + AI cut.

## The cut list (what is NOT shown where — value-per-pixel)

- **AI%** — cut from small/medium/all-lock (its `71%–75%` range is the longest token and truncates inline; collapses to no color on lock). Survives only on large footer (12pt). A single "73%" is rejected (false precision; discards the range).
- **BrainLift** — cut from small/medium/lock (weekly-cadence metric, meaningless without its `/5h` target which costs width). Survives only on large footer.
- **weekDelta hours/earnings** — zero deltas on small. Medium + large show both as **chips hugging their parent number** (high-ROI, computed but previously unrendered).
- **todayDelta / today** — cut everywhere (daily delta on a week-framed widget = near-duplicate low-value signed text).
- **Mid-week running deadline** ("Due in 5d 11h") — cut as default (low-urgency noise 6/7 days). Use actionable "7.5h left". Re-appears as critical red only when `isEOWUrgent` (<24h); on small the gradient alone carries it.
- **approvalItems / myRequests rows** — cut from small/medium (managers get the COUNT as the swap token). Approval list only on large-manager (≤3 rows). myRequests → tap-through only.
- **Color coding on lock** — cut entirely (monochrome). Separate by position + "·".
- **Green past chart bars** — cut (green is a status color; painting completed days green falsely implies per-day "on track"). Past = dusty-blue; statusColor only on today's bar.
- **Large AI/BL card row + "ACTIVITY" caption + 9pt axis** — cut; AI/BL appear once in the 12pt footer; axis = 11pt single letters; chart self-explains.

## The guardrail — real-estate budget

Hard ceiling of **readable elements (≥11pt)**, excluding the zero-cost gradient/ring and hugging delta chips:

| Surface | Max readable elements | Composition |
|---|---|---|
| systemSmall | **3** | hero + earnings + pace pill |
| systemMedium | **5** | hero + earnings + pace + 1 status token (+2 delta chips, free) |
| systemLarge | hero block + **1** secondary visual + **1** footer | never all three stacked; manager swaps chart→approval list (≤3) |
| accessoryCircular | 1 number + 1 label | + fill-ring (free) |
| accessoryRectangular | 2–3 short lines | line1 ≤2 values |
| accessoryInline | ~16 chars | exactly 2 values + divider |

**Decision order (apply in sequence):**
1. Does it answer "where does the week stand / where is it heading"? Hero (hours) + pace always win; earnings next.
2. Can it ride at ZERO row cost (gradient / fill-ring / hugging chip)? If yes, it doesn't count — prefer this.
3. Readable at ≥11pt in the space left? If not, it doesn't ship here — push to a larger surface or a tap-through.
4. Does the persona change priority? **SWAP the lowest-tier element, never STACK.**
5. Slot still free? Spend it on breathing room first. Add a datum only if it survives 1–3 **and** is a confirmed priority.

**Failure mode to prevent:** four equal-weight 10pt rows (pill + AI + deadline + BrainLift) that bury the hero and break the floor. The structural fix: pace → gradient/ring, deltas → hug their numbers, AI/BL → only where a readable footer exists, manager → swap not stack.
