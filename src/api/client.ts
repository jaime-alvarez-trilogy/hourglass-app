// FR3, FR4, FR5: Centralized Crossover API client

import { AuthError, NetworkError, ApiError } from './errors';
import { getApiBase } from '../store/config';

// FR3: Fetch a fresh auth token (called before each API request)
export async function getAuthToken(
  username: string,
  password: string,
  useQA: boolean
): Promise<string> {
  const base = getApiBase(useQA);
  const credentials = btoa(`${username}:${password}`);

  let response: Response;
  try {
    response = await fetch(`${base}/api/v3/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Network request failed');
  }

  if (response.status === 401) throw new AuthError(401);
  if (response.status === 403) throw new AuthError(403);
  if (!response.ok) throw new ApiError(response.status);

  const text = await response.text();
  // API returns either plain token string or JSON {"token":"..."}
  try {
    const json = JSON.parse(text);
    return json.token ?? text;
  } catch {
    return text;
  }
}

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const url = `${base}${path}`;
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return url;
  const qs = new URLSearchParams(entries).toString();
  return `${url}?${qs}`;
}

function handleStatus(status: number): never {
  if (status === 401) throw new AuthError(401);
  if (status === 403) throw new AuthError(403);
  throw new ApiError(status);
}

// FR4: Typed GET request
export async function apiGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
  useQA: boolean
): Promise<T> {
  const url = buildUrl(getApiBase(useQA), path, params);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { 'x-auth-token': token },
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Connection failed');
  }
  if (!response.ok) handleStatus(response.status);
  return response.json() as Promise<T>;
}

// FR5: Typed PUT request
export async function apiPut<T>(
  path: string,
  body: unknown,
  token: string,
  useQA: boolean
): Promise<T> {
  const base = getApiBase(useQA);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'PUT',
      headers: {
        'x-auth-token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new NetworkError(err instanceof Error ? err.message : 'Connection failed');
  }
  if (!response.ok) handleStatus(response.status);
  return response.json() as Promise<T>;
}
