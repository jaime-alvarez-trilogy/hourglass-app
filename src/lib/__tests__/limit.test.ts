// durable-data 02-requests-store FR1: createLimiter, the FIFO queue that runs at most
// `max` tasks at once. The app-wide work-diary limit (WORK_DIARY_CONCURRENCY) is built on it.
//
// jest-circus fails the running test on an unhandledRejection, so the failure cases
// end with a flush: that is the turn in which Node would report one.

import { createLimiter } from '../limit';

/** A promise whose settlement the test controls (holds a task open). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every queued promise continuation run (slot hand-offs, task starts). */
function flush(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0));
}

/**
 * `count` tasks, each held open until the test settles it. `started` records start
 * order, and `peak` is the most tasks that were running at once.
 */
function heldTasks<T>(count: number) {
  const state = { started: [] as number[], running: 0, peak: 0 };
  const held = Array.from({ length: count }, () => deferred<T>());
  const tasks = held.map((d, i) => () => {
    state.started.push(i);
    state.running++;
    state.peak = Math.max(state.peak, state.running);
    return d.promise.finally(() => {
      state.running--;
    });
  });
  return { state, held, tasks };
}

describe('DD2 FR1: createLimiter', () => {
  it('DD2.1: with max 4, only 4 of 10 tasks start, each settle starts exactly one more, and every caller gets its own result', async () => {
    const limit = createLimiter(4);
    const { state, held, tasks } = heldTasks<string>(10);

    const results = tasks.map((task) => limit(task));
    await flush();
    expect(state.started).toEqual([0, 1, 2, 3]);

    held[0].resolve('r0');
    await flush();
    expect(state.started).toEqual([0, 1, 2, 3, 4]);

    // Settle out of order; every task settled here has already started.
    for (const i of [3, 1, 4, 2, 5, 6, 7, 8, 9]) {
      held[i].resolve(`r${i}`);
      await flush();
    }

    await expect(Promise.all(results)).resolves.toEqual([
      'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9',
    ]);
    expect(state.started).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(state.peak).toBe(4);
  });

  it('DD2.2: with max 1, tasks run one at a time, in FIFO start order', async () => {
    const limit = createLimiter(1);
    const events: string[] = [];
    const first = deferred<void>();

    const task = (i: number, hold?: Promise<void>) => async () => {
      events.push(`start ${i}`);
      await hold;
      await Promise.resolve();
      events.push(`end ${i}`);
      return i;
    };

    const results = [limit(task(0, first.promise)), limit(task(1)), limit(task(2))];
    await flush();
    // Tasks 1 and 2 could finish at once, but they wait for task 0's slot.
    expect(events).toEqual(['start 0']);

    // A task queued while another runs still goes behind the earlier ones.
    results.push(limit(task(3)));
    first.resolve();
    await flush();

    expect(events).toEqual([
      'start 0', 'end 0',
      'start 1', 'end 1',
      'start 2', 'end 2',
      'start 3', 'end 3',
    ]);
    await expect(Promise.all(results)).resolves.toEqual([0, 1, 2, 3]);
  });

  describe('DD2.3: a failing task rejects only its own promise and frees its slot', () => {
    it('a task whose promise rejects', async () => {
      const limit = createLimiter(1);
      const boom = new Error('boom');
      const held = deferred<string>();

      const failing = limit(() => held.promise);
      const failed = failing.then(
        () => 'resolved',
        (e: unknown) => e,
      );
      const next = limit(async () => 'next');

      await flush();
      held.reject(boom);

      expect(await failed).toBe(boom);
      await expect(next).resolves.toBe('next');
      await flush();
    });

    it('an async task that throws as soon as it starts', async () => {
      const limit = createLimiter(1);
      const boom = new Error('async throw');

      const failing = limit(async () => {
        throw boom;
      });
      const next = limit(async () => 'next');

      await expect(failing).rejects.toBe(boom);
      await expect(next).resolves.toBe('next');
      await flush();
    });

    it('a plain function that throws before returning a promise', async () => {
      const limit = createLimiter(1);
      const boom = new Error('sync throw');
      const throwing = (() => {
        throw boom;
      }) as () => Promise<string>;

      // The throw becomes a rejection of the caller's promise, never a sync throw.
      let failing!: Promise<string>;
      expect(() => {
        failing = limit(throwing);
      }).not.toThrow();
      const next = limit(async () => 'next');

      await expect(failing).rejects.toBe(boom);
      await expect(next).resolves.toBe('next');
      await flush();
    });

    it('with max 2, a rejection leaves the other running task alone and starts the queued one', async () => {
      const limit = createLimiter(2);
      const { state, held, tasks } = heldTasks<string>(3);
      const boom = new Error('boom');

      const [a, b, c] = tasks.map((task) => limit(task));
      const aOutcome = a.then(
        () => 'resolved',
        (e: unknown) => e,
      );
      await flush();
      expect(state.started).toEqual([0, 1]);

      held[0].reject(boom);
      await flush();
      expect(await aOutcome).toBe(boom);
      expect(state.started).toEqual([0, 1, 2]);

      held[1].resolve('b');
      held[2].resolve('c');
      await expect(b).resolves.toBe('b');
      await expect(c).resolves.toBe('c');
      await flush();
    });
  });
});
