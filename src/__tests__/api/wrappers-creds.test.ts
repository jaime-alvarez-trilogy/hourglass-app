/**
 * features/app/durable-data spec 01-auth-renewal FR4 — creds forwarding in the API wrappers.
 *
 * Every wrapper takes an optional trailing `creds?: AuthCreds` and always passes it,
 * possibly `undefined`, as the last apiGet/apiPut argument
 * (`path, paramsOrBody, token, useQA, creds`), so the client can renew an expired token
 * and retry once. `../../api/client` is factory-mocked so the exact forwarded object is
 * visible: `toBe` identity with creds, and an explicit trailing `undefined` without
 * (Jest's `toHaveBeenCalledWith` is length-strict, so `(…, undefined)` pins the slot).
 *
 * Covers `toAuthCreds`, the 6 approval wrappers, all 3 `fetchTimesheet` strategies and
 * `fetchPayments` (Decision C5). The team, work-diary and auth wrappers are covered in
 * team.test.ts, __tests__/api/work-diary.test.ts and __tests__/auth-api.test.ts.
 */

jest.mock('../../api/client', () => ({
  apiGet: jest.fn(),
  apiPut: jest.fn(),
}));

import { apiGet, apiPut } from '../../api/client';
import {
  approveManual,
  approveOvertime,
  fetchPendingManual,
  fetchPendingOvertime,
  rejectManual,
  rejectOvertime,
} from '../../api/approvals';
import { fetchTimesheet } from '../../api/timesheet';
import { fetchPayments } from '../../api/payments';
import { ApiError, AuthError } from '../../api/errors';
import { toAuthCreds, type AuthCreds } from '../../api/authCreds';
import type { AuthCreds as ClientAuthCreds } from '../../api/client';
import type { Credentials, CrossoverConfig } from '../../types/config';
import type { PaymentsResponse, TimesheetResponse } from '../../lib/hours';

const mockApiGet = apiGet as jest.Mock;
const mockApiPut = apiPut as jest.Mock;

const TOKEN = '2362707:token-abc';
const WEEK = '2026-03-09';

const CREDS: AuthCreds = { username: 'manager@example.com', password: 'secret', useQA: false };

const CONFIG: CrossoverConfig = {
  userId: '2362707',
  fullName: 'Jane Doe',
  managerId: '2372227',
  primaryTeamId: '4584',
  teams: [],
  hourlyRate: 50,
  weeklyLimit: 40,
  useQA: false,
  isManager: true,
  assignmentId: '79996',
  lastRoleCheck: '2026-03-01T00:00:00.000Z',
  debugMode: false,
  setupComplete: true,
  setupDate: '2026-03-01T00:00:00.000Z',
};

const TIMESHEET: TimesheetResponse = {
  totalHours: 32.5,
  averageHoursPerDay: 6.5,
  stats: [{ date: '2026-03-09', hours: 6.5 }],
};

const PAYMENT_ROW: PaymentsResponse = {
  paidHours: 32.5,
  workedHours: 32.5,
  overtimeHours: 0,
  approvedOvertimeHours: 0,
  manualMinutes: 0,
  amount: 1625,
};

const YMD = expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/);

/** The creds slot of an apiGet/apiPut call: (path, paramsOrBody, token, useQA, creds). */
const credsArg = (mock: jest.Mock, call = 0): unknown => mock.mock.calls[call][4];

