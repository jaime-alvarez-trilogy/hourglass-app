// FR3, FR4, FR5: Centralized Crossover API client

import { AuthError, NetworkError, ApiError, type ErrorEnvelope } from './errors';
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

  if (!response.ok) await handleStatus(response);

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

// Spec 03 (error-envelope): read the response body before throwing so callers
// can see {errorCode, type, text} when Crossover provides a structured error.
// Defensive — never lets envelope parsing escalate the failure.
async function handleStatus(response: Response): Promise<never> {
  let envelope: ErrorEnvelope | undefined;
  try {
    const bodyText = await response.text();
    if (bodyText) {
      const parsed: unknown = JSON.parse(bodyText);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        typeof (parsed as { errorCode?: unknown }).errorCode === 'string' &&
        ((parsed as { errorCode: string }).errorCode).length > 0
      ) {
        const obj = parsed as { errorCode: string; type?: unknown; text?: unknown };
        envelope = {
          errorCode: obj.errorCode,
          type: typeof obj.type === 'string' ? obj.type : undefined,
          text: typeof obj.text === 'string' ? obj.text : undefined,
        };
      }
    }
  } catch {
    // Non-JSON body (HTML 500 page, plain-text 503, truncated JSON, etc).
    // Envelope stays undefined; the thrown error still carries statusCode.
  }

  if (response.status === 401) throw new AuthError(401, undefined, envelope);
  if (response.status === 403) throw new AuthError(403, undefined, envelope);
  throw new ApiError(response.status, undefined, envelope);
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
  if (!response.ok) await handleStatus(response);
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
  if (!response.ok) await handleStatus(response);
  // Crossover approve/reject endpoints return an empty body on success.
  // Reading as text first avoids "Unexpected end of input" from response.json().
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
