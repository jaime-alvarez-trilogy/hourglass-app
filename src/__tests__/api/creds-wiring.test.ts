/**
 * features/app/durable-data spec 01-auth-renewal FR4 — static guard: every production
 * request can renew its own token.
 *
 * Scans every .ts/.tsx file under src/ and app/ (excluding __tests__ directories,
 * *.test.* files and src/api/client.ts, which defines apiGet/apiPut) for calls to
 * apiGet, apiPut and the 13 wrappers that forward to them. Each call's last argument
 * must be `creds` or a `toAuthCreds(…)` call: the wrappers forward `creds` as the last
 * apiGet/apiPut argument, and the call sites build it with `toAuthCreds`.
 *
 * Production calls span lines and carry nested type arguments
 * (`apiGet<Array<{ amount: number; paidHours: number }>>(` in auth.ts), so a line regex
 * would miss them. The scanner blanks comments and string / template / regex literal
 * bodies first (offsets and newlines kept), then reads each call's balanced `(…)`.
 * Declarations (`function fetchX(`) and non-call mentions (imports, `typeof`, object
 * keys) are not calls. The self-tests below run first, so the guard cannot silently
 * match nothing; the tree scan also asserts every name was found at least once.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SCAN_DIRS = ['src', 'app'];
const EXCLUDED_FILES = new Set([path.join('src', 'api', 'client.ts')]);

const CLIENT_CALLS = ['apiGet', 'apiPut'] as const;
const WRAPPERS = [
  'fetchTimesheet',
  'fetchPayments',
  'fetchPendingManual',
  'fetchPendingOvertime',
  'approveManual',
  'rejectManual',
  'approveOvertime',
  'rejectOvertime',
  'fetchMyTeams',
  'fetchTeamRoster',
  'fetchReportTimesheet',
  'getProfileDetail',
  'fetchConfigFromAssignments',
] as const;
const CHECKED_NAMES: readonly string[] = [...CLIENT_CALLS, ...WRAPPERS];

// ─── Scanner (test-local) ─────────────────────────────────────────────────────

interface CallSite {
  name: string;
  line: number;
  /** Top-level arguments, from the blanked source (comments and literal bodies are spaces). */
  args: string[];
  /** The call as written, whitespace-collapsed, for failure messages. */
  text: string;
  hasCreds: boolean;
}

// A `/` after one of these (or at the start) begins a regex literal, not a division.
const REGEX_PREFIX_CHARS = new Set('(,=:[!&|?{};+-*%<>~^'.split(''));
const REGEX_PREFIX_WORDS = /\b(return|typeof|case|do|else|in|of|void|yield|await)$/;

/**
 * Replaces comments and the bodies of string, template and regex literals with spaces,
 * keeping newlines so offsets and line numbers survive. Template `${…}` expressions stay
 * code. A quote or `/` that reaches the end of its line unclosed is not a literal (JSX
 * text such as `Don't`), so a stray apostrophe can never blank the rest of a file.
 */
function blankNonCode(src: string): string {
  const out = src.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  const prevSignificant = (i: number): string => {
    let k = i - 1;
    while (k >= 0 && /\s/.test(out[k])) k--;
    return k < 0 ? '' : out[k];
  };
  // Single-line literal ending at `close` (backslash escapes); index of the closer or -1.
  const lineLiteralEnd = (start: number, close: string): number => {
    let inClass = false;
    for (let j = start; j < src.length; j++) {
      const ch = src[j];
      if (ch === '\n') return -1;
      if (ch === '\\') { j++; continue; }
      if (close === '/' && ch === '[') inClass = true;
      else if (close === '/' && ch === ']') inClass = false;
      else if (ch === close && !inClass) return j;
    }
    return -1;
  };

  type Frame = { kind: 'code'; depth: number } | { kind: 'template' };
  const stack: Frame[] = [{ kind: 'code', depth: 0 }];
  let i = 0;
  while (i < src.length) {
    const top = stack[stack.length - 1];
    const c = src[i];
    const n = src[i + 1];

    if (top.kind === 'template') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      if (c === '$' && n === '{') { stack.push({ kind: 'code', depth: 0 }); i += 2; continue; }
      blank(i, i + 1);
      i++;
      continue;
    }

    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      const end = lineLiteralEnd(i + 1, c);
      if (end !== -1) { blank(i + 1, end); i = end + 1; } else { i++; }
      continue;
    }
    if (c === '/') {
      const before = prevSignificant(i);
      const word = out.slice(Math.max(0, i - 12), i).join('').trimEnd();
      if (before === '' || REGEX_PREFIX_CHARS.has(before) || REGEX_PREFIX_WORDS.test(word)) {
        const end = lineLiteralEnd(i + 1, '/');
        if (end !== -1) { blank(i + 1, end); i = end + 1; continue; }
      }
      i++;
      continue;
    }
    if (c === '`') { stack.push({ kind: 'template' }); i++; continue; }
    if (c === '{') top.depth++;
    if (c === '}') {
      if (top.depth === 0 && stack.length > 1) { stack.pop(); i++; continue; }
      top.depth--;
    }
    i++;
  }
  return out.join('');
}

