// useCardCollapsed — 1.2 home screen: the collapsed flag of a collapsible card
// (WeekBreakdownCard 'payWeek', PayDaysCard 'payDays'; wired in app/(tabs)/index.tsx).
//
// A device-level UI preference, not user data: one AsyncStorage record 'home_cards_v1' =
// { [id]: boolean }. Deliberately NOT in clearAll() (src/store/config.ts) — it survives
// sign-out like any other display preference.
//
// One module-level copy, read once per JS session and shared by every instance, so a
// remount (tab switch) renders the stored state on its first frame. Until the first read
// resolves a card shows its default. Reads never throw: an absent, corrupt or unreadable
// record reads as defaults. Writes are serialized, carry the whole record and wait for the
// read (a toggle made while it is in flight never drops the other card's stored flag); a
// failed write keeps the in-memory state for the rest of the session.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../lib/log';

// ─── Constants ────────────────────────────────────────────────────────────────

export const HOME_CARDS_KEY = 'home_cards_v1';

export type HomeCardId = 'payWeek' | 'payDays';

/** Stored flags by card id; boolean entries of other ids are kept as read. */
type HomeCardPrefs = Record<string, boolean>;

export interface UseCardCollapsedResult {
  collapsed: boolean;
  toggle: () => void;
}

// ─── Module store ─────────────────────────────────────────────────────────────

let prefs: HomeCardPrefs = {};
let readPromise: Promise<void> | null = null;
let writeChain: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The boolean entries of a stored record; {} for an absent or corrupt one. */
function parsePrefs(raw: string | null): HomeCardPrefs {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
  const out: HomeCardPrefs = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === 'boolean') out[id] = value;
  }
  return out;
}

/** Reads the record once per session; resolves after the stored flags are merged in. */
function ensureRead(): Promise<void> {
  if (readPromise === null) {
    readPromise = AsyncStorage.getItem(HOME_CARDS_KEY)
      .then(parsePrefs, () => {
        log.warn('home.card_prefs_read_failed', {});
        return {};
      })
      .then((stored) => {
        // A toggle made while the read was in flight wins over the stored flag
        prefs = { ...stored, ...prefs };
        emit();
      });
  }
  return readPromise;
}

function setCollapsed(id: HomeCardId, collapsed: boolean): void {
  prefs = { ...prefs, [id]: collapsed };
  emit();
  writeChain = writeChain
    .then(ensureRead)
    // The latest record at write time, so queued writes land in order
    .then(() => AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify(prefs)))
    .catch(() => {
      log.warn('home.card_prefs_write_failed', {});
    });
}

/** Test-only: forgets the session's read and in-memory flags. */
export function __resetCardCollapsedForTests(): void {
  prefs = {};
  readPromise = null;
  writeChain = Promise.resolve();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * The card's collapsed flag (`defaultCollapsed` until the stored record has been read, or
 * when it holds nothing for this card) and a toggle that flips and persists it.
 */
export function useCardCollapsed(id: HomeCardId, defaultCollapsed = false): UseCardCollapsedResult {
  useEffect(() => {
    void ensureRead();
  }, []);

  const getSnapshot = useCallback(() => prefs[id], [id]);
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toggle = useCallback(() => {
    // Read the module copy at press time, never a render-time value
    setCollapsed(id, !(prefs[id] ?? defaultCollapsed));
  }, [id, defaultCollapsed]);

  return { collapsed: stored ?? defaultCollapsed, toggle };
}
