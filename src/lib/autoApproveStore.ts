// 1.2 manager auto-approve: the auto_approve_v1 store.
// The manager's per-report rules and the log of what auto-approve did, per owner key
// (`${config.userId}|qa|prod`), so another manager or the other environment never sees
// these rules. One versioned AsyncStorage record holds every owner's, so writing one
// owner's (a toggle on QA) never drops another's (the prod rules). It is the source of
// truth: the runner (src/hooks/useAutoApprove.ts) re-reads it before every run instead of
// trusting the TanStack copy, which the query persister may have restored from an older
// snapshot.
//
// Copies the requestsStore pattern: reads never throw, writes are serialized through a
// module write chain, and the configured owner is checked before and after setItem so a
// write racing sign-out's clearAll() never survives it. setAutoApproveRule rejects when
// the rule was not saved (a toggle the user sees must be the one the runner reads);
// appendAutoApproveLog never rejects.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadConfig } from '../store/config';
import { log } from './log';
import type { AutoApproveLogEntry, AutoApproveOutcome, AutoApproveRule, AutoApproveRules } from './autoApprove';
import type { CrossoverConfig } from '../types/config';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Also listed as a literal in clearAll() (src/store/config.ts), which cannot import this file. */
export const AUTO_APPROVE_STORE_KEY = 'auto_approve_v1';
export const AUTO_APPROVE_STORE_VERSION = 1 as const;
/** Log entries kept, newest first. */
export const AUTO_APPROVE_LOG_CAP = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

/** One owner's rules and log. */
export interface AutoApproveStore {
  version: typeof AUTO_APPROVE_STORE_VERSION;
  /** autoApproveOwnerKey(config) at write time. */
  ownerKey: string;
  rules: AutoApproveRules;
  /** Newest first, at most AUTO_APPROVE_LOG_CAP. */
  log: AutoApproveLogEntry[];
}

/** The AsyncStorage record: every owner's { rules, log }, by owner key (others' kept as read). */
interface StoredRecord {
  version: typeof AUTO_APPROVE_STORE_VERSION;
  owners: Record<string, unknown>;
}

type StoreRead =
  /**
   * The owner's store (empty when the key is absent, corrupt, of an unknown version, or
   * holds nothing for this owner), and every owner's entry as read, to write back.
   */
  | { status: 'ok'; store: AutoApproveStore; owners: Record<string, unknown> }
  /** AsyncStorage.getItem threw: do NOT write. */
  | { status: 'unreadable' };

/** `${userId}|qa` or `${userId}|prod`; null without a config or userId. */
export function autoApproveOwnerKey(
  config: Pick<CrossoverConfig, 'userId' | 'useQA'> | null | undefined,
): string | null {
  if (!config || !config.userId) return null;
  return `${config.userId}|${config.useQA ? 'qa' : 'prod'}`;
}

export function emptyAutoApproveStore(ownerKey: string): AutoApproveStore {
  return { version: AUTO_APPROVE_STORE_VERSION, ownerKey, rules: {}, log: [] };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

const OUTCOMES: readonly AutoApproveOutcome[] = [
  'approved',
  'over_limit',
  'deadline_passed',
  'retrying',
  'failed',
];

function sanitizeRules(value: unknown): AutoApproveRules {
  const rules: AutoApproveRules = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return rules;
  for (const [personId, rule] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rule !== 'object' || rule === null) continue;
    const r = rule as Partial<AutoApproveRule>;
    rules[personId] = { manual: r.manual === true, overtime: r.overtime === true };
  }
  return rules;
}

function isLogEntry(value: unknown): value is AutoApproveLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Partial<AutoApproveLogEntry>;
  return (
    typeof e.id === 'string' &&
    typeof e.personId === 'string' &&
    typeof e.name === 'string' &&
    (e.category === 'MANUAL' || e.category === 'OVERTIME') &&
    typeof e.durationMinutes === 'number' &&
    typeof e.startDateTime === 'string' &&
    typeof e.at === 'string' &&
    OUTCOMES.includes(e.outcome as AutoApproveOutcome)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every owner's entry, by owner key; {} for an absent, corrupt or unknown-version record. */
function parseOwners(raw: string | null): Record<string, unknown> {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!isPlainObject(parsed) || parsed.version !== AUTO_APPROVE_STORE_VERSION) return {};
  if (isPlainObject(parsed.owners)) return parsed.owners;
  // The one-owner record of earlier 1.2 development builds: that owner's entry.
  if (typeof parsed.ownerKey === 'string') return { [parsed.ownerKey]: parsed };
  return {};
}

async function readStore(ownerKey: string): Promise<StoreRead> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(AUTO_APPROVE_STORE_KEY);
  } catch {
    log.warn('approvals.auto_store_read_failed', {});
    return { status: 'unreadable' };
  }
  const owners = parseOwners(raw);
  const own = Object.prototype.hasOwnProperty.call(owners, ownerKey) ? owners[ownerKey] : undefined;
  if (!isPlainObject(own)) return { status: 'ok', store: emptyAutoApproveStore(ownerKey), owners };

  // A malformed rule or entry is dropped, so the rest of the store stays usable.
  const entries = Array.isArray(own.log) ? own.log.filter(isLogEntry) : [];
  return {
    status: 'ok',
    store: {
      version: AUTO_APPROVE_STORE_VERSION,
      ownerKey,
      rules: sanitizeRules(own.rules),
      log: entries.slice(0, AUTO_APPROVE_LOG_CAP),
    },
    owners,
  };
}

