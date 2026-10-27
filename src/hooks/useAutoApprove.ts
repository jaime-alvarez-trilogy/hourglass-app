// 1.2 manager auto-approve: settings, direct reports and the runner.
//
// Crossover has no server-side auto-approve, so Hourglass approves on the manager's behalf
// whenever the app holds fresh approvals data: app open, foreground, pull-to-refresh and
// the existing polling all refetch ['approvals'], and the runner (mounted once in
// app/(tabs)/_layout.tsx) reacts to each fetch. It cannot run in the background.
//
// What to approve is decided by src/lib/autoApprove.ts; the rules and the log live in the
// owner-scoped auto_approve_v1 store (src/lib/autoApproveStore.ts), which the runner
// re-reads before every run and again before each item. A manual request is planned only
// once its owner is proven from the work diary (src/lib/manualOwnership.ts): the runner
// reads the diaries of the reports whose Manual time toggle is on, and caches the answers
// per owner key for the session (useManualOwners shares them); a failed read is made again
// only AUTO_APPROVE_RETRY_MS later. In the manager preview (devManagerView on a
// non-manager account) nothing reaches the API: mock manual requests resolve by the mock
// roster's userId, approvals are simulated, logged with simulated: true, and removed from
// the ['approvals'] data.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { hashKey, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey, QueryState } from '@tanstack/react-query';
import { useConfig } from './useConfig';
import { buildTeamRosterQueryFn, teamRosterQueryKey } from './useTeamRoster';
import { APPROVALS_KEY } from './useApprovalItems';
import { loadConfig, loadCredentials } from '../store/config';
import { getAuthToken } from '../api/client';
import { toAuthCreds } from '../api/authCreds';
import { approveManual, approveOvertime } from '../api/approvals';
import { fetchWorkDiary } from '../api/workDiary';
import { classifyApproveError, directReports, planAutoApprovals } from '../lib/autoApprove';
import type {
  AutoApproveLogEntry,
  AutoApproveOutcome,
  AutoApprovePlanItem,
  AutoApproveRule,
  AutoApproveRules,
} from '../lib/autoApprove';
import {
  appendAutoApproveLog,
  autoApproveOwnerKey,
  readAutoApprove,
  setAutoApproveRule,
} from '../lib/autoApproveStore';
import type { AutoApproveStore } from '../lib/autoApproveStore';
import {
  __resetAutoApproveClaims,
  claimForAuto,
  handledByHand,
  releaseAuto,
} from '../lib/autoApproveClaims';
import {
  cachedManualOwner,
  nameMatchedFirst,
  resolveManualOwners,
} from '../lib/manualOwnership';
import type { ManualOwners, ManualSlotIds, OwnershipCache } from '../lib/manualOwnership';
import { MOCK_TEAM_ROSTER } from '../lib/devMock';
import { log } from '../lib/log';
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem } from '../lib/approvals';
import type { TeamMember } from '../types/api';
import type { Credentials, CrossoverConfig } from '../types/config';

export const AUTO_APPROVE_KEY = ['autoApprove'] as const;

// useTeamRoster's staleTime: useDirectReports shares that cache entry.
const ROSTER_STALE_MS = 24 * 60 * 60 * 1000;

const NO_RULES: AutoApproveRules = {};
const NO_ENTRIES: AutoApproveLogEntry[] = [];
const NO_REPORTS: TeamMember[] = [];
const NO_IDS: ReadonlySet<string> = new Set();
const NO_OWNERS: ManualOwners = new Map();
const NO_ANSWERS: OwnershipCache = new Map();

/** An item logged 'retrying' (its approve call hit an outage) is retried on a fetch at least this much later. */
export const AUTO_APPROVE_RETRY_MS = 5 * 60 * 1000;

// ─── Mode ─────────────────────────────────────────────────────────────────────

/** 'real' for a manager, 'simulated' for the manager preview (runnerMode is null for everyone else). */
export type RunnerMode = 'real' | 'simulated';

