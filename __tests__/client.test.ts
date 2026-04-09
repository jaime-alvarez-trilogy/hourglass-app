// FR3, FR4, FR5: API Client
import { getAuthToken, apiGet, apiPut } from '../src/api/client';
import { AuthError, NetworkError, ApiError } from '../src/api/errors';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// --- FR3: getAuthToken ---
describe('FR3: getAuthToken', () => {
  it('returns token string on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '12345:abc',
    });
    const token = await getAuthToken('user@example.com', 'pass', false);
    expect(token).toBe('12345:abc');
  });

  it('sends Authorization: Basic base64(username:password) header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('user@example.com', 'pass', false);
    const [, options] = mockFetch.mock.calls[0];
    const expected = 'Basic ' + btoa('user@example.com:pass');
    expect(options.headers['Authorization']).toBe(expected);
  });

  it('sends POST request', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('user@example.com', 'pass', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('POST');
  });

  it('throws AuthError(401) on 401 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => '' });
    const err = await getAuthToken('u', 'p', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(401);
  });

  it('throws AuthError(403) on 403 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => '' });
    const err = await getAuthToken('u', 'p', false).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.statusCode).toBe(403);
  });

  it('throws NetworkError when fetch rejects', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(getAuthToken('u', 'p', false)).rejects.toThrow(NetworkError);
  });

  it('uses QA base URL when useQA is true', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('u', 'p', true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api-qa\.crossover\.com/);
  });

  it('uses prod base URL when useQA is false', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'tok' });
    await getAuthToken('u', 'p', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.crossover\.com/);
  });
});

// --- FR4: apiGet ---
describe('FR4: apiGet', () => {
  it('attaches x-auth-token header with the token value', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 1 }) });
    await apiGet('/test', {}, 'mytoken', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe('mytoken');
  });

  it('serializes params into query string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiGet('/test', { date: '2026-01-01', teamId: '4584' }, 'tok', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('date=2026-01-01');
    expect(url).toContain('teamId=4584');
  });

  it('no ? in URL when params is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiGet('/test', {}, 'tok', false);
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('?');
  });

  it('request method is GET', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiGet('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('GET');
  });

  it('throws AuthError(401) on 401', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws AuthError(403) on 403', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws ApiError(500) on 500', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toThrow(ApiError);
    await expect(apiGet('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 500 });
  });
});

// --- FR5: apiPut ---
describe('FR5: apiPut', () => {
  it('request method is PUT', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiPut('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe('PUT');
  });

  it('attaches x-auth-token header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiPut('/test', {}, 'mytoken', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['x-auth-token']).toBe('mytoken');
  });

  it('attaches Content-Type: application/json header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    await apiPut('/test', {}, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('serializes body as JSON string', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const body = { approverId: '123', timecardIds: [1, 2] };
    await apiPut('/test', body, 'tok', false);
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBe(JSON.stringify(body));
  });

  it('throws AuthError(403) on 403', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toThrow(AuthError);
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws ApiError(422) on 422', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) });
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toThrow(ApiError);
    await expect(apiPut('/test', {}, 'tok', false)).rejects.toMatchObject({ statusCode: 422 });
  });
});