/** Index just past a balanced `<…>` type-argument list starting at `start`, or -1. */
function skipTypeArgs(code: string, start: number): number {
  let depth = 0;
  for (let j = start; j < code.length; j++) {
    const ch = code[j];
    if (ch === '<') depth++;
    else if (ch === '>' && code[j - 1] !== '=') {
      depth--;
      if (depth === 0) return j + 1;
    } else if (ch === ';' && depth === 0) return -1;
  }
  return -1;
}

/** Index of the `)` matching the `(` at `open`, or -1. */
function matchParen(code: string, open: number): number {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === '(') depth++;
    else if (code[j] === ')') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** Splits an argument list on top-level commas; drops a trailing-comma empty slot. */
function splitTopLevel(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let j = 0; j < args.length; j++) {
    const ch = args[j];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(args.slice(from, j).trim());
      from = j + 1;
    }
  }
  parts.push(args.slice(from).trim());
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function findCalls(source: string, names: readonly string[]): CallSite[] {
  const code = blankNonCode(source);
  const pattern = new RegExp(`\\b(${names.join('|')})\\b`, 'g');
  const calls: CallSite[] = [];

  for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) {
    const name = m[1];
    const lineStart = code.lastIndexOf('\n', m.index - 1) + 1;
    if (/\bfunction\s*\*?\s*$/.test(code.slice(lineStart, m.index))) continue; // declaration

    let j = m.index + name.length;
    while (/\s/.test(code[j] ?? '')) j++;
    if (code[j] === '<') {
      j = skipTypeArgs(code, j);
      if (j === -1) continue; // `name < x` comparison, not type arguments
      while (/\s/.test(code[j] ?? '')) j++;
    }
    if (code[j] !== '(') continue; // a reference (import, typeof, object key), not a call

    const line = code.slice(0, m.index).split('\n').length;
    const close = matchParen(code, j);
    if (close === -1) {
      calls.push({ name, line, args: [], text: `${name}(<unbalanced>`, hasCreds: false });
      continue;
    }
    const args = splitTopLevel(code.slice(j + 1, close));
    const last = args[args.length - 1] ?? '';
    calls.push({
      name,
      line,
      args,
      text: source.slice(m.index, close + 1).replace(/\s+/g, ' '),
      hasCreds: last === 'creds' || /^toAuthCreds\s*\(/.test(last),
    });
  }
  return calls;
}

function productionFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        const rel = path.relative(ROOT, full);
        if (!EXCLUDED_FILES.has(rel)) files.push(rel);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(path.join(ROOT, dir));
  return files.sort();
}

// ─── Self-test: the scanner on fixtures ───────────────────────────────────────

const summary = (source: string) =>
  findCalls(source, CHECKED_NAMES).map(({ name, hasCreds }) => ({ name, hasCreds }));

