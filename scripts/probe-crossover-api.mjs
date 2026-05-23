#!/usr/bin/env node
/**
 * Crossover API probe — hits QA endpoints with credentials from .env.local
 * and captures redacted JSON responses to docs/api-samples/ for the
 * docs/CROSSOVER_API.md reference.
 *
 * READ-ONLY: no PUT/POST mutations beyond the auth token call.
 *
 * Usage: node scripts/probe-crossover-api.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SAMPLES_DIR = path.join(REPO_ROOT, 'docs', 'api-samples');

const BASE = 'https://api-qa.crossover.com';

// ─── credentials ────────────────────────────────────────────────────────────
const env = await fs.readFile(path.join(REPO_ROOT, '.env.local'), 'utf8');
const get = (key) => env.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim();
const username = get('TEST_QA_USERNAME');
const password = get('TEST_QA_PASSWORD');
if (!username || !password) {
  console.error('FAIL: TEST_QA_USERNAME / TEST_QA_PASSWORD missing in .env.local');
  process.exit(1);
}

// ─── redaction ──────────────────────────────────────────────────────────────
const REDACT_KEYS = new Set([
  'fullName', 'printableName', 'firstName', 'lastName',
  'email', 'username', 'phone', 'avatarUrl',
  'token', 'password', 'secret', 'x-auth-token',
]);
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACT_KEYS.has(k) && typeof v === 'string') {
        out[k] = '<REDACTED>';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

// ─── helpers ────────────────────────────────────────────────────────────────
async function save(name, payload) {
  const file = path.join(SAMPLES_DIR, `${name}.json`);
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + '\n');
  console.log(`saved ${path.relative(REPO_ROOT, file)}`);
}

function ymdUTC(date) {
  return date.toISOString().slice(0, 10);
}
function mondayUTC(date) {
  const d = new Date(date);
  const dow = d.getUTCDay();
  const back = (dow + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back));
}
function sundayUTC(monday) {
  return new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
}

// ─── 1. Token ───────────────────────────────────────────────────────────────
console.log('\n[1] POST /api/v3/token');
const basic = Buffer.from(`${username}:${password}`).toString('base64');
const t0 = Date.now();
const tokenRes = await fetch(`${BASE}/api/v3/token`, {
  method: 'POST',
  headers: { Authorization: `Basic ${basic}` },
});
const tokenText = await tokenRes.text();
const tokenLatency = Date.now() - t0;
console.log(`  status=${tokenRes.status} latency=${tokenLatency}ms bytes=${tokenText.length}`);
console.log(`  content-type=${tokenRes.headers.get('content-type')}`);

let token;
try {
  token = JSON.parse(tokenText).token;
  console.log(`  body shape: JSON {token: "userId:secret"}`);
} catch {
  token = tokenText;
  console.log(`  body shape: plain text "userId:secret"`);
}
const tokenUserId = token.split(':')[0];
console.log(`  token userId (prefix): ${tokenUserId}`);

await save('01-auth-token', {
  request: {
    method: 'POST',
    url: '/api/v3/token',
    headers: { Authorization: 'Basic <base64>' },
  },
  response: {
    status: tokenRes.status,
    contentType: tokenRes.headers.get('content-type'),
    bodyShape: tokenText.startsWith('{') ? 'json' : 'text',
    latencyMs: tokenLatency,
    parsedTokenFormat: 'userId:secret',
  },
});

// ─── 1b. Token TTL probe — call detail with same token after delay ──────────
console.log('\n[1b] Token re-use probe');
const t1a = Date.now();
const detail1 = await fetch(`${BASE}/api/identity/users/current/detail`, {
  headers: { 'x-auth-token': token },
});
await detail1.text();
console.log(`  call 1 with token: status=${detail1.status} latency=${Date.now() - t1a}ms`);

await new Promise((r) => setTimeout(r, 2000));
const t1b = Date.now();
const detail2 = await fetch(`${BASE}/api/identity/users/current/detail`, {
  headers: { 'x-auth-token': token },
});
await detail2.text();
console.log(`  call 2 (same token, +2s): status=${detail2.status} latency=${Date.now() - t1b}ms`);

await new Promise((r) => setTimeout(r, 10000));
const t1c = Date.now();
const detail3 = await fetch(`${BASE}/api/identity/users/current/detail`, {
  headers: { 'x-auth-token': token },
});
await detail3.text();
console.log(`  call 3 (same token, +12s):  status=${detail3.status} latency=${Date.now() - t1c}ms`);

await save('01b-token-reuse', {
  tokenReusable: detail2.status === 200 && detail3.status === 200,
  observedCalls: [
    { status: detail1.status, label: 'immediate' },
    { status: detail2.status, label: '+2s' },
    { status: detail3.status, label: '+12s' },
  ],
  note: 'Token cached in memory across 3 calls. If all 200, token TTL > 12s (current per-request fetch is likely wasteful).',
});

// ─── 2. Profile detail ──────────────────────────────────────────────────────
console.log('\n[2] GET /api/identity/users/current/detail');
const t2 = Date.now();
const detailRes = await fetch(`${BASE}/api/identity/users/current/detail`, {
  headers: { 'x-auth-token': token },
});
const detailBody = await detailRes.json();
console.log(`  status=${detailRes.status} latency=${Date.now() - t2}ms`);

const candidate = detailBody.userAvatars?.find((a) => a.type === 'CANDIDATE');
const candidateId = candidate?.id ?? detailBody.assignment?.selection?.marketplaceMember?.application?.candidate?.id;
const assignmentId = detailBody.assignment?.id;
const managerId = detailBody.assignment?.manager?.id;
const teamId = detailBody.assignment?.team?.id;
console.log(`  candidate.id (config.userId for timesheet): ${candidateId}`);
console.log(`  assignment.id (config.assignmentId for work diary): ${assignmentId}`);
console.log(`  manager.id: ${managerId}`);
console.log(`  team.id: ${teamId}`);
console.log(`  avatarTypes: ${JSON.stringify(detailBody.avatarTypes)}`);
console.log(`  isManager: ${detailBody.avatarTypes?.includes('MANAGER')}`);

await save('02-user-detail', {
  request: { method: 'GET', url: '/api/identity/users/current/detail' },
  responseStatus: detailRes.status,
  responseSchema: redact(detailBody),
});

// ─── 3. Assignments fallback ────────────────────────────────────────────────
console.log('\n[3] GET /api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0');
const assignRes = await fetch(
  `${BASE}/api/v2/teams/assignments?avatarType=CANDIDATE&status=ACTIVE&page=0`,
  { headers: { 'x-auth-token': token } }
);
const assignBody = await assignRes.json();
console.log(`  status=${assignRes.status} count=${Array.isArray(assignBody) ? assignBody.length : 'n/a'}`);
await save('03-assignments', {
  request: { method: 'GET', url: '/api/v2/teams/assignments', params: { avatarType: 'CANDIDATE', status: 'ACTIVE', page: 0 } },
  responseStatus: assignRes.status,
  responseSchema: redact(assignBody),
});

// ─── 4. Timesheet (3 strategies) ────────────────────────────────────────────
const today = new Date();
const monday = mondayUTC(today);
const mondayStr = ymdUTC(monday);
console.log(`\n[4] GET /api/timetracking/timesheets  (date=${mondayStr})`);

async function timesheet(params, label) {
  const qs = new URLSearchParams(params);
  const t = Date.now();
  const r = await fetch(`${BASE}/api/timetracking/timesheets?${qs}`, {
    headers: { 'x-auth-token': token },
  });
  const txt = await r.text();
  let body;
  try { body = JSON.parse(txt); } catch { body = txt; }
  console.log(`  ${label}: status=${r.status} count=${Array.isArray(body) ? body.length : 'n/a'} latency=${Date.now() - t}ms`);
  return { status: r.status, body };
}

const ts1 = await timesheet(
  { date: mondayStr, period: 'WEEK', userId: candidateId, managerId, teamId },
  'strategy 1 (full)'
);
const ts2 = await timesheet(
  { date: mondayStr, period: 'WEEK', userId: candidateId, managerId },
  'strategy 2 (no teamId)'
);
const ts3 = await timesheet(
  { date: mondayStr, period: 'WEEK', userId: candidateId },
  'strategy 3 (minimal)'
);

await save('04-timesheet', {
  strategy1_full: { status: ts1.status, response: redact(ts1.body) },
  strategy2_noTeam: { status: ts2.status, response: redact(ts2.body) },
  strategy3_minimal: { status: ts3.status, response: redact(ts3.body) },
});

// ─── 5. Payments ────────────────────────────────────────────────────────────
const sunday = sundayUTC(monday);
console.log(`\n[5] GET /api/v3/users/current/payments?from=${ymdUTC(monday)}&to=${ymdUTC(sunday)}`);
const payRes = await fetch(
  `${BASE}/api/v3/users/current/payments?from=${ymdUTC(monday)}&to=${ymdUTC(sunday)}`,
  { headers: { 'x-auth-token': token } }
);
const payBody = await payRes.json();
console.log(`  status=${payRes.status} count=${Array.isArray(payBody) ? payBody.length : 'n/a'}`);
await save('05-payments-current-week', {
  request: { from: ymdUTC(monday), to: ymdUTC(sunday) },
  responseStatus: payRes.status,
  responseSchema: redact(payBody),
});

// ─── 6. Work diary ──────────────────────────────────────────────────────────
const yesterday = new Date(today.getTime() - 86400000);
const yYmd = ymdUTC(yesterday);
console.log(`\n[6] GET /api/timetracking/workdiaries?assignmentId=${assignmentId}&date=${yYmd}`);
const diaryRes = await fetch(
  `${BASE}/api/timetracking/workdiaries?assignmentId=${assignmentId}&date=${yYmd}`,
  { headers: { 'x-auth-token': token } }
);
const diaryBody = await diaryRes.json();
const slotCount = Array.isArray(diaryBody) ? diaryBody.length : 0;
console.log(`  status=${diaryRes.status} slots=${slotCount}`);
if (slotCount > 0) {
  const tags = new Set();
  diaryBody.forEach((s) => s.tags?.forEach((t) => tags.add(t)));
  console.log(`  unique tags observed: ${JSON.stringify([...tags])}`);
}
await save('06-workdiary-yesterday', {
  request: { assignmentId, date: yYmd },
  responseStatus: diaryRes.status,
  slotCount,
  sampleSlots: Array.isArray(diaryBody) ? redact(diaryBody.slice(0, 3)) : redact(diaryBody),
});

// ─── 7. Pending manual (manager-only) ───────────────────────────────────────
console.log(`\n[7] GET /api/timetracking/workdiaries/manual/pending?weekStartDate=${mondayStr}`);
const manualRes = await fetch(
  `${BASE}/api/timetracking/workdiaries/manual/pending?weekStartDate=${mondayStr}`,
  { headers: { 'x-auth-token': token } }
);
const manualBody = manualRes.status === 200 ? await manualRes.json() : await manualRes.text();
console.log(`  status=${manualRes.status}${typeof manualBody === 'string' ? ` body="${manualBody.slice(0, 100)}"` : ` count=${manualBody.length}`}`);
await save('07-manual-pending', {
  request: { weekStartDate: mondayStr },
  responseStatus: manualRes.status,
  responseSchema: typeof manualBody === 'string' ? { error: manualBody } : redact(manualBody),
});

// ─── 8. Overtime requests ───────────────────────────────────────────────────
console.log(`\n[8] GET /api/overtime/request?status=PENDING&weekStartDate=${mondayStr}`);
const otRes = await fetch(
  `${BASE}/api/overtime/request?status=PENDING&weekStartDate=${mondayStr}`,
  { headers: { 'x-auth-token': token } }
);
const otBody = otRes.status === 200 ? await otRes.json() : await otRes.text();
console.log(`  status=${otRes.status}${typeof otBody === 'string' ? ` body="${otBody.slice(0, 100)}"` : ` count=${otBody.length}`}`);
await save('08-overtime-pending', {
  request: { status: 'PENDING', weekStartDate: mondayStr },
  responseStatus: otRes.status,
  responseSchema: typeof otBody === 'string' ? { error: otBody } : redact(otBody),
});

// ─── 9. Error probes ────────────────────────────────────────────────────────
console.log('\n[9] Error probes');
const bad1 = await fetch(`${BASE}/api/identity/users/current/detail`, {
  headers: { 'x-auth-token': 'not-a-token:bogus' },
});
const bad1Body = await bad1.text();
console.log(`  bad token → status=${bad1.status} body="${bad1Body.slice(0, 100)}"`);

const bad2 = await fetch(`${BASE}/api/this/does/not/exist`, {
  headers: { 'x-auth-token': token },
});
const bad2Body = await bad2.text();
console.log(`  404 path → status=${bad2.status} body="${bad2Body.slice(0, 100)}"`);

await save('09-error-cases', {
  badToken: { status: bad1.status, body: bad1Body.slice(0, 500) },
  notFound: { status: bad2.status, body: bad2Body.slice(0, 500) },
});

console.log('\nDONE.');