function runnerMode(config: CrossoverConfig | null | undefined): RunnerMode | null {
  if (config?.isManager === true) return 'real';
  if (config?.devManagerView === true) return 'simulated';
  return null;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function useAutoApproveQuery() {
  const { config, isLoading: configLoading } = useConfig();
  const ownerKey = autoApproveOwnerKey(config);
  const query = useQuery<AutoApproveStore>({
    queryKey: [...AUTO_APPROVE_KEY, ownerKey],
    queryFn: () => readAutoApprove(ownerKey as string),
    enabled: ownerKey !== null,
    // Re-read the store on mount: the persisted query copy may predate the last write.
    staleTime: 0,
    retry: false, // readAutoApprove never throws
  });
  return { config, configLoading, ownerKey, query };
}

/**
 * The signed-in account's per-report rules and the auto-approve log, from the
 * owner-scoped store. setRule saves the rule, then puts the saved store in the query data
 * so the runner reacts at once. It rejects when the rule was not saved (show an error and
 * keep the old toggle state).
 */
export function useAutoApproveSettings(): {
  ownerKey: string | null;
  rules: AutoApproveRules;
  log: AutoApproveLogEntry[];
  isLoading: boolean;
  setRule: (personId: string, patch: Partial<AutoApproveRule>) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { configLoading, ownerKey, query } = useAutoApproveQuery();

  const setRule = useCallback(
    async (personId: string, patch: Partial<AutoApproveRule>): Promise<void> => {
      if (!ownerKey) throw new Error('Not configured');
      const saved = await setAutoApproveRule(ownerKey, personId, patch);
      const key = [...AUTO_APPROVE_KEY, ownerKey];
      // A re-read that started before the write must not land on top of it.
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData(key, saved);
    },
    [ownerKey, queryClient],
  );

  return {
    ownerKey,
    rules: query.data?.rules ?? NO_RULES,
    log: query.data?.log ?? NO_ENTRIES,
    isLoading: configLoading || query.isLoading,
    setRule,
  };
}

// ─── Direct reports ───────────────────────────────────────────────────────────

interface DirectReportsState {
  reports: TeamMember[];
  /** Every roster row, before directReports() drops repeats (for overtime matching). */
  roster: TeamMember[];
  isLoading: boolean;
  error: string | null;
  /** The roster loaded successfully (never while loading or after an error). */
  ready: boolean;
}

function useDirectReportsState(): DirectReportsState {
  const { config, isLoading: configLoading } = useConfig();
  const mode = runnerMode(config);

  // useTeamRoster's query (same key, queryFn and staleTime), but only enabled for a real
  // manager: the runner is mounted for every account, and contributors and the preview's
  // non-manager account have no managed assignments to fetch. The key's version segment
  // keeps a roster cached by an earlier build (cut off at 10 rows per team, rows without
  // userId) from ever being read here.
  const { data, isLoading, error, status } = useQuery({
    queryKey: teamRosterQueryKey(config),
    queryFn: buildTeamRosterQueryFn(config),
    enabled: mode === 'real',
    staleTime: ROSTER_STALE_MS,
    retry: 1,
  });

  const selfCandidateId = config?.userId;
  const reports = useMemo(() => {
    if (mode === 'simulated') return MOCK_TEAM_ROSTER;
    if (mode === 'real' && data) return directReports(data, selfCandidateId);
    return NO_REPORTS;
  }, [mode, data, selfCandidateId]);

  if (mode === 'simulated') {
    return { reports, roster: MOCK_TEAM_ROSTER, isLoading: false, error: null, ready: true };
  }
  if (mode === 'real') {
    return {
      reports,
      roster: data ?? NO_REPORTS,
      isLoading: configLoading || isLoading,
      error: error ? (error as Error).message : null,
      ready: status === 'success',
    };
  }
  return {
    reports: NO_REPORTS,
    roster: NO_REPORTS,
    isLoading: configLoading,
    error: null,
    ready: false,
  };
}

/**
 * The manager's direct reports (useTeamRoster's roster through directReports(), without
 * the manager themself), sorted by name, and the roster rows they came from (pass both to
 * memberForItem / pendingCountsByMember to match items as the runner does).
 * MOCK_TEAM_ROSTER in the manager preview; [] for contributors, who never fetch the roster.
 */
export function useDirectReports(): {
  reports: TeamMember[];
  roster: TeamMember[];
  isLoading: boolean;
  error: string | null;
} {
  const { reports, roster, isLoading, error } = useDirectReportsState();
  return { reports, roster, isLoading, error };
}

// ─── Manual ownership ─────────────────────────────────────────────────────────

/**
 * Per owner key: the work-diary ownership answers (src/lib/manualOwnership.ts), shared by
 * the runner and useManualOwners. Dropped for every other owner when the runner sees a new
 * one, and by __resetAutoApproveSession.
 */
const ownershipByOwner = new Map<string, OwnershipCache>();

/**
 * Per owner key: `${assignmentId}|${utcDate}` → earliest retry, for a diary read that
 * failed. Until then that read is not made again (it fails at once), so an assignment whose
 * diary always fails is read once per AUTO_APPROVE_RETRY_MS, not on every approvals fetch.
 * Dropped with the ownership answers.
 */
const diaryRetryAtByOwner = new Map<string, Map<string, number>>();

function ownershipCacheFor(ownerKey: string): OwnershipCache {
  let cache = ownershipByOwner.get(ownerKey);
  if (!cache) {
    cache = new Map();
    ownershipByOwner.set(ownerKey, cache);
  }
  return cache;
}

function diaryRetryAtFor(ownerKey: string): Map<string, number> {
  let retryAt = diaryRetryAtByOwner.get(ownerKey);
  if (!retryAt) {
    retryAt = new Map();
    diaryRetryAtByOwner.set(ownerKey, retryAt);
  }
  return retryAt;
}

/** Whether the (assignment, UTC date) diary read may be made now: not waiting out a failure. */
function diaryReadable(ownerKey: string, now: number) {
  const retryAt = diaryRetryAtByOwner.get(ownerKey);
  return (assignmentId: string, utcDate: string) =>
    (retryAt?.get(`${assignmentId}|${utcDate}`) ?? 0) <= now;
}

function isManualItem(item: ApprovalItem): item is ManualApprovalItem {
  return item.category === 'MANUAL';
}

/** The MANUAL items worth proving: not skipped, with timecardIds (the planner needs them). */
function manualItemsToProve(items: ApprovalItem[], skipIds: ReadonlySet<string>): ManualApprovalItem[] {
  return items.filter(
    (item): item is ManualApprovalItem =>
      isManualItem(item) &&
      !skipIds.has(item.id) &&
      Array.isArray(item.timecardIds) &&
      item.timecardIds.length > 0,
  );
}

/**
 * Every roster row of the people in `userIds`, each assignment once: the roster's rows (a
 * report's second team included), then the reports' own (for a cycle input without a
 * roster).
 */
function rowsOf(userIds: ReadonlySet<string>, reports: TeamMember[], roster: TeamMember[]): TeamMember[] {
  const rows: TeamMember[] = [];
  const seen = new Set<string>();
  for (const row of [...roster, ...reports]) {
    if (row.userId == null || !userIds.has(row.userId) || seen.has(row.assignmentId)) continue;
    seen.add(row.assignmentId);
    rows.push(row);
  }
  return rows;
}

function userIdsOf(reports: TeamMember[], include: (personId: string) => boolean = () => true) {
  const ids = new Set<string>();
  for (const member of reports) if (member.userId != null && include(member.userId)) ids.add(member.userId);
  return ids;
}

/** The runner's candidates: every roster row of the reports whose Manual time toggle is on. */
function manualCandidateRows(
  reports: TeamMember[],
  roster: TeamMember[],
  rules: AutoApproveRules,
): TeamMember[] {
  const on = userIdsOf(
    reports,
    (personId) => Object.prototype.hasOwnProperty.call(rules, personId) && rules[personId]?.manual === true,
  );
  return on.size === 0 ? NO_REPORTS : rowsOf(on, reports, roster);
}

/**
 * MANAGER PREVIEW ONLY: MOCK_TEAM_ITEMS carry MOCK_TEAM_ROSTER's userId, so a mock item's
 * owner is the mock report with that userId. No network. Never used for real data: a real
 * pending item's userId is not a roster id (src/lib/manualOwnership.ts).
 */
function previewManualOwners(items: ApprovalItem[], reports: TeamMember[], roster: TeamMember[]): ManualOwners {
  const rows = rowsOf(userIdsOf(reports), reports, roster);
  const owners = new Map<string, TeamMember | null>();
  for (const item of items) {
    if (!isManualItem(item)) continue;
    const matches = rows.filter((row) => Number(row.userId) === item.userId);
    owners.set(item.id, matches.length === 1 ? matches[0] : null);
  }
  return owners;
}

/**
 * An assignment's manual slot ids on one UTC date, from fetchWorkDiary (the report's
 * assignmentId and the date, with no timeZoneId: live QA 2026-10-27, the request was on its
 * UTC date that way, and with Vancouver's timeZoneId the same day returned none of the
 * slots; manualOwnership.ts also reads the day either side before a "not theirs"). It
 * shares fetchWorkDiary's app-wide limiter and in-flight dedupe. Only slots with
 * autoTracker false and a numeric id count. A failed read is not made again for
 * AUTO_APPROVE_RETRY_MS (diaryRetryAtByOwner): until then it fails at once.
 */
function diaryManualSlotIds(ownerKey: string, credentials: Credentials, useQA: boolean): ManualSlotIds {
  const retryAt = diaryRetryAtFor(ownerKey);
  return async (assignmentId, utcDate) => {
    const key = `${assignmentId}|${utcDate}`;
    if ((retryAt.get(key) ?? 0) > Date.now()) throw new Error('Work diary read failed recently');
    try {
      const slots = await fetchWorkDiary(assignmentId, utcDate, credentials, useQA);
      // Not an array: unknown, so it is never cached as "not theirs".
      if (!Array.isArray(slots)) throw new Error('Unexpected work diary response');
      retryAt.delete(key);
      const ids = new Set<number>();
      for (const slot of slots) {
        if (slot.autoTracker === false && typeof slot.id === 'number') ids.add(slot.id);
      }
      return ids;
    } catch (err) {
      retryAt.set(key, Date.now() + AUTO_APPROVE_RETRY_MS);
      throw err;
    }
  };
}

/**
 * The runner's pre-check, without fetching: the manual owners the ownership cache already
 * proves for `items`, and whether some item still has an unchecked candidate (a run would
 * read that diary; one whose read failed is retried this way on a later fetch, once its
 * AUTO_APPROVE_RETRY_MS has passed).
 */
function knownManualOwners(
  mode: RunnerMode,
  ownerKey: string,
  items: ApprovalItem[],
  reports: TeamMember[],
  roster: TeamMember[],
  rules: AutoApproveRules,
  skipIds: ReadonlySet<string>,
): { owners: ManualOwners; unchecked: boolean } {
  const manual = manualItemsToProve(items, skipIds);
  if (mode === 'simulated') {
    return { owners: previewManualOwners(manual, reports, roster), unchecked: false };
  }
  const candidates = manualCandidateRows(reports, roster, rules);
  const cache = ownershipByOwner.get(ownerKey) ?? NO_ANSWERS;
  const readable = diaryReadable(ownerKey, Date.now());
  const owners = new Map<string, TeamMember | null>();
  let unchecked = false;
  for (const item of manual) {
    const owner = cachedManualOwner(item, nameMatchedFirst(item, candidates), cache, readable);
    if (owner === undefined) unchecked = true;
    else owners.set(item.id, owner);
  }
  return { owners, unchecked };
}

/**
 * The proven owner of each pending MANUAL item in `items` (pass useDirectReports' reports
 * and roster), for the Direct reports screen's pending counts and confirm copy
 * (pendingCountsByMember), by the runner's work-diary proof. The candidates are every
 * roster row of every report, name-matched rows first (the search stops at the first
 * proof), so each count is what the runner proves once that report's toggle is on. An item
 * fetched for another owner (itemsForOwner) stays unresolved and is not counted, as is one
 * whose owner a failed read leaves unknown. It shares the runner's ownership cache: what
 * either has proved is not read again this session. MANAGER PREVIEW: the mock items
 * resolve by the mock roster's userId, with no network. Empty for anyone else.
 * isLoading: a resolution for these items is in flight (the first, or one for new ids
 * while the last answers stay on screen): counts may still rise. settled: every item's
 * owner is known (proven, or proven nobody's), so the counts are final; false while
 * loading and after a failed read.
 */
export function useManualOwners(
  items: ApprovalItem[],
  reports: TeamMember[],
  roster: TeamMember[],
): { owners: ManualOwners; isLoading: boolean; settled: boolean } {
  const { config } = useConfig();
  const mode = runnerMode(config);
  const ownerKey = autoApproveOwnerKey(config);
  const useQA = config?.useQA === true;
  const manual = useMemo(() => items.filter(isManualItem), [items]);
  // As the runner: a fetch that landed after a switch is never read against this owner's diaries.
  const owned = useMemo(() => manual.filter((item) => item.fetchedFor === ownerKey), [manual, ownerKey]);
  const ids = useMemo(() => owned.map((item) => item.id).sort(), [owned]);

  const query = useQuery({
    queryKey: [...AUTO_APPROVE_KEY, 'owners', ownerKey, ids],
    queryFn: async (): Promise<[string, TeamMember | null][]> => {
      const credentials = await loadCredentials();
      if (!credentials || !ownerKey) return [];
      const rows = rowsOf(userIdsOf(reports), reports, roster);
      const candidatesFor = (item: ManualApprovalItem) => nameMatchedFirst(item, rows);
      const cache = ownershipCacheFor(ownerKey);
      await resolveManualOwners(owned, candidatesFor, diaryManualSlotIds(ownerKey, credentials, useQA), cache);
      // The cached answers (this resolution's, and any the runner proved meanwhile), as
      // entries, not a Map: query data is persisted as JSON. An item a failed read left
      // unknown is left out (not settled), rather than given as nobody's.
      const entries: [string, TeamMember | null][] = [];
      for (const item of owned) {
        const owner = cachedManualOwner(item, candidatesFor(item), cache);
        if (owner !== undefined) entries.push([item.id, owner]);
      }
      return entries;
    },
    enabled: mode === 'real' && ownerKey !== null && ids.length > 0 && reports.length > 0,
    staleTime: 0,
    retry: false, // a failed diary read is an unresolved item, never a throw
    // While new ids resolve, the last answers (same owner only) keep their counts on screen.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === ownerKey ? previous : undefined,
  });

  const data = query.data;
  const proven = useMemo(() => (data ? new Map(data) : NO_OWNERS), [data]);
  const preview = useMemo(
    () => (mode === 'simulated' ? previewManualOwners(manual, reports, roster) : NO_OWNERS),
    [mode, manual, reports, roster],
  );

  if (mode === 'simulated') return { owners: preview, isLoading: false, settled: true };
  if (mode === 'real') {
    // Placeholder data is the previous ids' answers: the new ones are still being proved.
    const isLoading = query.isLoading || query.isPlaceholderData;
    return { owners: proven, isLoading, settled: !isLoading && ids.every((id) => proven.has(id)) };
  }
  return { owners: NO_OWNERS, isLoading: false, settled: true };
}

// ─── Runner: execution ────────────────────────────────────────────────────────

export interface AutoApproveDeps {
  approveManual: (item: ManualApprovalItem, allowOvertime: boolean) => Promise<void>;
  approveOvertime: (item: OvertimeApprovalItem) => Promise<void>;
  now: () => Date;
  /** Log every item as approved without calling approveManual / approveOvertime. */
  simulated: boolean;
  /**
   * Called before each item: the item as the current rules plan it (allowOvertime may
   * have changed), null to skip it (its toggle was turned off, or it was approved or
   * rejected by hand), or 'stop' to end the run
   * (signed out, or another account / environment / role). Without it every item runs
   * as planned.
   */
  recheck?: (planned: AutoApprovePlanItem) => Promise<AutoApprovePlanItem | null | 'stop'>;
}

/**
 * Approves the plan one item at a time, in order, each as deps.recheck re-plans it.
 * Each failure is classified (classifyApproveError), never thrown. Returns one entry per
 * attempted item (skipped and stopped ones have none), in attempt order.
 */
export async function runAutoApprovals(
  plan: AutoApprovePlanItem[],
  deps: AutoApproveDeps,
): Promise<AutoApproveLogEntry[]> {
  // Aliased: the creds guard (src/__tests__/api/creds-wiring.test.ts) matches calls by
  // name, and these are the injected closures, not the API wrappers.
  const { approveManual: approveManualItem, approveOvertime: approveOvertimeItem } = deps;
  const entries: AutoApproveLogEntry[] = [];

  for (const planned of plan) {
    const current = deps.recheck ? await deps.recheck(planned) : planned;
    if (current === 'stop') break;
    if (current === null) continue;
    const { item, member, allowOvertime } = current;
    let outcome: AutoApproveOutcome = 'approved';
    if (!deps.simulated) {
      try {
        if (item.category === 'MANUAL') await approveManualItem(item, allowOvertime);
        else await approveOvertimeItem(item);
      } catch (err) {
        outcome = classifyApproveError(err);
      }
    }
    entries.push({
      id: item.id,
      personId: member.userId ?? '', // planAutoApprovals only plans members with a userId
      name: member.name,
      category: item.category,
      durationMinutes: item.durationMinutes,
      startDateTime: item.startDateTime,
      at: deps.now().toISOString(),
      outcome,
      ...(deps.simulated ? { simulated: true } : {}),
    });
  }
  return entries;
}

const SIMULATED_DEPS: AutoApproveDeps = {
  approveManual: async () => {},
  approveOvertime: async () => {},
  now: () => new Date(),
  simulated: true,
};

// ─── Runner: session state (module level) ─────────────────────────────────────

/** Data fetched before this (restored from the persisted cache) never triggers a run. */
const SESSION_STARTED_AT = Date.now();

let runInFlight = false;
const lockReleasedListeners = new Set<() => void>();
/**
 * Per owner key: every item id attempted this session that the server answered for
 * (any outcome but 'retrying'), or simulated. Not retried until the next launch.
 */
const attemptedByOwner = new Map<string, Set<string>>();
/** Per owner key: item id → earliest retry, for an item whose last attempt was 'retrying'. */
const retryAtByOwner = new Map<string, Map<string, number>>();
/** Per owner key: preview items simulated as approved (kept out of the mock queue). */
const simulatedByOwner = new Map<string, Set<string>>();

/**
 * The owner key the runner last saw, with the ['approvals'] and roster dataUpdateCount at
 * that moment. Neither query key carries the owner (the roster's carries only the
 * environment), so after a switch (QA ↔ prod, or another account) they can still hold the
 * previous owner's data, 'success' and fetched this session, until their refetch lands:
 * only data updated since may run. The session's first owner has no baseline (-1): any
 * data counts, and so does any data of a query created since (a count below its baseline).
 */
let ownerSeen: { ownerKey: string; approvals: number; roster: number } | null = null;

function idsFor(map: Map<string, Set<string>>, ownerKey: string): Set<string> {
  let ids = map.get(ownerKey);
  if (!ids) {
    ids = new Set();
    map.set(ownerKey, ids);
  }
  return ids;
}

function retryAtFor(ownerKey: string): Map<string, number> {
  let retryAt = retryAtByOwner.get(ownerKey);
  if (!retryAt) {
    retryAt = new Map();
    retryAtByOwner.set(ownerKey, retryAt);
  }
  return retryAt;
}

/**
 * The ids not to plan at `now`: attempted this session, approved or rejected by hand this
 * session (src/lib/autoApproveClaims.ts), or an outage retry not yet due.
 */
function skipIdsFor(ownerKey: string, now: number): Set<string> {
  const skip = new Set(idsFor(attemptedByOwner, ownerKey));
  for (const id of handledByHand(ownerKey)) skip.add(id);
  for (const [id, at] of retryAtFor(ownerKey)) if (at > now) skip.add(id);
  return skip;
}

/**
 * The items fetched for `ownerKey` (fetchAllApprovalItems stamps each with the owner whose
 * config it used). A fetch that started before a sign-in or QA/prod switch can land after
 * it; its items carry the old owner and are never planned. Unstamped items (a copy from an
 * older build) fail closed.
 */
export function itemsForOwner(items: ApprovalItem[], ownerKey: string): ApprovalItem[] {
  return items.filter((item) => item.fetchedFor === ownerKey);
}

/**
 * Records `ownerKey` as seen (with the current counts when it replaces another owner), and
 * drops every other owner's ownership answers and diary retry times.
 */
function noteOwner(ownerKey: string, approvalsCount: number, rosterCount: number) {
  if (ownerSeen?.ownerKey !== ownerKey) {
    for (const map of [ownershipByOwner, diaryRetryAtByOwner]) {
      for (const key of [...map.keys()]) if (key !== ownerKey) map.delete(key);
    }
    ownerSeen = ownerSeen
      ? { ownerKey, approvals: approvalsCount, roster: rosterCount }
      : { ownerKey, approvals: -1, roster: -1 };
  } else if (approvalsCount < ownerSeen.approvals || rosterCount < ownerSeen.roster) {
    // A count below its baseline is a query created since (sign-out's queryClient.clear()
    // and the same owner back, or another roster key), so all of its data is newer. Kept,
    // the old baseline would hold auto-approve off until the new count passed it.
    ownerSeen = {
      ownerKey,
      approvals: approvalsCount < ownerSeen.approvals ? -1 : ownerSeen.approvals,
      roster: rosterCount < ownerSeen.roster ? -1 : ownerSeen.roster,
    };
  }
  return ownerSeen;
}

/**
 * @internal — test hook. Resets the lock, the session skip sets, the ownership answers, the
 * diary retry times and the last owner seen.
 */
export function __resetAutoApproveSession(): void {
  runInFlight = false;
  lockReleasedListeners.clear();
  attemptedByOwner.clear();
  retryAtByOwner.clear();
  simulatedByOwner.clear();
  ownershipByOwner.clear();
  diaryRetryAtByOwner.clear();
  ownerSeen = null;
  __resetAutoApproveClaims();
}

function removeApprovalItems(queryClient: QueryClient, ids: ReadonlySet<string>): void {
  queryClient.setQueryData<ApprovalItem[]>(APPROVALS_KEY, (old) =>
    old ? old.filter((i) => !ids.has(i.id)) : old,
  );
}

function countOutcomes(entries: AutoApproveLogEntry[]) {
  const count = (o: AutoApproveOutcome) => entries.filter((e) => e.outcome === o).length;
  // `pastDeadline`, not `deadlinePassed`: redact() drops any key containing "pass".
  return {
    approved: count('approved'),
    overLimit: count('over_limit'),
    pastDeadline: count('deadline_passed'),
    retrying: count('retrying'),
    failed: count('failed'),
  };
}

export interface AutoApproveCycleInput {
  mode: RunnerMode;
  ownerKey: string;
  items: ApprovalItem[];
  reports: TeamMember[];
  /** Every roster row, before directReports() drops repeats (overtime matching, manual candidates). */
  roster?: TeamMember[];
  queryClient: QueryClient;
}

/** The configured account is still `ownerKey`, in `mode`. */
function isRunnerOwner(config: CrossoverConfig, ownerKey: string, mode: RunnerMode): boolean {
  return autoApproveOwnerKey(config) === ownerKey && runnerMode(config) === mode;
}

async function executeCycle({
  mode,
  ownerKey,
  items,
  reports,
  roster = NO_REPORTS,
  queryClient,
}: AutoApproveCycleInput): Promise<AutoApproveLogEntry[]> {
  // Signed out, or switched account / environment / role since the render that asked.
  const config = await loadConfig();
  if (!config || !isRunnerOwner(config, ownerKey, mode)) return [];

  // The store is the source of truth, not the (possibly restored) query copy.
  const { rules, log: storedLog } = await readAutoApprove(ownerKey);
  const attempted = idsFor(attemptedByOwner, ownerKey);
  if (mode === 'simulated') {
    // The mock queue is the same on every launch: what an earlier session approved in the
    // preview stays approved (as it would on the server) instead of being approved again.
    const removed = idsFor(simulatedByOwner, ownerKey);
    for (const e of storedLog) {
      if (e.simulated === true && e.outcome === 'approved') {
        attempted.add(e.id);
        removed.add(e.id);
      }
    }
    if (items.some((i) => removed.has(i.id))) removeApprovalItems(queryClient, removed);
  }
  const owned = itemsForOwner(items, ownerKey);
  const skipIds = skipIdsFor(ownerKey, Date.now());

  // A MANUAL item is planned only for its proven owner. In the preview the mock items
  // resolve by the mock roster's userId (no network). For a manager each is proven from
  // the work diaries of the reports whose Manual time toggle is on, name-matched rows read
  // first (ordering only); answers are cached per owner key, failures are not.
  const manual = manualItemsToProve(owned, skipIds);
  let credentials: Credentials | null = null;
  let manualOwners: ManualOwners = NO_OWNERS;
  if (mode === 'simulated') {
    manualOwners = previewManualOwners(manual, reports, roster);
  } else {
    const candidates = manualCandidateRows(reports, roster, rules);
    if (manual.length > 0 && candidates.length > 0) {
      credentials = await loadCredentials();
      if (!credentials) return [];
      manualOwners = await resolveManualOwners(
        manual,
        (item) => nameMatchedFirst(item, candidates),
        diaryManualSlotIds(ownerKey, credentials, config.useQA),
        ownershipCacheFor(ownerKey),
      );
    }
  }

  const plan = planAutoApprovals(owned, reports, rules, skipIds, roster, manualOwners);
  if (plan.length === 0) return [];

  // The plan and the token are taken up front, so each item is planned again from the
  // stored config and rules right before its call, with the owners proved above (no new
  // diary reads): a toggle turned off mid-run skips what it covered, an item the manager
  // approved or rejected by hand meanwhile is skipped, and a sign-out or switch ends the run.
  type Rechecked = AutoApprovePlanItem | null | 'stop';
  const recheck = async (planned: AutoApprovePlanItem): Promise<Rechecked> => {
    try {
      const current = await loadConfig();
      if (!current || !isRunnerOwner(current, ownerKey, mode)) return 'stop';
      const latest = await readAutoApprove(ownerKey);
      const replanned = planAutoApprovals(
        [planned.item],
        reports,
        latest.rules,
        NO_IDS,
        roster,
        manualOwners,
      )[0];
      // Claimed in the same step as the hand-action check, so from here to the end of the
      // run a hand approve / reject of this item is refused instead of racing the call.
      return replanned && claimForAuto(ownerKey, planned.item.id) ? replanned : null;
    } catch {
      return 'stop';
    }
  };

  let deps: AutoApproveDeps = { ...SIMULATED_DEPS, recheck };
  if (mode === 'real') {
    credentials = credentials ?? (await loadCredentials());
    if (!credentials) return [];
    // As useApprovalItems.approveItem. A throw here aborts before any item is attempted,
    // so the next fetch tries again.
    const token = await getAuthToken(credentials.username, credentials.password, config.useQA);
    const creds = toAuthCreds(credentials, config.useQA);
    const { useQA, userId } = config;
    deps = {
      approveManual: (item, allowOvertime) =>
        approveManual(token, useQA, userId, item.timecardIds, allowOvertime, creds),
      approveOvertime: (item) => approveOvertime(token, useQA, item.overtimeId, creds),
      now: () => new Date(),
      simulated: false,
      recheck,
    };
  }

  // Marked before the first call, so no other run plans them meanwhile. Afterwards an
  // item stays marked (not retried until the next launch, a simulated approval never
  // repeats) only when it was attempted and the server answered: a skipped or stopped
  // item is unmarked, and a 'retrying' one (an outage: classifyApproveError) is tried
  // again on a fetch AUTO_APPROVE_RETRY_MS later or more.
  for (const { item } of plan) attempted.add(item.id);
  let entries: AutoApproveLogEntry[];
  try {
    entries = await runAutoApprovals(plan, deps);
  } finally {
    releaseAuto(ownerKey, plan.map(({ item }) => item.id));
  }
  const tried = new Set(entries.map((e) => e.id));
  const retrying = new Set(entries.filter((e) => e.outcome === 'retrying').map((e) => e.id));
  const retryAt = retryAtFor(ownerKey);
  for (const { item } of plan) {
    if (retrying.has(item.id)) retryAt.set(item.id, Date.now() + AUTO_APPROVE_RETRY_MS);
    else retryAt.delete(item.id);
    if (!tried.has(item.id) || retrying.has(item.id)) attempted.delete(item.id);
  }
  const counts = countOutcomes(entries);
  log.info('approvals.auto_run', { ...counts, simulated: deps.simulated });

  const saved = await appendAutoApproveLog(ownerKey, entries);
  if (saved) queryClient.setQueryData([...AUTO_APPROVE_KEY, ownerKey], saved);

  if (deps.simulated) {
    const removed = idsFor(simulatedByOwner, ownerKey);
    for (const e of entries) if (e.outcome === 'approved') removed.add(e.id);
    removeApprovalItems(queryClient, removed);
  } else if (counts.approved > 0) {
    // Show server truth (the approvals, and anything new that arrived meanwhile).
    void queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
  }
  return entries;
}

/**
 * One locked run: re-checks the owner, re-reads the rules, plans, approves, logs. Returns
 * null when another run holds the lock, else the entries (possibly []). Never throws.
 * @internal — exported for tests; the app runs it through useAutoApproveRunner.
 */
export async function runAutoApproveCycle(
  input: AutoApproveCycleInput,
): Promise<AutoApproveLogEntry[] | null> {
  if (runInFlight) return null;
  runInFlight = true;
  try {
    return await executeCycle(input);
  } catch (err) {
    log.error('approvals.auto_run_failed', err instanceof Error ? err : 'Error');
    return [];
  } finally {
    runInFlight = false;
    for (const listener of [...lockReleasedListeners]) listener();
  }
}

// ─── Runner: hook ─────────────────────────────────────────────────────────────

/**
 * A query's state (['approvals'], the roster), read from the cache without becoming an
 * observer, so the runner never changes that query's fetch options or triggers a fetch
 * of its own.
 */
function useCachedQueryState<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): QueryState<T> | undefined {
  const queryHash = hashKey(queryKey);
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.query.queryHash === queryHash) onChange();
      }),
    [queryClient, queryHash],
  );
  const getSnapshot = useCallback(
    () => queryClient.getQueryCache().get<T>(queryHash)?.state,
    [queryClient, queryHash],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Auto-approves pending items for the reports whose toggles are on. Mount once (app/(tabs)/
 * _layout.tsx). Runs only for a manager (real approvals) or in the manager preview
 * (simulated), once the direct-reports roster and the rules have loaded, on approvals data
 * fetched this session and, like the roster, updated since the current owner key was
 * first seen (never the previous environment's or account's), and only when the plan is
 * non-empty or a manual request still has a diary to read (its owner is proven in the run;
 * a read that failed counts again once AUTO_APPROVE_RETRY_MS has passed).
 * A module-level lock prevents overlapping runs; a run asked for meanwhile happens when the
 * lock is released.
 */
export function useAutoApproveRunner(): { lastRun: AutoApproveLogEntry[]; running: boolean } {
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const mode = runnerMode(config);
  const roster = useDirectReportsState();
  const { ownerKey, query: settings } = useAutoApproveQuery();
  const approvals = useCachedQueryState<ApprovalItem[]>(queryClient, APPROVALS_KEY);
  const rosterState = useCachedQueryState<TeamMember[]>(queryClient, teamRosterQueryKey(config));
  const seen = ownerKey
    ? noteOwner(ownerKey, approvals?.dataUpdateCount ?? 0, rosterState?.dataUpdateCount ?? 0)
    : null;

  const [lastRun, setLastRun] = useState<AutoApproveLogEntry[]>(NO_ENTRIES);
  const [running, setRunning] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const rerunRequested = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const onRelease = () => {
      if (!rerunRequested.current || !mounted.current) return;
      rerunRequested.current = false;
      setRecheck((n) => n + 1);
    };
    lockReleasedListeners.add(onRelease);
    return () => {
      mounted.current = false;
      lockReleasedListeners.delete(onRelease);
    };
  }, []);

  const rules = settings.status === 'success' ? settings.data.rules : undefined;
  const fetchedAt = approvals?.status === 'success' ? approvals.dataUpdatedAt : 0;
  const forOwner = seen !== null && (approvals?.dataUpdateCount ?? 0) > seen.approvals;
  const items = fetchedAt >= SESSION_STARTED_AT && forOwner ? approvals?.data : undefined;
  // A roster fetched for the previous owner can map the new owner's ids to other people.
  const rosterForOwner =
    mode === 'simulated' || (seen !== null && (rosterState?.dataUpdateCount ?? 0) > seen.roster);

  useEffect(() => {
    if (!mode || !ownerKey || !roster.ready || !rosterForOwner || !rules || !items) return;

    if (mode === 'simulated') {
      // The mock queue comes back on every refetch: keep simulated approvals out of it.
      const removed = idsFor(simulatedByOwner, ownerKey);
      if (items.some((i) => removed.has(i.id))) {
        removeApprovalItems(queryClient, removed);
        return;
      }
    }

    // Cheap pre-check on the query copy (the run re-reads the store before approving), with
    // the manual owners already proved: a manual item with an unchecked candidate runs, as
    // its diary is read in the run.
    const skip = skipIdsFor(ownerKey, Date.now());
    const owned = itemsForOwner(items, ownerKey);
    const known = knownManualOwners(mode, ownerKey, owned, roster.reports, roster.roster, rules, skip);
    const plan = planAutoApprovals(owned, roster.reports, rules, skip, roster.roster, known.owners);
    if (plan.length === 0 && !known.unchecked) return;
    if (runInFlight) {
      rerunRequested.current = true;
      return;
    }

    setRunning(true);
    const { reports, roster: rows } = roster;
    void runAutoApproveCycle({ mode, ownerKey, items, reports, roster: rows, queryClient }).then(
      (entries) => {
        if (!mounted.current) return;
        setRunning(false);
        if (entries === null) rerunRequested.current = true; // lost the lock: retry on release
        else if (entries.length > 0) setLastRun(entries);
      },
    );
  }, [
    mode,
    ownerKey,
    roster.ready,
    roster.reports,
    roster.roster,
    rosterForOwner,
    rules,
    items,
    fetchedAt,
    recheck,
    queryClient,
  ]);

  return { lastRun, running };
}
