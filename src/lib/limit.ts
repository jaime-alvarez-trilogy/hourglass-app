// durable-data 02-requests-store FR1: a FIFO concurrency limiter.
// The app-wide work-diary limit (WORK_DIARY_CONCURRENCY in src/api/workDiary.ts)
// is built on it.

/**
 * Runs `task` once a slot is free and settles with the task's own result.
 * Never throws synchronously: a task that throws before returning a promise
 * rejects only its caller's promise.
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * A FIFO queue that runs at most `max` tasks at once. Tasks start in call order.
 * A task that resolves, rejects or throws frees its slot, and the oldest queued
 * task starts. A failure rejects only that task's promise.
 */
export function createLimiter(max: number): Limiter {
  // A limit below 1 would queue every task forever.
  if (!Number.isInteger(max) || max < 1) {
    throw new RangeError(`createLimiter: max must be a positive integer (got ${max})`);
  }

  let running = 0;
  const queue: Array<() => void> = [];

  function startNext(): void {
    if (running >= max) return;
    const start = queue.shift();
    if (!start) return;
    running++;
    start();
  }

  function release(): void {
    running--;
    startNext();
  }

  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        let result: Promise<T>;
        try {
          result = Promise.resolve(task());
        } catch (err) {
          result = Promise.reject(err);
        }
        // Two handlers (not `.finally`), so this chain never adds an unhandled rejection.
        result.then(
          (value) => {
            release();
            resolve(value);
          },
          (err: unknown) => {
            release();
            reject(err);
          },
        );
      });
      startNext();
    });
}
