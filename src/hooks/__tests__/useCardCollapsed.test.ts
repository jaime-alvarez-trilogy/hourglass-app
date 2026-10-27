// Tests: useCardCollapsed — 1.2 home screen, collapsible PAY WEEK / PAY DAYS cards
// File: src/hooks/useCardCollapsed.ts
//
//   default before the read resolves (and defaultCollapsed), stored flags loaded, toggle
//   updates at once and persists the whole record, the module copy survives a remount
//   (first frame already right, one read per session), corrupt / non-object / unreadable
//   records read as defaults, a failed write keeps the in-memory state, a toggle made while
//   the read is in flight wins and keeps the other card's stored flag, not in clearAll()
//
// Rendered with react-test-renderer through a probe component (as in useAutoApprove.test.ts).
// AsyncStorage is the in-memory __mocks__ store; log is mocked to observe the warnings.

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as fs from 'fs';
import * as path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  HOME_CARDS_KEY,
  __resetCardCollapsedForTests,
  useCardCollapsed,
  type HomeCardId,
  type UseCardCollapsedResult,
} from '../useCardCollapsed';
import { log } from '../../lib/log';

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Every update below is wrapped in act(); tell React so it does not warn about the environment
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage> & { _reset: () => void };
const mockWarn = log.warn as jest.Mock;

const CONFIG_STORE_FILE = path.resolve(__dirname, '../../store/config.ts');

// ─── Probe ────────────────────────────────────────────────────────────────────

interface Probe {
  tree: ReactTestRenderer;
  /** Every render's result, in order */
  renders: UseCardCollapsedResult[];
  latest: () => UseCardCollapsedResult;
}

function mount(id: HomeCardId, defaultCollapsed?: boolean): Probe {
  const renders: UseCardCollapsedResult[] = [];
  function Component(): null {
    renders.push(useCardCollapsed(id, defaultCollapsed));
    return null;
  }
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = create(React.createElement(Component));
  });
  return { tree: tree!, renders, latest: () => renders[renders.length - 1] };
}

/** Lets the read / write promise chains settle. */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function stored(): unknown {
  const calls = MockAsyncStorage.setItem.mock.calls.filter(([key]) => key === HOME_CARDS_KEY);
  const last = calls[calls.length - 1];
  return last ? JSON.parse(last[1] as string) : undefined;
}

/** getItem that stays pending until the returned resolver runs. */
function holdRead(): (raw: string | null) => void {
  let release: (raw: string | null) => void = () => {};
  MockAsyncStorage.getItem.mockImplementationOnce(
    () => new Promise<string | null>((resolve) => {
      release = resolve;
    }),
  );
  return (raw) => release(raw);
}

beforeEach(() => {
  MockAsyncStorage._reset();
  __resetCardCollapsedForTests();
  mockWarn.mockClear();
});

// ─── Defaults and load ────────────────────────────────────────────────────────

describe('useCardCollapsed — before and after the read', () => {
  it('uses the default until the read resolves', async () => {
    const release = holdRead();
    const probe = mount('payWeek');
    expect(probe.latest().collapsed).toBe(false);

    release(JSON.stringify({ payWeek: true }));
    await flush();
    expect(probe.latest().collapsed).toBe(true);
  });

  it('honours defaultCollapsed while nothing is stored', async () => {
    const probe = mount('payDays', true);
    expect(probe.latest().collapsed).toBe(true);
    await flush();
    expect(probe.latest().collapsed).toBe(true);
  });

  it('loads the stored flag for its own id only', async () => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payDays: true }));
    const week = mount('payWeek');
    const days = mount('payDays');
    await flush();
    expect(week.latest().collapsed).toBe(false);
    expect(days.latest().collapsed).toBe(true);
  });

  it('a stored false beats defaultCollapsed', async () => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payWeek: false }));
    const probe = mount('payWeek', true);
    await flush();
    expect(probe.latest().collapsed).toBe(false);
  });

  it('reads the record once per session', async () => {
    mount('payWeek');
    mount('payDays');
    await flush();
    expect(MockAsyncStorage.getItem).toHaveBeenCalledTimes(1);
    expect(MockAsyncStorage.getItem).toHaveBeenCalledWith(HOME_CARDS_KEY);
  });
});

// ─── Toggle ───────────────────────────────────────────────────────────────────

