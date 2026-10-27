// FR3 (02-requests-store): The my_requests_v1 store
// A versioned, per-assignment, per-day AsyncStorage store: the source of truth for My
// Requests. Every record in it came from a successful server fetch. The TanStack cache
// under ['myRequests', assignmentId] only holds a view built from it (buildRequestsView /
// composeRequestsView).
//
// Reads never throw. Writes are serialized through a module write chain, merge per date,
// prune to REQUESTS_RETENTION_WEEKS, and check the configured owner before and after
// setItem, so a write racing sign-out's clearAll() never survives it. updateRequestsStore
// never rejects.
// durable-data 05-requests-backfill FR2: isOwnerConfigured is exported, so the backfill
// checks the owner before each week's fetch with the store's own rule (C3).
// Cross-spec review: the post-write verify re-reads a throwing config once before it
// fails closed (C7), so a transient read failure does not delete the store.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadConfig } from '../store/config';
import { log } from './log';
import { requestWindows } from './requestsPlanner';
import type { ManualRequestEntry, MyRequestsData } from '../types/requests';

// Defined in the planner (it needs it for retentionStart) to avoid a runtime import cycle (C15).
export { REQUESTS_RETENTION_WEEKS } from './requestsPlanner';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Also listed as a literal in clearAll() (src/store/config.ts), which cannot import this file. */
export const REQUESTS_STORE_KEY = 'my_requests_v1';
export const REQUESTS_STORE_VERSION = 1 as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestsStoreOwner {
  /** CrossoverConfig.assignmentId (the workdiaries `assignmentId` param). */
  assignmentId: string;
  /** CrossoverConfig.useQA. */
  useQA: boolean;
}

export interface StoredRequestDay {
  /** Local YYYY-MM-DD passed as the workdiaries `date` param. */
  date: string;
  /** ISO-8601 time at which that day's fetch fulfilled. */
  fetchedAt: string;
  /** groupSlotsIntoEntries(response, date); [] is a recorded empty day. */
  entries: ManualRequestEntry[];
  /** isDaySettled(date, entries, fetchDay) at write time. */
  settled: boolean;
}

export interface MyRequestsStore {
  version: typeof REQUESTS_STORE_VERSION;
  /** From config at write time. */
  owner: RequestsStoreOwner;
  /** Keyed by StoredRequestDay.date. */
  days: Record<string, StoredRequestDay>;
}

export type RequestsStoreRead =
  | { status: 'ok'; store: MyRequestsStore }
  /** Key absent, corrupt JSON, wrong shape, unknown version, or owner mismatch: safe to overwrite. */
  | { status: 'empty' }
  /** AsyncStorage.getItem threw: do NOT write this run. */
  | { status: 'unreadable' };

// ─── Read ─────────────────────────────────────────────────────────────────────

function isStoreFor(value: unknown, owner: RequestsStoreOwner): value is MyRequestsStore {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<MyRequestsStore>;
  return (
    v.version === REQUESTS_STORE_VERSION &&
    typeof v.days === 'object' && v.days !== null && !Array.isArray(v.days) &&
    typeof v.owner === 'object' && v.owner !== null &&
    v.owner.assignmentId === owner.assignmentId &&
    v.owner.useQA === owner.useQA
  );
}

/** The fields the planner and the view builders read without a guard. */
function isStoredDay(value: unknown): value is StoredRequestDay {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Partial<StoredRequestDay>;
  return (
    typeof d.date === 'string' &&
    typeof d.fetchedAt === 'string' &&
    typeof d.settled === 'boolean' &&
    Array.isArray(d.entries) &&
    d.entries.every((e) => typeof e === 'object' && e !== null)
  );
}

/**
 * Reads the store for `owner`. Never throws. Anything that is not a version-1 store of
 * this owner reads as `empty`; a getItem failure reads as `unreadable`. A malformed day
 * record is dropped (as if never fetched), so the rest of the store stays usable.
 */
export async function readRequestsStore(owner: RequestsStoreOwner): Promise<RequestsStoreRead> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(REQUESTS_STORE_KEY);
  } catch {
    log.warn('requests.store_read_failed', {});
    return { status: 'unreadable' };
  }
  if (raw === null) return { status: 'empty' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'empty' };
  }
  if (!isStoreFor(parsed, owner)) return { status: 'empty' };

  const days: Record<string, StoredRequestDay> = {};
  for (const [date, day] of Object.entries(parsed.days as Record<string, unknown>)) {
    if (isStoredDay(day)) days[date] = day;
  }
  return { status: 'ok', store: { ...parsed, days } };
}

// ─── Write ────────────────────────────────────────────────────────────────────

const noop = () => {};
let writeChain: Promise<unknown> = Promise.resolve();

/** Runs `task` after every earlier write has settled; one failed link never blocks the next (C8). */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(noop, noop);
  return run;
}

function isConfigFor(
  config: Awaited<ReturnType<typeof loadConfig>>,
  owner: RequestsStoreOwner,
): boolean {
  return (
    !!config &&
    config.assignmentId === owner.assignmentId &&
    (config.useQA === true) === owner.useQA
  );
}

