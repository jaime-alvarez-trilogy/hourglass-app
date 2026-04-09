// FR2: Approval API Functions
import {
  fetchPendingManual,
  fetchPendingOvertime,
  approveManual,
  rejectManual,
  approveOvertime,
  rejectOvertime,
} from '../src/api/approvals';
import { ApiError, AuthError } from '../src/api/errors';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const TOKEN = 'test-token-123';
const QA_BASE = 'https://api-qa.crossover.com';
const PROD_BASE = 'https://api.crossover.com';

// Helper: success response returning JSON array
function successJson(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

// Helper: empty 200 for PUT mutations
function successEmpty() {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
  };
}

function errorResponse(status: number) {
  return { ok: false, status, json: async () => ({}) };
}

// =============================================================================
// FR2: fetchPendingManual
// =============================================================================

describe('FR2: fetchPendingManual', () => {
  it('FR2_calls_GET_manual_pending_endpoint', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingManual(TOKEN, false, '2026-03-09');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/timetracking/workdiaries/manual/pending');
    expect(options.method).toBe('GET');
  });

  it('FR2_includes_weekStartDate_query_param', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingManual(TOKEN, false, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('weekStartDate=2026-03-09');
  });

  it('FR2_sends_x_auth_token_header', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingManual(TOKEN, false, '2026-03-09');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe(TOKEN);
  });

  it('FR2_uses_QA_base_when_useQA_true', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingManual(TOKEN, true, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${QA_BASE}`));
  });

  it('FR2_uses_prod_base_when_useQA_false', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingManual(TOKEN, false, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${PROD_BASE}`));
  });

  it('FR2_throws_ApiError_on_non_2xx', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403));
    await expect(fetchPendingManual(TOKEN, false, '2026-03-09')).rejects.toBeInstanceOf(AuthError);
  });
});

// =============================================================================
// FR2: fetchPendingOvertime
// =============================================================================

describe('FR2: fetchPendingOvertime', () => {
  it('FR2_calls_GET_overtime_request_endpoint', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingOvertime(TOKEN, false, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/overtime/request');
  });

  it('FR2_includes_status_PENDING_param', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingOvertime(TOKEN, false, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('status=PENDING');
  });

  it('FR2_includes_weekStartDate_param', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingOvertime(TOKEN, false, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('weekStartDate=2026-03-09');
  });

  it('FR2_sends_x_auth_token_header', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingOvertime(TOKEN, false, '2026-03-09');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe(TOKEN);
  });

  it('FR2_uses_QA_base_when_useQA_true', async () => {
    mockFetch.mockResolvedValueOnce(successJson([]));
    await fetchPendingOvertime(TOKEN, true, '2026-03-09');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${QA_BASE}`));
  });

  it('FR2_throws_ApiError_on_500', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500));
    await expect(fetchPendingOvertime(TOKEN, false, '2026-03-09')).rejects.toBeInstanceOf(ApiError);
  });
});

// =============================================================================
// FR2: approveManual
// =============================================================================

describe('FR2: approveManual', () => {
  it('FR2_calls_PUT_manual_approved_endpoint', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveManual(TOKEN, false, 'approver-id', [1, 2]);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/timetracking/workdiaries/manual/approved');
    expect(options.method).toBe('PUT');
  });

  it('FR2_body_contains_approverId_timecardIds_allowOvertime_false', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveManual(TOKEN, false, 'approver-id', [1, 2]);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.approverId).toBe('approver-id');
    expect(body.timecardIds).toEqual([1, 2]);
    expect(body.allowOvertime).toBe(false);
  });

  it('FR2_sends_x_auth_token_header', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveManual(TOKEN, false, 'approver-id', [1]);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe(TOKEN);
  });

  it('FR2_uses_QA_base_when_useQA_true', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveManual(TOKEN, true, 'approver-id', [1]);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${QA_BASE}`));
  });

  it('FR2_throws_on_non_2xx', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(422));
    await expect(approveManual(TOKEN, false, 'approver-id', [1])).rejects.toBeInstanceOf(ApiError);
  });
});

// =============================================================================
// FR2: rejectManual
// =============================================================================

describe('FR2: rejectManual', () => {
  it('FR2_calls_PUT_manual_rejected_endpoint', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await rejectManual(TOKEN, false, 'approver-id', [1], 'Not valid');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/timetracking/workdiaries/manual/rejected');
    expect(options.method).toBe('PUT');
  });

  it('FR2_body_contains_approverId_timecardIds_rejectionReason', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await rejectManual(TOKEN, false, 'approver-id', [1, 2], 'Not valid');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.approverId).toBe('approver-id');
    expect(body.timecardIds).toEqual([1, 2]);
    expect(body.rejectionReason).toBe('Not valid');
  });

  it('FR2_sends_x_auth_token_header', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await rejectManual(TOKEN, false, 'approver-id', [1], 'reason');
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe(TOKEN);
  });
});

// =============================================================================
// FR2: approveOvertime
// =============================================================================

describe('FR2: approveOvertime', () => {
  it('FR2_calls_PUT_overtime_approval_with_overtimeId_in_path', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveOvertime(TOKEN, false, 42);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/overtime/request/approval/42');
    expect(options.method).toBe('PUT');
  });

  it('FR2_sends_empty_body_for_approveOvertime', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveOvertime(TOKEN, false, 42);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({});
  });

  it('FR2_uses_QA_base_when_useQA_true', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await approveOvertime(TOKEN, true, 42);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`^${QA_BASE}`));
  });

  it('FR2_throws_on_non_2xx', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(403));
    await expect(approveOvertime(TOKEN, false, 42)).rejects.toBeInstanceOf(AuthError);
  });
});

// =============================================================================
// FR2: rejectOvertime
// =============================================================================

describe('FR2: rejectOvertime', () => {
  it('FR2_calls_PUT_overtime_rejection_with_overtimeId_in_path', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await rejectOvertime(TOKEN, false, 42, 'Not justified');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/overtime/request/rejection/42');
    expect(options.method).toBe('PUT');
  });

  it('FR2_body_contains_memo', async () => {
    mockFetch.mockResolvedValueOnce(successEmpty());
    await rejectOvertime(TOKEN, false, 42, 'Not justified');
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.memo).toBe('Not justified');
  });

  it('FR2_throws_on_non_2xx', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500));
    await expect(rejectOvertime(TOKEN, false, 42, 'reason')).rejects.toBeInstanceOf(ApiError);
  });
});