describe('useCardCollapsed — toggle', () => {
  it('flips at once and persists the record', async () => {
    const probe = mount('payWeek');
    await flush();

    act(() => probe.latest().toggle());
    expect(probe.latest().collapsed).toBe(true);
    await flush();
    expect(stored()).toEqual({ payWeek: true });

    act(() => probe.latest().toggle());
    expect(probe.latest().collapsed).toBe(false);
    await flush();
    expect(stored()).toEqual({ payWeek: false });
  });

  it('keeps the other card’s flag in the record', async () => {
    const week = mount('payWeek');
    const days = mount('payDays');
    await flush();

    act(() => week.latest().toggle());
    act(() => days.latest().toggle());
    await flush();
    expect(stored()).toEqual({ payWeek: true, payDays: true });
    expect(week.latest().collapsed).toBe(true);
    expect(days.latest().collapsed).toBe(true);
  });

  it('flips from defaultCollapsed when nothing is stored', async () => {
    const probe = mount('payDays', true);
    await flush();
    act(() => probe.latest().toggle());
    expect(probe.latest().collapsed).toBe(false);
    await flush();
    expect(stored()).toEqual({ payDays: false });
  });

  it('a toggle while the read is in flight wins and keeps the other stored flag', async () => {
    const release = holdRead();
    const probe = mount('payWeek');
    act(() => probe.latest().toggle());
    expect(probe.latest().collapsed).toBe(true);
    expect(MockAsyncStorage.setItem).not.toHaveBeenCalled();

    release(JSON.stringify({ payWeek: false, payDays: true }));
    await flush();
    expect(probe.latest().collapsed).toBe(true);
    expect(stored()).toEqual({ payWeek: true, payDays: true });
  });
});

// ─── Module copy ──────────────────────────────────────────────────────────────

describe('useCardCollapsed — module copy', () => {
  it('a remount renders the stored state on its first frame', async () => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payWeek: true }));
    const first = mount('payWeek');
    await flush();
    expect(first.latest().collapsed).toBe(true);
    act(() => first.tree.unmount());

    const again = mount('payWeek');
    expect(again.renders[0].collapsed).toBe(true);
    expect(MockAsyncStorage.getItem).toHaveBeenCalledTimes(1);
  });

  it('a toggle survives a remount without a re-read', async () => {
    const first = mount('payDays');
    await flush();
    act(() => first.latest().toggle());
    act(() => first.tree.unmount());

    // Even if storage now disagreed, the session copy wins
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payDays: false }));
    const again = mount('payDays');
    await flush();
    expect(again.renders[0].collapsed).toBe(true);
    expect(again.latest().collapsed).toBe(true);
  });
});

// ─── Bad records and failures ─────────────────────────────────────────────────

describe('useCardCollapsed — bad records and failures', () => {
  it.each([
    ['corrupt JSON', '{not json'],
    ['an array', '[true]'],
    ['a number', '42'],
    ['null', 'null'],
  ])('%s reads as defaults', async (_label, raw) => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, raw);
    const week = mount('payWeek');
    const days = mount('payDays', true);
    await flush();
    expect(week.latest().collapsed).toBe(false);
    expect(days.latest().collapsed).toBe(true);
  });

  it('ignores non-boolean entries', async () => {
    await AsyncStorage.setItem(HOME_CARDS_KEY, JSON.stringify({ payWeek: 'yes', payDays: 1 }));
    const week = mount('payWeek');
    const days = mount('payDays');
    await flush();
    expect(week.latest().collapsed).toBe(false);
    expect(days.latest().collapsed).toBe(false);
  });

  it('an unreadable record reads as defaults and is logged', async () => {
    MockAsyncStorage.getItem.mockRejectedValueOnce(new Error('disk'));
    const probe = mount('payWeek');
    await flush();
    expect(probe.latest().collapsed).toBe(false);
    expect(mockWarn).toHaveBeenCalledWith('home.card_prefs_read_failed', {});

    act(() => probe.latest().toggle());
    await flush();
    expect(stored()).toEqual({ payWeek: true });
  });

  it('a failed write keeps the in-memory state, and later writes still run', async () => {
    const probe = mount('payWeek');
    await flush();

    MockAsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
    act(() => probe.latest().toggle());
    await flush();
    expect(probe.latest().collapsed).toBe(true);
    expect(mockWarn).toHaveBeenCalledWith('home.card_prefs_write_failed', {});

    // A remount still sees the session copy
    act(() => probe.tree.unmount());
    const again = mount('payWeek');
    expect(again.renders[0].collapsed).toBe(true);

    act(() => again.latest().toggle());
    await flush();
    expect(again.latest().collapsed).toBe(false);
    expect(stored()).toEqual({ payWeek: false });
  });
});

// ─── Sign-out ─────────────────────────────────────────────────────────────────

describe('useCardCollapsed — not user data', () => {
  it('home_cards_v1 is not in the sign-out clearAll() list', () => {
    expect(HOME_CARDS_KEY).toBe('home_cards_v1');
    expect(fs.readFileSync(CONFIG_STORE_FILE, 'utf8')).not.toContain(HOME_CARDS_KEY);
  });
});