describe('FR4.f: scanner self-test', () => {
  it('FR4.f.1: flags a multi-line call with nested type arguments and no creds', () => {
    const fixture = [
      'const payments = await apiGet<Array<{ amount: number; paidHours: number }>>(',
      "  '/api/v3/users/current/payments',",
      '  { from, to },',
      '  token,',
      '  useQA,',
      ');',
    ].join('\n');
    const calls = findCalls(fixture, CHECKED_NAMES);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: 'apiGet', line: 1, hasCreds: false });
    expect(calls[0].args).toHaveLength(4);
  });

  it('FR4.f.2: passes the same multi-line call once creds is the last argument', () => {
    const fixture = [
      'const payments = await apiGet<Array<{ amount: number; paidHours: number }>>(',
      "  '/api/v3/users/current/payments',",
      '  { from, to },',
      '  token,',
      '  useQA,',
      '  creds,',
      ');',
    ].join('\n');
    expect(summary(fixture)).toEqual([{ name: 'apiGet', hasCreds: true }]);
  });

  it.each([
    [
      'a toAuthCreds(…) last argument passes',
      'fetchTimesheet(config, token, toAuthCreds(credentials, config.useQA))',
      [{ name: 'fetchTimesheet', hasCreds: true }],
    ],
    [
      'a chained call is cut at its own closing paren',
      'fetchPayments(config, token, creds).catch(() => null)',
      [{ name: 'fetchPayments', hasCreds: true }],
    ],
    [
      'a nested call does not end the argument list early',
      'teams.map((team) => fetchTeamRoster(String(team.id), token, config.useQA))',
      [{ name: 'fetchTeamRoster', hasCreds: false }],
    ],
    [
      'creds that is not the last argument is flagged',
      'apiGet(path, { creds }, token, useQA)',
      [{ name: 'apiGet', hasCreds: false }],
    ],
    [
      'creds only in a comment inside the arguments is flagged',
      'apiGet(\n  path,\n  {},\n  token, // creds added later\n  useQA,\n)',
      [{ name: 'apiGet', hasCreds: false }],
    ],
    [
      'creds only inside a string is flagged',
      "apiGet('/api/creds', {}, token, 'creds')",
      [{ name: 'apiGet', hasCreds: false }],
    ],
    [
      'parens and commas inside string, template and regex literals are ignored',
      "apiPut<unknown>(`/api/x/${id}(`, { memo: ')', re: /[(,]/ }, token, useQA, creds)",
      [{ name: 'apiPut', hasCreds: true }],
    ],
    [
      'an arrow inside type arguments does not close them',
      'apiGet<Map<string, () => void>>(path, {}, token, useQA)',
      [{ name: 'apiGet', hasCreds: false }],
    ],
  ])('FR4.f.3: %s', (_label, fixture, expected) => {
    expect(summary(fixture)).toEqual(expected);
  });

  it('FR4.f.4: comments, declarations, imports, type queries and strings are not calls', () => {
    const fixture = [
      "import { apiGet, apiPut } from './client';",
      "import { fetchMyTeams, fetchTeamRoster } from '../api/team';",
      '// fans out fetchMyTeams() -> fetchTeamRoster() per team id',
      '/* fetchPayments(config, token) */',
      '/**',
      ' * fetchTimesheet(), so this makes exactly one request',
      ' */',
      'export async function fetchPayments(config: CrossoverConfig, token: string) {',
      'async function fetchConfigFromAssignments(',
      'type Fn = ReturnType<typeof getProfileDetail>;',
      'throw new Error(`fetchTeamRoster: malformed assignment row — missing "${field}"`);',
      "const label = 'approveManual(token, useQA)';",
    ].join('\n');
    expect(findCalls(fixture, CHECKED_NAMES)).toEqual([]);
  });

  it('FR4.f.5: an apostrophe in JSX text does not hide a later call', () => {
    const fixture = [
      "<Text>Don't refresh</Text>",
      'fetchMyTeams(token, useQA)',
    ].join('\n');
    expect(findCalls(fixture, CHECKED_NAMES)).toMatchObject([
      { name: 'fetchMyTeams', line: 2, hasCreds: false },
    ]);
  });
});

// ─── The guard: every production call carries creds ───────────────────────────

describe('FR4.g: production call sites pass creds', () => {
  const files = productionFiles();
  const calls = files.flatMap((file) =>
    findCalls(fs.readFileSync(path.join(ROOT, file), 'utf8'), CHECKED_NAMES).map((call) => ({
      file,
      ...call,
    })),
  );

  it('FR4.g.1: scans production files only (no tests, no client.ts)', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        path.join('src', 'api', 'timesheet.ts'),
        path.join('src', 'hooks', 'useApprovalItems.ts'),
        path.join('src', 'lib', 'crossoverData.ts'),
      ]),
    );
    expect(files.some((f) => f.split(path.sep)[0] === 'app')).toBe(true);
    expect(files.filter((f) => /(^|[\\/])__tests__[\\/]|\.test\./.test(f))).toEqual([]);
    expect(files).not.toContain(path.join('src', 'api', 'client.ts'));
  });

  it('FR4.g.2: finds at least one production call for every checked name', () => {
    const found = new Set(calls.map((c) => c.name));
    expect(CHECKED_NAMES.filter((name) => !found.has(name))).toEqual([]);
  });

  it('FR4.g.3: every apiGet / apiPut / wrapper call passes creds or toAuthCreds(…) last', () => {
    const missing = calls
      .filter((c) => !c.hasCreds)
      .map((c) => `${c.file}:${c.line} ${c.text}`);
    expect(missing).toEqual([]);
  });
});