/**
 * The store for `ownerKey`. Never throws: anything that is not this owner's entry in a
 * version-1 record (absent, corrupt, only other managers' or environments', unreadable)
 * reads as empty, so auto-approve fails closed.
 */
export async function readAutoApprove(ownerKey: string): Promise<AutoApproveStore> {
  const read = await readStore(ownerKey);
  return read.status === 'ok' ? read.store : emptyAutoApproveStore(ownerKey);
}

// ─── Write ────────────────────────────────────────────────────────────────────

const noop = () => {};
let writeChain: Promise<unknown> = Promise.resolve();

/** Runs `task` after every earlier write has settled; one failed link never blocks the next. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(noop, noop);
  return run;
}

/** True when the configured account is still `ownerKey`. A missing config or a throw is false. */
async function isOwnerConfigured(ownerKey: string): Promise<boolean> {
  try {
    return autoApproveOwnerKey(await loadConfig()) === ownerKey;
  } catch {
    return false;
  }
}

/**
 * The post-write verify: the configured owner key, null when signed out. A throwing config
 * read is re-read once before it counts as signed out (fails closed).
 */
async function configuredOwnerAfterWrite(): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return autoApproveOwnerKey(await loadConfig());
    } catch {
      // re-read once
    }
  }
  return null;
}

type WriteResult = 'written' | 'not_owner' | 'write_failed';

/**
 * Owner pre-check → setItem of `store` with every other owner's entry in `owners` kept →
 * owner verify. A sign-out landed in between removes the key (clearAll() removed every
 * owner's). A switch to another owner in between leaves it: the record still holds that
 * owner's entry, and this one was written while its owner was configured.
 */
async function persist(store: AutoApproveStore, owners: Record<string, unknown>): Promise<WriteResult> {
  if (!(await isOwnerConfigured(store.ownerKey))) return 'not_owner';
  const record: StoredRecord = {
    version: AUTO_APPROVE_STORE_VERSION,
    owners: { ...owners, [store.ownerKey]: { rules: store.rules, log: store.log } },
  };
  try {
    await AsyncStorage.setItem(AUTO_APPROVE_STORE_KEY, JSON.stringify(record));
  } catch {
    log.warn('approvals.auto_store_write_failed', {});
    return 'write_failed';
  }
  const after = await configuredOwnerAfterWrite();
  if (after === store.ownerKey) return 'written';
  if (after === null) {
    try {
      await AsyncStorage.removeItem(AUTO_APPROVE_STORE_KEY);
    } catch {
      log.warn('approvals.auto_store_write_failed', {});
    }
  }
  return 'not_owner';
}

/**
 * Merges `patch` into the report's rule (a missing rule counts as both off; a rule with
 * both off is removed) and writes it. Resolves with the saved store. Rejects when the rule
 * was not saved: the store is unreadable (writing would wipe the other rules), `ownerKey`
 * is not the configured account, or setItem failed.
 */
export function setAutoApproveRule(
  ownerKey: string,
  personId: string,
  patch: Partial<AutoApproveRule>,
): Promise<AutoApproveStore> {
  return serialized(async () => {
    const read = await readStore(ownerKey);
    if (read.status === 'unreadable') throw new Error('Auto-approve settings could not be read');
    const current = read.store;

    const prev = current.rules[personId] ?? { manual: false, overtime: false };
    const nextRule: AutoApproveRule = {
      manual: patch.manual ?? prev.manual,
      overtime: patch.overtime ?? prev.overtime,
    };
    const rules: AutoApproveRules = { ...current.rules };
    if (nextRule.manual || nextRule.overtime) rules[personId] = nextRule;
    else delete rules[personId];

    const next: AutoApproveStore = { ...current, rules };
    const result = await persist(next, read.owners);
    if (result === 'not_owner') throw new Error('Auto-approve settings belong to another account');
    if (result === 'write_failed') throw new Error('Auto-approve settings could not be saved');
    return next;
  });
}

/**
 * Prepends `entries` (given oldest first, as runAutoApprovals returns them) to the log,
 * newest first, capped at AUTO_APPROVE_LOG_CAP. Never rejects. Resolves with the merged
 * store (also when setItem failed, unpersisted), or null when nothing may be written (the
 * store is unreadable, or `ownerKey` is not the configured account).
 */
export function appendAutoApproveLog(
  ownerKey: string,
  entries: AutoApproveLogEntry[],
): Promise<AutoApproveStore | null> {
  return serialized(async () => {
    const read = await readStore(ownerKey);
    if (read.status === 'unreadable') return null;
    const current = read.store;
    if (entries.length === 0) return current;

    const next: AutoApproveStore = {
      ...current,
      log: [...entries].reverse().concat(current.log).slice(0, AUTO_APPROVE_LOG_CAP),
    };
    const result = await persist(next, read.owners);
    return result === 'not_owner' ? null : next;
  }).catch(() => null);
}

/** Removes the store (every owner's). Serialized after pending writes; rejects if removeItem does. */
export function clearAutoApprove(): Promise<void> {
  return serialized(() => AsyncStorage.removeItem(AUTO_APPROVE_STORE_KEY));
}