/** True when the configured account is still `owner`. A missing config or a throw counts as false (C7). */
export async function isOwnerConfigured(owner: RequestsStoreOwner): Promise<boolean> {
  try {
    return isConfigFor(await loadConfig(), owner);
  } catch {
    return false;
  }
}

/**
 * The post-write verify. A config read that throws is re-read once before failing closed,
 * so one transient AsyncStorage failure cannot delete the whole store of a signed-in user.
 * A definite answer (null, another owner) is final.
 */
async function isOwnerStillConfigured(owner: RequestsStoreOwner): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return isConfigFor(await loadConfig(), owner);
    } catch {
      // re-read once
    }
  }
  return false;
}

async function applyUpdate(
  owner: RequestsStoreOwner,
  fetched: StoredRequestDay[],
  today: string,
): Promise<MyRequestsStore | null> {
  const read = await readRequestsStore(owner);
  if (read.status === 'unreadable') return null;

  const days: Record<string, StoredRequestDay> = read.status === 'ok' ? { ...read.store.days } : {};
  for (const d of fetched) days[d.date] = d;

  const store: MyRequestsStore = {
    version: REQUESTS_STORE_VERSION,
    owner: { assignmentId: owner.assignmentId, useQA: owner.useQA },
    days: pruneDays(days, today),
  };

  // Signed out (or switched account/environment) mid-refresh: do not re-create the key.
  if (!(await isOwnerConfigured(owner))) return null;

  try {
    await AsyncStorage.setItem(REQUESTS_STORE_KEY, JSON.stringify(store));
  } catch {
    log.warn('requests.store_write_failed', {});
    return store;
  }

  // clearAll() may have landed between the pre-check and setItem: the write must not outlive it.
  if (!(await isOwnerStillConfigured(owner))) {
    try {
      await AsyncStorage.removeItem(REQUESTS_STORE_KEY);
    } catch {
      log.warn('requests.store_write_failed', {});
    }
    return null;
  }
  return store;
}

/**
 * Merges the fetched days into the store (a fetched day replaces that whole date), prunes
 * it to the retention window, and writes it if `owner` is still the configured account.
 *
 * Returns the merged store, or null when nothing may be written (the store is unreadable,
 * or the owner is not configured before or after the write). If setItem throws, the merged
 * store is returned but not persisted. Serialized with every other update; never rejects.
 */
export function updateRequestsStore(
  owner: RequestsStoreOwner,
  fetched: StoredRequestDay[],
  today: string,
): Promise<MyRequestsStore | null> {
  return serialized(() => applyUpdate(owner, fetched, today));
}

// ─── Retention and view ───────────────────────────────────────────────────────

/** Drops every day before retentionStart. Does not mutate `days`. */
export function pruneDays(
  days: Record<string, StoredRequestDay>,
  today: string,
): Record<string, StoredRequestDay> {
  const { retentionStart } = requestWindows(today);
  const kept: Record<string, StoredRequestDay> = {};
  for (const date of Object.keys(days)) {
    if (date >= retentionStart) kept[date] = days[date];
  }
  return kept;
}

/** Newest date first. Array.prototype.sort is stable, so equal dates keep their order. */
function byDateDesc(a: ManualRequestEntry, b: ManualRequestEntry): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * The entries of the days in retentionStart..today, newest date first, each day keeping
 * its in-day order. `updatedAt` is the latest fetchedAt among the days in
 * catchUpStart..today (a backfilled older day does not count), or null.
 */
export function buildRequestsView(
  days: Record<string, StoredRequestDay>,
  today: string,
): { entries: ManualRequestEntry[]; updatedAt: string | null } {
  const { catchUpStart, retentionStart } = requestWindows(today);
  const dates = Object.keys(days)
    .filter((date) => date >= retentionStart && date <= today)
    .sort()
    .reverse();

  const entries: ManualRequestEntry[] = [];
  let updatedAt: string | null = null;
  let updatedMs = -Infinity;
  for (const date of dates) {
    const day = days[date];
    entries.push(...day.entries);
    const fetchedMs = Date.parse(day.fetchedAt);
    if (date >= catchUpStart && fetchedMs > updatedMs) {
      updatedMs = fetchedMs;
      updatedAt = day.fetchedAt;
    }
  }
  return { entries, updatedAt };
}

/**
 * buildRequestsView's entries plus view-only carry-forward: prior entries whose date has
 * no stored record (not even an empty one) and is not older than retentionStart. Never
 * writes them to `days`. The caller passes `prior` only for the same owner or a legacy view.
 */
export function composeRequestsView(
  days: Record<string, StoredRequestDay>,
  today: string,
  prior: MyRequestsData | undefined,
): ManualRequestEntry[] {
  const { retentionStart } = requestWindows(today);
  const carried = prior?.entries.filter((e) => !days[e.date] && e.date >= retentionStart) ?? [];
  return [...buildRequestsView(days, today).entries, ...carried].sort(byDateDesc);
}