beforeEach(() => {
  jest.resetAllMocks();
  mockApiGet.mockResolvedValue([]);
  mockApiPut.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// FR4.a — toAuthCreds
// ---------------------------------------------------------------------------

describe('FR4.a: toAuthCreds', () => {
  it.each([true, false])(
    'FR4.a.1: adds useQA=%s to stored credentials as a new object, leaving the input untouched',
    (useQA) => {
      const stored: Credentials = { username: 'u', password: 'p' };
      const creds = toAuthCreds(stored, useQA);
      expect(creds).toStrictEqual({ username: 'u', password: 'p', useQA });
      expect(creds).not.toBe(stored);
      expect(stored).toStrictEqual({ username: 'u', password: 'p' });
    },
  );
});

// ---------------------------------------------------------------------------
// FR4.b — approval wrappers (4 PUTs, 2 GETs)
// ---------------------------------------------------------------------------

interface WrapperCase {
  name: string;
  client: jest.Mock;
  call: (creds?: AuthCreds) => Promise<unknown>;
  /** Expected (path, paramsOrBody, token, useQA): everything before the creds slot. */
  args: unknown[];
}

const APPROVAL_CASES: WrapperCase[] = [
  {
    name: 'fetchPendingManual',
    client: mockApiGet,
    call: (creds) => fetchPendingManual(TOKEN, false, WEEK, creds),
    args: ['/api/timetracking/workdiaries/manual/pending', { weekStartDate: WEEK }, TOKEN, false],
  },
  {
    name: 'fetchPendingOvertime',
    client: mockApiGet,
    call: (creds) => fetchPendingOvertime(TOKEN, false, WEEK, creds),
    args: ['/api/overtime/request', { status: 'PENDING', weekStartDate: WEEK }, TOKEN, false],
  },
  {
    name: 'approveManual',
    client: mockApiPut,
    call: (creds) => approveManual(TOKEN, false, '2362707', [101, 102], false, creds),
    args: [
      '/api/timetracking/workdiaries/manual/approved',
      { approverId: '2362707', timecardIds: [101, 102], allowOvertime: false },
      TOKEN,
      false,
    ],
  },
  {
    name: 'rejectManual',
    client: mockApiPut,
    call: (creds) => rejectManual(TOKEN, false, '2362707', [101, 102], 'Duplicate entry', creds),
    args: [
      '/api/timetracking/workdiaries/manual/rejected',
      { approverId: '2362707', timecardIds: [101, 102], rejectionReason: 'Duplicate entry' },
      TOKEN,
      false,
    ],
  },
  {
    name: 'approveOvertime',
    client: mockApiPut,
    call: (creds) => approveOvertime(TOKEN, false, 42, creds),
    args: ['/api/overtime/request/approval/42', {}, TOKEN, false],
  },
  {
    name: 'rejectOvertime',
    client: mockApiPut,
    call: (creds) => rejectOvertime(TOKEN, false, 42, 'Over budget', creds),
    args: ['/api/overtime/request/rejection/42', { memo: 'Over budget' }, TOKEN, false],
  },
];

describe('FR4.b: approval wrappers forward creds', () => {
  it.each(APPROVAL_CASES)(
    'FR4.b.1: $name passes the given creds object as the last argument',
    async ({ client, call, args }) => {
      await call(CREDS);
      expect(client).toHaveBeenCalledTimes(1);
      expect(client).toHaveBeenCalledWith(...args, CREDS);
      expect(credsArg(client)).toBe(CREDS);
    },
  );

  it.each(APPROVAL_CASES)(
    'FR4.b.2: $name without creds passes an explicit trailing undefined',
    async ({ client, call, args }) => {
      await call();
      expect(client).toHaveBeenCalledTimes(1);
      expect(client).toHaveBeenCalledWith(...args, undefined);
    },
  );
});

// ---------------------------------------------------------------------------
// FR4.c — fetchTimesheet: all 3 strategies
// ---------------------------------------------------------------------------

describe('FR4.c: fetchTimesheet forwards creds on every strategy', () => {
  it('FR4.c.1: strategies 1-2 empty → all 3 apiGet calls carry the same creds object', async () => {
    await expect(fetchTimesheet(CONFIG, TOKEN, CREDS)).resolves.toBeNull();

    expect(mockApiGet).toHaveBeenCalledTimes(3);
    for (const n of [1, 2, 3]) {
      expect(mockApiGet).toHaveBeenNthCalledWith(
        n,
        '/api/timetracking/timesheets',
        expect.any(Object),
        TOKEN,
        false,
        CREDS,
      );
      expect(credsArg(mockApiGet, n - 1)).toBe(CREDS);
    }
  });

  it('FR4.c.2: a non-auth failure on strategy 1 falls through, and the later strategies still carry creds', async () => {
    mockApiGet
      .mockRejectedValueOnce(new ApiError(400))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TIMESHEET]);

    await expect(fetchTimesheet(CONFIG, TOKEN, CREDS)).resolves.toEqual(TIMESHEET);

    expect(mockApiGet).toHaveBeenCalledTimes(3);
    expect(mockApiGet.mock.calls.every((c) => c[4] === CREDS)).toBe(true);
  });

  it('FR4.c.3: without creds → all 3 calls carry an explicit trailing undefined', async () => {
    await fetchTimesheet(CONFIG, TOKEN);

    expect(mockApiGet).toHaveBeenCalledTimes(3);
    for (const n of [1, 2, 3]) {
      expect(mockApiGet).toHaveBeenNthCalledWith(
        n,
        '/api/timetracking/timesheets',
        expect.any(Object),
        TOKEN,
        false,
        undefined,
      );
    }
  });

  // Preserved behaviour: once the client's single renewal has failed, the AuthError
  // still reaches the caller and strategies 2-3 are not tried with a dead token.
  it('FR4.c.4: an AuthError on strategy 1 is rethrown after exactly 1 call', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(401));

    await expect(fetchTimesheet(CONFIG, TOKEN, CREDS)).rejects.toBeInstanceOf(AuthError);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FR4.d — fetchPayments
// ---------------------------------------------------------------------------

describe('FR4.d: fetchPayments forwards creds', () => {
  it('FR4.d.1: passes the given creds object as the last apiGet argument', async () => {
    mockApiGet.mockResolvedValueOnce([PAYMENT_ROW]);

    await expect(fetchPayments(CONFIG, TOKEN, CREDS)).resolves.toEqual(PAYMENT_ROW);

    expect(mockApiGet).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v3/users/current/payments',
      { from: YMD, to: YMD },
      TOKEN,
      false,
      CREDS,
    );
    expect(credsArg(mockApiGet)).toBe(CREDS);
  });

  it('FR4.d.2: without creds passes an explicit trailing undefined', async () => {
    await fetchPayments(CONFIG, TOKEN);

    expect(mockApiGet).toHaveBeenCalledWith(
      '/api/v3/users/current/payments',
      { from: YMD, to: YMD },
      TOKEN,
      false,
      undefined,
    );
  });

  // Preserved behaviour: a failed renewal's AuthError is not swallowed as "no payment row".
  it('FR4.d.3: an AuthError from apiGet still propagates', async () => {
    mockApiGet.mockRejectedValueOnce(new AuthError(401));

    await expect(fetchPayments(CONFIG, TOKEN, CREDS)).rejects.toBeInstanceOf(AuthError);
  });
});

// ---------------------------------------------------------------------------
// FR4.e — AuthCreds typing. Checked by `npm run typecheck` only (Jest does not
// type-check), so it is a never-called function rather than a runtime test.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function typeChecksForAuthCreds(bare: Credentials, viaClient: ClientAuthCreds): AuthCreds {
  // A bare Credentials (no useQA) is not accepted as creds. If AuthCreds stops
  // requiring useQA, this directive is unused and the typecheck fails.
  // @ts-expect-error — creds must carry the environment (useQA)
  void fetchPayments(CONFIG, TOKEN, bare);
  // client.ts re-exports the same AuthCreds type.
  return viaClient;
}
