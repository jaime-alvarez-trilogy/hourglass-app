/**
 * durable-data 02-requests-store FR1: getAuthGeneration()
 *
 * The read-only view of spec 01's `authGeneration` counter. fetchWorkDiary puts it
 * in the in-flight sharing key, so a call made after a hard reset (sign-out, env
 * switch, not-contributor) never joins a request started before it. Runs against
 * the real src/api/client.ts; a fresh module registry per file means it starts at 0.
 */

jest.mock('../../store/config', () => ({
  getApiBase: (useQA: boolean) =>
    useQA ? 'https://api-qa.crossover.com' : 'https://api.crossover.com',
}));

jest.mock('../../lib/log', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { getAuthGeneration, invalidateAuthToken } from '../../api/client';

describe('DD2 FR1: getAuthGeneration', () => {
  it('DD2.11: is 0 on a fresh module and goes up by one on every invalidateAuthToken()', () => {
    expect(getAuthGeneration()).toBe(0);
    // Reading is side-effect free.
    expect(getAuthGeneration()).toBe(0);

    invalidateAuthToken();
    expect(getAuthGeneration()).toBe(1);

    invalidateAuthToken();
    expect(getAuthGeneration()).toBe(2);
  });
});
