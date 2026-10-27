// 1.2 manager auto-approve: hand actions vs the runner, per owner key, for this session.
//
// The runner (src/hooks/useAutoApprove.ts) plans a run up front and works through it one
// call at a time, while the queue (src/hooks/useApprovalItems.ts) still lists those items.
// So a request the manager approves or rejects by hand is never auto-approved afterwards
// this session, whatever the hand call's outcome (a failed reject must not turn into an
// approval), and one the runner has claimed for its run cannot be approved or rejected by
// hand until that run ends. Each check is made in the same synchronous step as its mark,
// so neither side can act between the other's check and mark. No React, no storage.

const handByOwner = new Map<string, Set<string>>();
const autoByOwner = new Map<string, Set<string>>();

function idsFor(map: Map<string, Set<string>>, ownerKey: string): Set<string> {
  let ids = map.get(ownerKey);
  if (!ids) {
    ids = new Set();
    map.set(ownerKey, ids);
  }
  return ids;
}

/** Records a hand approve / reject of `id`. False, recording nothing, while a run has claimed it. */
export function claimForHand(ownerKey: string, id: string): boolean {
  if (autoByOwner.get(ownerKey)?.has(id)) return false;
  idsFor(handByOwner, ownerKey).add(id);
  return true;
}

/** Claims `id` for the current run. False when the manager acted on it by hand this session. */
export function claimForAuto(ownerKey: string, id: string): boolean {
  if (handByOwner.get(ownerKey)?.has(id)) return false;
  idsFor(autoByOwner, ownerKey).add(id);
  return true;
}

/** Ends the run's claims on `ids`. */
export function releaseAuto(ownerKey: string, ids: Iterable<string>): void {
  const claimed = autoByOwner.get(ownerKey);
  if (!claimed) return;
  for (const id of ids) claimed.delete(id);
}

/** The ids approved or rejected by hand this session (never to be planned). */
export function handledByHand(ownerKey: string): ReadonlySet<string> {
  return idsFor(handByOwner, ownerKey);
}

/** @internal — test hook. */
export function __resetAutoApproveClaims(): void {
  handByOwner.clear();
  autoByOwner.clear();
}
