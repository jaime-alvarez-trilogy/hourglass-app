// Spec 08-observability-log FR2: redaction at write time.
//
// Deny-by-default: only primitives (string/number/boolean) survive, and only
// when their key is not on the deny-list and their value (if a string) does
// not match a credential-shaped pattern. Objects, arrays, null, undefined,
// bigint, symbol, and function values are dropped. This module has no I/O,
// no async, no dependencies — pure data transform.

const DENY_SUBSTRINGS = [
  'password',
  'pass',
  'token',
  'secret',
  'auth', // matches authorization, authToken
  'cookie',
  'credential',
  'username',
  'user_name',
  'email',
  'firstname',
  'lastname',
  'fullname',
  'displayname',
  'memo',
  'description',
  'text',
  'message',
  'body',
  'headers',
  'servertext',
  'name', // catches fullName, firstName, userName — defended explicitly
];

const COUNT_EXCEPTION = /(count|length|size)/i;
const ID_SUFFIX = /id$/i; // matches 'id' or 'Id' suffix

const BASIC = /^Basic\s+/i;
const BEARER = /^Bearer\s+/i;
const BASE64_LIKE = /^[A-Za-z0-9+/=]+$/;
const TOKEN_LIKE = /^[A-Za-z0-9_\-]{32,}$/;

function isKeyDenyListed(key: string): boolean {
  const lower = key.toLowerCase();
  for (const sub of DENY_SUBSTRINGS) {
    if (lower.includes(sub)) return true;
  }
  // *id / *Id suffix rule, with count/length/size exception.
  if (ID_SUFFIX.test(key) && !COUNT_EXCEPTION.test(key)) return true;
  return false;
}

function scrubString(value: string): string {
  if (BASIC.test(value)) return '<basic-auth>';
  if (BEARER.test(value)) return '<bearer-token>';
  if (value.length > 64 && BASE64_LIKE.test(value)) return '<redacted-base64>';
  if (TOKEN_LIKE.test(value)) return '<redacted-token>';
  return value;
}

/**
 * Redact a meta payload before it reaches the log file.
 * Drops deny-listed keys, scrubs credential-shaped string values, and keeps
 * only primitive `string | number | boolean` survivors. Pure; no side effects.
 */
export function redact(
  meta: Record<string, unknown>
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(meta)) {
    if (isKeyDenyListed(key)) continue;
    const val = meta[key];
    if (typeof val === 'string') {
      out[key] = scrubString(val);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      out[key] = val;
    }
    // All other types (object, array, null, undefined, bigint, symbol, function)
    // are dropped silently.
  }
  return out;
}
