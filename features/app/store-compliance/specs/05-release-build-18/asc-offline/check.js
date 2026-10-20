#!/usr/bin/env node
// Offline verification of `.appstore/asc.js` for spec 05 FR2-FR5 (Phase 2.0 "tests").
//
// asc.js is untracked and the ASC API returns 403 until the agreement is accepted, so the
// dry-run transcripts the checklist asks for can't be produced live. This runs each asc.js
// command under mock-https.js, which answers from fixtures.js, blocks every non-GET request and
// all real network access, and logs what was requested. Every case runs with ASC_TRACE=1.
// The live transcripts are still recorded in Phase 3 once the agreement is accepted.
//
// Usage (from any directory):
//   node check.js --target <path/to/.appstore/asc.js>   run all cases (exit 1 on any failure)
//   node check.js --target <…> --red                    red phase: characterization cases must
//                                                       pass and every other case must fail
//   node check.js --self-test                           check the fake ASC + transport only
//   options: --only <id-or-text>  --transcripts (print every case's output)  --list
// --target defaults to $ASC_JS, then <repo root>/.appstore/asc.js.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { isDeepStrictEqual } = require('util');
const vm = require('vm');
const F = require('./fixtures');

const MOCK = require.resolve('./mock-https');
const REPO_ROOT = path.resolve(path.dirname(MOCK), '../../../../../..');
const A = F.APP_ID;

const ALL_COMMANDS = [
  'list-testers',
  'add-tester',
  'remove-tester',
  'builds',
  'submit-review',
  'beta-info',
  'set-beta-info',
  'set-store-listing',
  'set-metadata',
  'set-review-notes',
  'submit-app-review',
  'check-submission',
  'disable-public-link',
  'remove-public-link-testers',
  'create-version',
  'attach-build',
  'set-whats-new',
  'set-urls',
  'set-social-media-age-rating',
];

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const TARGET = path.resolve(opt('--target') ?? process.env.ASC_JS ?? path.join(REPO_ROOT, '.appstore/asc.js'));

// ── Output parsing ──────────────────────────────────────────────────────────
const DRY_WRITE = /^\[dry-run\] (POST|PATCH|DELETE|PUT) (\S+)(?: (.*))?$/;
const DRY_TRAILER = /^\[dry-run\] (\d+) write\(s\) skipped$/;
const TRACE = /^\[http\] (\S+) (\S+) -> (\d{3})$/;
const lines = (text) => text.split('\n');
const parseJson = (text) => {
  if (text == null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^\\w-])${reEscape(w)}($|[^\\w-])`);
const show = (v) => JSON.stringify(v);

// ── Running one case ────────────────────────────────────────────────────────
function runAsc(scenario, args, workDir, tag) {
  const logFile = path.join(workDir, `${tag}.jsonl`);
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!/^ASC_/.test(k) && !/^(HTTPS?_PROXY|NODE_OPTIONS)$/i.test(k)) env[k] = v;
  }
  Object.assign(env, { ASC_MOCK_SCENARIO: scenario, ASC_MOCK_LOG: logFile, ASC_TRACE: '1' });
  const r = spawnSync(process.execPath, ['-r', MOCK, TARGET, ...args], {
    env,
    cwd: workDir,
    encoding: 'utf8',
    timeout: 20000,
  });
  const log = fs.existsSync(logFile)
    ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const requests = log.filter((e) => !e.event);
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  return {
    status: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT',
    stdout,
    stderr,
    out: `${stdout}\n${stderr}`,
    mockLoaded: log[0]?.event === 'mock-loaded',
    requests,
    asc: requests.filter((e) => e.host === 'api.appstoreconnect.apple.com'),
    pages: requests.filter((e) => e.host === 'jaime-alvarez-trilogy.github.io'),
    dryWrites: lines(stdout)
      .map((l) => l.match(DRY_WRITE))
      .filter(Boolean)
      .map((m) => ({ method: m[1], path: m[2], body: parseJson(m[3]) })),
    dryWritesAnywhere: lines(`${stdout}\n${stderr}`).filter((l) => DRY_WRITE.test(l)).length,
    dryLines: lines(stdout).filter((l) => l.startsWith('[dry-run]')),
    trace: lines(stderr)
      .map((l) => l.match(TRACE))
      .filter(Boolean)
      .map((m) => ({ method: m[1], path: m[2], status: Number(m[3]) })),
  };
}

function checker(r) {
  const errs = [];
  const pick = (where) => (where === 'stdout' ? r.stdout : where === 'stderr' ? r.stderr : r.out);
  const t = {
    errs,
    fail: (msg) => errs.push(msg),
    has(re, where = 'out', why = '') {
      const rx = typeof re === 'string' ? new RegExp(reEscape(re)) : re;
      if (!rx.test(pick(where))) errs.push(`expected ${where} to match ${rx}${why ? ` (${why})` : ''}`);
    },
    lacks(re, where = 'out', why = '') {
      const rx = typeof re === 'string' ? new RegExp(reEscape(re)) : re;
      const hit = pick(where).match(rx);
      if (hit) errs.push(`expected ${where} not to match ${rx}${why ? ` (${why})` : ''}; found ${show(hit[0])}`);
    },
    countLines(re, n, where = 'out', why = '') {
      const got = lines(pick(where)).filter((l) => re.test(l)).length;
      if (got !== n) errs.push(`expected ${n} ${where} line(s) matching ${re}${why ? ` (${why})` : ''}, got ${got}`);
    },
    requested(re, why = '') {
      if (!r.requests.some((e) => e.method === 'GET' && re.test(e.path))) {
        errs.push(`expected a GET matching ${re}${why ? ` (${why})` : ''}; requests: ${show(r.requests.map((e) => e.path))}`);
      }
    },
    notRequested(re, why = '') {
      const hit = r.requests.find((e) => re.test(e.path));
      if (hit) errs.push(`expected no request matching ${re}${why ? ` (${why})` : ''}; got ${hit.method} ${hit.path}`);
    },
  };
  return t;
}

function matchWrite(got, want) {
  const why = [];
  if (got.method !== want.method) why.push(`method ${got.method} != ${want.method}`);
  if (got.path !== want.path) why.push(`path ${got.path} != ${want.path}`);
  if ('body' in want && !isDeepStrictEqual(got.body, want.body)) why.push(`body ${show(got.body)} != ${show(want.body)}`);
  if ('attributes' in want) {
    const d = got.body?.data;
    if (d?.type !== want.type) why.push(`data.type ${show(d?.type)} != ${show(want.type)}`);
    if (d?.id !== want.id) why.push(`data.id ${show(d?.id)} != ${show(want.id)}`);
    if (!isDeepStrictEqual(d?.attributes, want.attributes)) {
      why.push(`data.attributes ${show(d?.attributes)} != ${show(want.attributes)}`);
    }
  }
  return why;
}

function checkWrites(r, c, t) {
  const want = c.writes ?? [];
  const got = r.dryWrites;
  if (got.length !== want.length || r.dryWritesAnywhere !== got.length) {
    t.fail(
      `expected exactly ${want.length} "[dry-run] <METHOD> <path> <json>" stdout line(s), got ${got.length}` +
        (r.dryWritesAnywhere !== got.length ? ` (+${r.dryWritesAnywhere - got.length} on stderr)` : '') +
        (got.length ? `: ${show(got.map((w) => `${w.method} ${w.path}`))}` : ''),
    );
  }
  if (c.unordered) {
    const left = [...got];
    for (const w of want) {
      const i = left.findIndex((g) => matchWrite(g, w).length === 0);
      if (i < 0) t.fail(`no [dry-run] line matches ${w.method} ${w.path} ${show(w.body ?? w.attributes)}`);
      else left.splice(i, 1);
    }
  } else {
    want.forEach((w, i) => {
      if (!got[i]) return;
      const why = matchWrite(got[i], w);
      if (why.length) t.fail(`[dry-run] line ${i + 1}: ${why.join('; ')}`);
    });
  }
  const trailers = r.dryLines.map((l) => l.match(DRY_TRAILER)).filter(Boolean);
  if (want.length > 0) {
    const last = r.dryLines[r.dryLines.length - 1]?.match(DRY_TRAILER);
    if (!last) t.fail(`expected the last [dry-run] line to be "[dry-run] ${want.length} write(s) skipped"`);
    else if (Number(last[1]) !== want.length) t.fail(`trailer says ${last[1]} write(s) skipped, expected ${want.length}`);
  } else if (trailers.some((m) => Number(m[1]) !== 0)) {
    t.fail(`no-op/refusal printed a non-zero trailer: ${show(trailers.map((m) => m[0]))}`);
  }
}

function evaluate(c, r) {
  const t = checker(r);
  if (!r.mockLoaded) {
    t.fail('ABORT: mock-https.js did not load; refusing to trust this run');
    return t.errs;
  }
  if (r.timedOut) t.fail('timed out after 20s');
  for (const e of r.requests.filter((x) => x.blocked)) {
    t.fail(`non-GET ${e.method} ${e.path} reached the network layer (the harness blocked it)`);
  }
  for (const e of r.requests.filter((x) => x.networkError)) t.fail(`request to a non-fixture host: ${e.networkError}`);
  for (const e of r.requests.filter((x) => x.unhandled)) t.fail(`fixture gap (not an asc.js bug?): GET ${e.path} has no fixture`);
  const writeTrace = r.trace.filter((x) => x.method !== 'GET' && x.method !== 'HEAD');
  if (writeTrace.length) t.fail(`ASC_TRACE shows non-GET requests: ${show(writeTrace)}`);
  if (!c.characterization && c.trace !== false && r.asc.length > 0) {
    const n = r.trace.length;
    if (n < r.asc.length || n > r.asc.length + r.pages.length) {
      t.fail(`ASC_TRACE=1 should log one "[http] <METHOD> <path> -> <status>" stderr line per ASC request: ${r.asc.length} request(s), ${n} trace line(s)`);
    }
    if (lines(r.stdout).some((l) => l.startsWith('[http] '))) t.fail('trace lines must go to stderr, not stdout');
  }
  if (c.exit !== undefined && r.status !== c.exit) t.fail(`exit ${r.status}, expected ${c.exit}`);
  if (!c.characterization || c.writes) checkWrites(r, c, t);
  if (c.check) c.check(r, t);
  return t.errs;
}

// ── Static (file-content) checks ────────────────────────────────────────────
function staticSource() {
  return fs.readFileSync(TARGET, 'utf8');
}
const topLevel = (src, re) =>
  lines(src)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => re.test(l));
// Evaluates the file from the top through the Config block (up to the first "// ── " marker after
// "// ── Config") in a sandbox and returns its constants. Nothing after the Config block runs.
function configBlock(src) {
  const ls = lines(src);
  const start = ls.findIndex((l) => /^\/\/ ── Config/.test(l));
  if (start < 0) return { error: 'no "// ── Config" marker' };
  const end = ls.findIndex((l, i) => i > start && /^\/\/ ── /.test(l));
  const code = ls.slice(0, end < 0 ? ls.length : end).join('\n').replace(/^#!.*/, '');
  const names = ['KEY_ID', 'ISSUER_ID', 'KEY_PATH', 'URLS', 'EDITABLE_VERSION_STATES', 'EDITABLE_INFO_STATES'];
  const probe = `;({ ${names.map((n) => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(', ')} })`;
  try {
    return vm.runInNewContext(code + probe, {
      require,
      console,
      process: { argv: [process.execPath, TARGET], env: {} },
      __dirname: path.dirname(TARGET),
      __filename: TARGET,
    });
  } catch (e) {
    return { error: `Config block failed to evaluate: ${e.message}` };
  }
}
function functionBody(src, name) {
  const start = src.search(new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) return null;
  const next = src.slice(start + 1).search(/\n(async\s+)?function\s|\n\/\/ ── /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

// ── Cases ───────────────────────────────────────────────────────────────────
function makeCases(files) {
  const PL = F.PUBLIC_LINK_IDS;
  const del = (id) => ({ method: 'DELETE', path: `/betaTesters/${id}/relationships/apps`, body: { data: [{ type: 'apps', id: A }] } });
  const attach = (versionId, buildId) => ({
    method: 'PATCH',
    path: `/appStoreVersions/${versionId}`,
    body: { data: { type: 'appStoreVersions', id: versionId, relationships: { build: { data: { type: 'builds', id: buildId } } } } },
  });
  const submissionWrites = [
    {
      method: 'POST',
      path: '/reviewSubmissions',
      body: { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: A } } } } },
    },
    {
      method: 'POST',
      path: '/reviewSubmissionItems',
      body: {
        data: {
          type: 'reviewSubmissionItems',
          relationships: {
            reviewSubmission: { data: { type: 'reviewSubmissions', id: '<new-submission-id>' } },
            appStoreVersion: { data: { type: 'appStoreVersions', id: 'asv-110' } },
          },
        },
      },
    },
    {
      method: 'PATCH',
      path: '/reviewSubmissions/<new-submission-id>',
      body: { data: { type: 'reviewSubmissions', id: '<new-submission-id>', attributes: { submitted: true } } },
    },
  ];
  const whatsNewWrite = (text) => ({
    method: 'PATCH',
    path: '/appStoreVersionLocalizations/asvl-110-en',
    type: 'appStoreVersionLocalizations',
    id: 'asvl-110-en',
    attributes: { whatsNew: text },
  });
  const testerRow = (id) => new RegExp(`^\\s*${reEscape(id)}\\s`);
  const rowsFor = (r, id) => lines(r.stdout).filter((l) => testerRow(id).test(l));
  const isTesterRow = (l) => [...PL, ...F.EMAIL_IDS].some((id) => testerRow(id).test(l));
  const expectPublicRows = (r, t) => {
    for (const id of PL) {
      const rows = rowsFor(r, id);
      if (rows.length !== 1 || !/<anonymous>/.test(rows[0]) || !/PUBLIC_LINK/.test(rows[0])) {
        t.fail(`expected one row starting with ${id} showing <anonymous> and PUBLIC_LINK, got ${show(rows)}`);
      }
    }
  };
  const expectEmailRows = (r, t) => {
    for (const tt of F.EMAIL_TESTERS) {
      const rows = rowsFor(r, tt.id);
      if (rows.length !== 1 || !rows[0].includes(tt.email) || !/\bEMAIL\b/.test(rows[0])) {
        t.fail(`expected one row starting with ${tt.id} showing ${tt.email} and EMAIL, got ${show(rows)}`);
      }
    }
  };
  const countLine = (r, type, n) =>
    lines(r.stdout).some(
      (l) => !isTesterRow(l) && new RegExp(`(${type}\\W{1,3}${n}\\b|\\b${n}\\W{1,3}${type}\\b)`).test(l),
    );
  const notLive = /URL not live: (\S+) -> (\d{3}) \(finish spec 01 \/ OPS O2\)/;
  // The global usage lists every command; a command's own refusal never mentions list-testers.
  const ownRefusal = (t) => t.lacks(/list-testers/, 'out', 'a command-specific refusal, not the global usage');
  const runCreateVersion = (r, t) => {
    t.has(/create-version <x\.y\.z>/, 'out', 'the getLatestVersion / getEditableAppInfo "run create-version" message');
    ownRefusal(t);
  };
  const allPagesRequested = (r, t) => {
    for (const u of Object.values(F.URLS)) {
      const p = new URL(u).pathname;
      if (!r.pages.some((e) => e.path.split('?')[0] === p)) t.fail(`expected the URL check to request ${u}`);
    }
  };

  return [
    // ── FR2: safety fixes and dry-run plumbing ──
    {
      id: 'FR2.01',
      title: 'node --check exits 0',
      characterization: true,
      run: () => {
        const r = spawnSync(process.execPath, ['--check', TARGET], { encoding: 'utf8' });
        return r.status === 0 ? [] : [`node --check exit ${r.status}: ${r.stderr}`];
      },
    },
    {
      id: 'FR2.02',
      title: 'KEY_ID / ISSUER_ID / KEY_PATH stay in the top Config block (OPS O8)',
      characterization: true,
      run: () => {
        const src = staticSource();
        const firstFn = topLevel(src, /^(async\s+)?function\s/)[0]?.i ?? Infinity;
        return ['KEY_ID', 'ISSUER_ID', 'KEY_PATH']
          .filter((k) => !(topLevel(src, new RegExp(`^const ${k}\\b`))[0]?.i < firstFn))
          .map((k) => `const ${k} is not declared before the first function`);
      },
    },
    {
      id: 'FR2.03',
      title: 'Config block (evaluated alone, in a sandbox) defines URLS, EDITABLE_VERSION_STATES, EDITABLE_INFO_STATES',
      run: () => {
        const cfg = configBlock(staticSource());
        if (cfg.error) return [cfg.error];
        const errs = [];
        const states = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'];
        for (const name of ['EDITABLE_VERSION_STATES', 'EDITABLE_INFO_STATES']) {
          const arr = cfg[name];
          if (!Array.isArray(arr) || !isDeepStrictEqual([...arr].sort(), [...states].sort())) {
            errs.push(`Config block ${name} = ${show(arr)}, expected ${show(states)}`);
          }
        }
        if (!isDeepStrictEqual(cfg.URLS && { ...cfg.URLS }, F.URLS)) errs.push(`Config block URLS = ${show(cfg.URLS)}, expected ${show(F.URLS)}`);
        return errs;
      },
    },
    {
      id: 'FR2.04',
      title: 'dispatcher (// ── Main) is after every function and every UPPER_CASE const (no TDZ)',
      run: () => {
        const src = staticSource();
        const main = topLevel(src, /^\/\/ ── Main/)[0]?.i;
        if (main === undefined) return ['no "// ── Main" marker'];
        // An UPPER_CASE const inside the Main section is fine only above the command invocation.
        const invoke = topLevel(src, /\.catch\(/).find(({ i }) => i > main)?.i ?? main;
        const late = [
          ...topLevel(src, /^(async\s+)?function\s/).filter(({ i }) => i > main),
          ...topLevel(src, /^const [A-Z][A-Z0-9_]*\s*=/).filter(({ i }) => i > invoke),
        ];
        const markers = topLevel(src, /^\/\/ ── /).filter(({ i }) => i > main);
        return [
          ...late.map(({ l, i }) => `line ${i + 1} is after the dispatcher: ${l.trim().slice(0, 70)}`),
          ...markers.map(({ l, i }) => `section after Main at line ${i + 1}: ${l.trim().slice(0, 50)}`),
        ];
      },
    },
    {
      id: 'FR2.05',
      title: 'header comment lists every command and --dry-run',
      run: () => {
        const header = staticSource().match(/^(?:#!.*\n)?\s*\/\*\*?([\s\S]*?)\*\//)?.[1] ?? '';
        return [...ALL_COMMANDS, '--dry-run'].filter((cmd) => !wordRe(cmd).test(header)).map((cmd) => `header comment lacks ${cmd}`);
      },
    },
    {
      id: 'FR2.06',
      title: 'no command: usage lists every command and --dry-run, exit 1',
      scenario: 'today',
      args: [],
      exit: 1,
      check: (r, t) => {
        for (const cmd of [...ALL_COMMANDS, '--dry-run']) if (!wordRe(cmd).test(r.out)) t.fail(`usage lacks ${cmd}`);
      },
    },
    ...['builds', 'list-testers', 'check-submission'].map((cmd, i) => ({
      id: `FR2.07${'abc'[i]}`,
      title: `agreement 403 is surfaced, not "App not found" (${cmd})`,
      scenario: 'agreement-403',
      args: [cmd],
      exit: 1,
      check: (r, t) => {
        t.has(/ASC API error: 403 FORBIDDEN\.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED \S A required agreement is missing or has expired\./);
        t.lacks(/App not found/);
        if (!r.trace.some((x) => x.status === 403)) t.fail('expected a "[http] GET … -> 403" trace line');
      },
    })),
    {
      id: 'FR2.08',
      title: 'ASC_TRACE=1 logs "[http] GET <path> -> <status>" to stderr',
      scenario: 'today',
      args: ['builds'],
      exit: 0,
      check: (r, t) => {
        t.has(/^\[http\] GET \S*\/apps\?filter(\[|%5B)bundleId(\]|%5D)=com\.jalvarez0907\.hourglass -> 200$/m, 'stderr');
        t.lacks(/^\[http\]/m, 'stdout');
      },
    },
    {
      id: 'FR2.09',
      title: 'list-testers: 12 <anonymous> PUBLIC_LINK rows with ids, no "null", total and per-type counts',
      scenario: 'today',
      args: ['list-testers'],
      exit: 0,
      check: (r, t) => {
        expectPublicRows(r, t);
        expectEmailRows(r, t);
        t.lacks(/null/, 'stdout', 'null names/emails must print as <anonymous> or blank');
        t.has(/Total: 14\b/, 'stdout');
        if (!countLine(r, 'PUBLIC_LINK', 12)) t.fail('expected a per-type count line "PUBLIC_LINK: 12"');
        if (!countLine(r, 'EMAIL', 2)) t.fail('expected a per-type count line "EMAIL: 2"');
      },
    },
    {
      id: 'FR2.10',
      title: 'list-testers --type=PUBLIC_LINK prints only PUBLIC_LINK rows',
      scenario: 'today',
      args: ['list-testers', '--type=PUBLIC_LINK'],
      exit: 0,
      check: (r, t) => {
        expectPublicRows(r, t);
        for (const tt of F.EMAIL_TESTERS) {
          t.lacks(tt.id, 'stdout');
          t.lacks(tt.email, 'stdout');
        }
        t.has(/Total: 12\b/, 'stdout');
      },
    },
    {
      id: 'FR2.11',
      title: 'list-testers --type=EMAIL prints only the 2 email testers',
      scenario: 'today',
      args: ['list-testers', '--type=EMAIL'],
      exit: 0,
      check: (r, t) => {
        expectEmailRows(r, t);
        for (const id of PL) t.lacks(wordRe(id), 'stdout');
        t.lacks('<anonymous>', 'stdout');
        t.has(/Total: 2\b/, 'stdout');
      },
    },
    {
      id: 'FR2.12',
      title: 'set-review-notes --dry-run before 1.1.0 exists: "No editable App Store version (live: 1.0 …)", exit 1',
      scenario: 'today',
      args: ['set-review-notes', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/No editable App Store version \(live: 1\.0 (READY_FOR_SALE|READY_FOR_DISTRIBUTION)/);
        t.has(/Run: node \.appstore\/asc\.js create-version <x\.y\.z>/);
        ownRefusal(t);
      },
    },
    {
      id: 'FR2.13',
      title: 'set-review-notes --dry-run with two editable versions refuses',
      scenario: 'v110-fresh+two-editable',
      args: ['set-review-notes', '--dry-run'],
      exit: 1,
      check: (r, t) => t.notRequested(/appStoreReviewDetail/, 'getLatestVersion must throw before reading any version'),
    },
    {
      id: 'FR2.14',
      title: 'request() backstop: a legacy writer (set-beta-info) under --dry-run throws "Refusing PATCH in --dry-run"',
      scenario: 'today',
      args: ['set-beta-info', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/Refusing PATCH in --dry-run/),
    },
    {
      id: 'FR2.15',
      title: '--dry-run is parsed from anywhere in argv (before the command)',
      scenario: 'today',
      args: ['--dry-run', 'disable-public-link'],
      exit: 0,
      writes: [{ method: 'PATCH', path: '/betaGroups/bg-test', body: { data: { type: 'betaGroups', id: 'bg-test', attributes: { publicLinkEnabled: false } } } }],
    },
    {
      id: 'FR2.16',
      title: 'check-submission format baseline (1.0 record)',
      characterization: true,
      scenario: 'today',
      args: ['check-submission'],
      exit: 0,
      check: (r, t) => {
        t.has(/^Version 1\.0: (READY_FOR_SALE|READY_FOR_DISTRIBUTION)\b/m, 'stdout');
        t.has(/^Attached build: v15 \(bld-15\)$/m, 'stdout');
        t.has(/^Demo account required: true {2}\| {2}demo user set: yes$/m, 'stdout');
        t.has(/^Review notes match Unlisted text: (true|false)$/m, 'stdout');
        t.has(/^ {2}rs-100 {2}state=COMPLETE {2}platform=IOS$/m, 'stdout');
      },
    },
    {
      id: 'FR2.17',
      title: 'check-submission still reports the newest version once it is no longer editable (getNewestVersion)',
      characterization: true,
      scenario: 'v110-in-review',
      args: ['check-submission'],
      exit: 0,
      check: (r, t) => {
        t.has(/^Version 1\.1\.0: WAITING_FOR_REVIEW\b/m, 'stdout');
        t.has(/^Attached build: v18 \(bld-18\)$/m, 'stdout');
      },
    },
    {
      id: 'FR2.18',
      title: 'builds format baseline',
      characterization: true,
      scenario: 'today',
      args: ['builds'],
      exit: 0,
      check: (r, t) => {
        t.has(/^Build {6}Date {19}State {16}Audience$/m, 'stdout');
        t.has(/^17 {9}.+? VALID {16}APP_STORE_ELIGIBLE$/m, 'stdout');
        t.has(/^Build IDs \(for submit-review\):$/m, 'stdout');
        t.has(/^ {2}bld-17 {2}v17 {2}VALID$/m, 'stdout');
      },
    },
    {
      id: 'FR2.19',
      title: 'beta-info format baseline',
      characterization: true,
      scenario: 'today',
      args: ['beta-info'],
      exit: 0,
      check: (r, t) => {
        t.has(/^Locale: en-US$/m, 'stdout');
        t.has(/^Feedback email: jaime\.alvarez@trilogy\.com$/m, 'stdout');
        t.has(new RegExp(`^Privacy policy URL: ${reEscape(F.DEAD_URL)}$`, 'm'), 'stdout');
      },
    },

    // ── FR3: public-link lockdown ──
    {
      id: 'FR3.01',
      title: 'disable-public-link --dry-run lists groups and previews exactly one PATCH for "Test"',
      scenario: 'today',
      args: ['disable-public-link', '--dry-run'],
      exit: 0,
      writes: [{ method: 'PATCH', path: '/betaGroups/bg-test', body: { data: { type: 'betaGroups', id: 'bg-test', attributes: { publicLinkEnabled: false } } } }],
      check: (r, t) => {
        if (!lines(r.stdout).some((l) => l.includes('bg-test') && /\bTest\b/.test(l))) t.fail('expected a line with group id bg-test and name Test');
        if (!lines(r.stdout).some((l) => l.includes('bg-internal') && l.includes('Internal Testers'))) t.fail('expected the internal group to be listed too');
        t.has(/publicLinkEnabled\W+true/, 'stdout');
        t.has(/isInternalGroup|internal\W*(true|false)/i, 'stdout');
        t.has('https://testflight.apple.com/join/AbCdEf12', 'stdout');
      },
    },
    {
      id: 'FR3.02',
      title: 'disable-public-link --dry-run once disabled: "= public link already disabled on all groups", 0 writes',
      scenario: 'v110-fresh',
      args: ['disable-public-link', '--dry-run'],
      exit: 0,
      check: (r, t) => t.has(/^= public link already disabled on all groups/m, 'stdout'),
    },
    {
      id: 'FR3.03',
      title: 'remove-public-link-testers --dry-run previews 12 DELETEs, none for EMAIL testers',
      scenario: 'today',
      args: ['remove-public-link-testers', '--dry-run'],
      exit: 0,
      unordered: true,
      writes: PL.map(del),
      check: (r, t) => {
        for (const id of F.EMAIL_IDS) if (r.dryLines.some((l) => l.includes(id))) t.fail(`EMAIL tester ${id} appears in a [dry-run] line`);
      },
    },
    {
      id: 'FR3.04',
      title: 'remove-public-link-testers <EMAIL id> --dry-run: "Refusing: <id> is EMAIL", exit 1, 0 writes',
      scenario: 'today',
      args: ['remove-public-link-testers', 'bt-em-01', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/Refusing: bt-em-01 is EMAIL/),
    },
    {
      id: 'FR3.05',
      title: 'remove-public-link-testers <PUBLIC_LINK id> <EMAIL id>: validates all ids before any write',
      scenario: 'today',
      args: ['remove-public-link-testers', 'bt-pl-01', 'bt-em-02', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/Refusing: bt-em-02 is EMAIL/),
    },
    {
      id: 'FR3.06',
      title: 'remove-public-link-testers <2 PUBLIC_LINK ids> --dry-run previews exactly those 2 DELETEs',
      scenario: 'today',
      args: ['remove-public-link-testers', 'bt-pl-01', 'bt-pl-02', '--dry-run'],
      exit: 0,
      unordered: true,
      writes: [del('bt-pl-01'), del('bt-pl-02')],
    },
    {
      id: 'FR3.07',
      title: 'remove-public-link-testers <unknown id> refuses with 0 writes',
      scenario: 'today',
      args: ['remove-public-link-testers', 'bt-nope', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.requested(/^\/v1\/betaTesters\/bt-nope\b/, 'contract: GET /betaTesters/{id} for each id');
        ownRefusal(t);
      },
    },
    {
      id: 'FR3.08',
      title: 'remove-public-link-testers --dry-run with none left: "= no PUBLIC_LINK testers", 0 writes',
      scenario: 'v110-fresh',
      args: ['remove-public-link-testers', '--dry-run'],
      exit: 0,
      check: (r, t) => t.has(/^= no PUBLIC_LINK testers/m, 'stdout'),
    },
    {
      id: 'FR3.09',
      title: 'after lockdown: list-testers --type=PUBLIC_LINK prints "Total: 0"',
      scenario: 'v110-fresh',
      args: ['list-testers', '--type=PUBLIC_LINK'],
      exit: 0,
      check: (r, t) => t.has(/Total: 0\b/, 'stdout'),
    },
    {
      id: 'FR3.10',
      title: 'after lockdown: list-testers --type=EMAIL still shows the 2 email testers',
      scenario: 'v110-fresh',
      args: ['list-testers', '--type=EMAIL'],
      exit: 0,
      check: (r, t) => {
        expectEmailRows(r, t);
        t.has(/Total: 2\b/, 'stdout');
      },
    },

    // ── FR4: version record commands ──
    {
      id: 'FR4.01',
      title: 'create-version 1.1 (bad format) exits 1 with 0 writes',
      scenario: 'today',
      args: ['create-version', '1.1', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/1\.1\b/);
        ownRefusal(t);
      },
    },
    {
      id: 'FR4.02',
      title: 'create-version with no version exits 1 with 0 writes',
      scenario: 'today',
      args: ['create-version', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/create-version/),
    },
    {
      id: 'FR4.03',
      title: 'create-version 1.1.0 --dry-run (no record): POST version (AFTER_APPROVAL) + POST phased (INACTIVE, <new-version-id>)',
      scenario: 'today',
      args: ['create-version', '1.1.0', '--dry-run'],
      exit: 0,
      writes: [
        {
          method: 'POST',
          path: '/appStoreVersions',
          body: {
            data: {
              type: 'appStoreVersions',
              attributes: { platform: 'IOS', versionString: '1.1.0', releaseType: 'AFTER_APPROVAL' },
              relationships: { app: { data: { type: 'apps', id: A } } },
            },
          },
        },
        {
          method: 'POST',
          path: '/appStoreVersionPhasedReleases',
          body: {
            data: {
              type: 'appStoreVersionPhasedReleases',
              attributes: { phasedReleaseState: 'INACTIVE' },
              relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: '<new-version-id>' } } },
            },
          },
        },
      ],
    },
    {
      id: 'FR4.04',
      title: 'create-version 1.1.0 --dry-run (record exists, no phased): "= version … already exists", POST phased only',
      scenario: 'v110-fresh',
      args: ['create-version', '1.1.0', '--dry-run'],
      exit: 0,
      writes: [
        {
          method: 'POST',
          path: '/appStoreVersionPhasedReleases',
          body: {
            data: {
              type: 'appStoreVersionPhasedReleases',
              attributes: { phasedReleaseState: 'INACTIVE' },
              relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: 'asv-110' } } },
            },
          },
        },
      ],
      check: (r, t) => t.has(/^= version 1\.1\.0 already exists \(PREPARE_FOR_SUBMISSION\)/m, 'stdout'),
    },
    {
      id: 'FR4.05',
      title: 'create-version 1.1.0 re-run after live create: both "=" lines, 0 writes',
      scenario: 'v110-prepped',
      args: ['create-version', '1.1.0', '--dry-run'],
      exit: 0,
      check: (r, t) => {
        t.has(/^= version 1\.1\.0 already exists \(PREPARE_FOR_SUBMISSION\)/m, 'stdout');
        t.has(/^= phased release already configured \(INACTIVE\)/m, 'stdout');
      },
    },
    {
      id: 'FR4.06',
      title: 'create-version 1.2.0 while 1.1.0 is editable: refuse (never rename), 0 writes',
      scenario: 'v110-fresh',
      args: ['create-version', '1.2.0', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/1\.1\.0/),
    },
    {
      id: 'FR4.07',
      title: 'create-version 1.1.0 while 1.1.0 is WAITING_FOR_REVIEW: refuse, print the state, 0 writes',
      scenario: 'v110-in-review',
      args: ['create-version', '1.1.0', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/WAITING_FOR_REVIEW/),
    },
    {
      id: 'FR4.08',
      title: 'attach-build with no id: usage, exit 1',
      scenario: 'v110-build18',
      args: ['attach-build', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/usage/i);
        t.has(/attach-build <buildId>/);
      },
    },
    {
      id: 'FR4.09',
      title: 'attach-build before 1.1.0 exists: "run create-version", exit 1',
      scenario: 'today',
      args: ['attach-build', 'bld-17', '--dry-run'],
      exit: 1,
      check: runCreateVersion,
    },
    {
      id: 'FR4.10',
      title: 'attach-build <build 17> once 18 is VALID: "newer valid build 18" refusal, 0 writes',
      scenario: 'v110-build18',
      args: ['attach-build', 'bld-17', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/newer/i);
        t.has(/\b18\b/);
      },
    },
    {
      id: 'FR4.11',
      title: 'attach-build <build 18> --dry-run: exactly one PATCH (build relationship)',
      scenario: 'v110-build18',
      args: ['attach-build', 'bld-18', '--dry-run'],
      exit: 0,
      writes: [attach('asv-110', 'bld-18')],
      check: (r, t) => t.requested(/^\/v1\/builds\/bld-18\?(.*&)?include=preReleaseVersion\b/, 'contract: GET /builds/{id}?include=preReleaseVersion'),
    },
    {
      id: 'FR4.12',
      title: 'attach-build <build 18> once attached: "= build 18 already attached", 0 writes',
      scenario: 'post-live',
      args: ['attach-build', 'bld-18', '--dry-run'],
      exit: 0,
      check: (r, t) => t.has(/^= build 18 already attached/m, 'stdout'),
    },
    {
      id: 'FR4.13',
      title: 'attach-build guard (b): expired build refused (no newer build, so only (b) applies)',
      scenario: 'v110-build18+build18-expired',
      args: ['attach-build', 'bld-18', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/expired/i),
    },
    {
      id: 'FR4.14',
      title: 'attach-build guard (c): build of another marketing version (1.0.0) refused',
      scenario: 'v110-build18+build15-unexpired',
      args: ['attach-build', 'bld-15', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/1\.0\.0/),
    },
    {
      id: 'FR4.15',
      title: 'attach-build guard (a): non-VALID (PROCESSING) build refused',
      scenario: 'v110-build18+build19-processing',
      args: ['attach-build', 'bld-19', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/PROCESSING/),
    },
    {
      id: 'FR4.16',
      title: 'attach-build guard (d) ignores a higher build that is not VALID',
      scenario: 'v110-build18+build19-processing',
      args: ['attach-build', 'bld-18', '--dry-run'],
      exit: 0,
      writes: [attach('asv-110', 'bld-18')],
    },
    {
      id: 'FR4.16b',
      title: 'attach-build <build 18> replaces an attached build 17 (one PATCH)',
      scenario: 'v110-build18+attached-17',
      args: ['attach-build', 'bld-18', '--dry-run'],
      exit: 0,
      writes: [attach('asv-110', 'bld-18')],
    },
    {
      id: 'FR4.17',
      title: 'attach-build <unknown id> refuses with 0 writes',
      scenario: 'v110-build18',
      args: ['attach-build', 'bld-nope', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.requested(/^\/v1\/builds\/bld-nope\b/, 'contract: GET /builds/{id}?include=preReleaseVersion');
        ownRefusal(t);
      },
    },
    {
      id: 'FR4.18',
      title: 'set-whats-new before 1.1.0 exists: "run create-version", exit 1',
      scenario: 'today',
      args: ['set-whats-new', '--file', files.whatsNewPadded, '--dry-run'],
      exit: 1,
      check: runCreateVersion,
    },
    {
      id: 'FR4.19',
      title: 'set-whats-new --file <empty file> exits 1, 0 writes',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--file', files.empty, '--dry-run'],
      exit: 1,
      check: (r, t) => ownRefusal(t),
    },
    {
      id: 'FR4.20',
      title: 'set-whats-new --file <whitespace-only file> exits 1, 0 writes',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--file', files.blank, '--dry-run'],
      exit: 1,
      check: (r, t) => ownRefusal(t),
    },
    {
      id: 'FR4.21',
      title: 'set-whats-new --file --dry-run: one PATCH on the en-US localization, whatsNew = trimmed file',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--file', files.whatsNewPadded, '--dry-run'],
      exit: 0,
      writes: [whatsNewWrite(F.WHATS_NEW_110)],
    },
    {
      id: 'FR4.22',
      title: 'set-whats-new <inline text> --dry-run: one PATCH with that text',
      scenario: 'v110-fresh',
      args: ['set-whats-new', 'Bug fixes and performance improvements.', '--dry-run'],
      exit: 0,
      writes: [whatsNewWrite('Bug fixes and performance improvements.')],
    },
    {
      id: 'FR4.23',
      title: 'set-whats-new over 4000 chars exits 1, 0 writes',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--file', files.over4000, '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/\b400[01]\b/, 'out', 'the refusal names the 4000-char limit or the length');
        ownRefusal(t);
      },
    },
    {
      id: 'FR4.24',
      title: 'set-whats-new of exactly 4000 chars is accepted',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--file', files.exactly4000, '--dry-run'],
      exit: 0,
      writes: [whatsNewWrite('x'.repeat(4000))],
    },
    {
      id: 'FR4.25',
      title: 'set-whats-new re-run with the same text: "= whatsNew unchanged", 0 writes',
      scenario: 'v110-prepped',
      args: ['set-whats-new', '--file', files.whatsNewPadded, '--dry-run'],
      exit: 0,
      check: (r, t) => t.has(/^= whatsNew unchanged/m, 'stdout'),
    },
    {
      id: 'FR4.26',
      title: 'set-whats-new with no en-US localization exits 1, 0 writes',
      scenario: 'v110-fresh+no-en-us',
      args: ['set-whats-new', '--file', files.whatsNewPadded, '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/en-US/),
    },
    {
      id: 'FR4.27',
      title: 'set-whats-new with no text and no --file exits 1, 0 writes',
      scenario: 'v110-fresh',
      args: ['set-whats-new', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/set-whats-new/),
    },
    {
      id: 'FR4.28',
      title: 'set-review-notes --dry-run: one PATCH with the granted-tense notes (rest of the text unchanged)',
      scenario: 'v110-fresh',
      args: ['set-review-notes', '--dry-run'],
      exit: 0,
      writes: [
        {
          method: 'PATCH',
          path: '/appStoreReviewDetails/asrd-110',
          body: { data: { type: 'appStoreReviewDetails', id: 'asrd-110', attributes: { notes: F.REVIEW_NOTES_NEW } } },
        },
      ],
    },
    {
      id: 'FR4.29',
      title: 'set-review-notes re-run: "= review notes unchanged", 0 writes',
      scenario: 'v110-prepped',
      args: ['set-review-notes', '--dry-run'],
      exit: 0,
      check: (r, t) => t.has(/^= review notes unchanged/m, 'stdout'),
    },
    {
      id: 'FR4.30',
      title: 'submit-app-review with no build id: usage, exit 1 (no auto-pick)',
      scenario: 'post-live',
      args: ['submit-app-review', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(/usage/i);
        t.has(/submit-app-review <buildId>/);
      },
    },
    {
      id: 'FR4.31',
      title: 'submit-app-review <build 17> before 1.1.0 exists: "run create-version", 0 writes',
      scenario: 'today',
      args: ['submit-app-review', 'bld-17', '--dry-run'],
      exit: 1,
      check: runCreateVersion,
    },
    {
      id: 'FR4.32',
      title: 'submit-app-review <build 17> once 18 is VALID: attach guard (d) refuses, 0 writes',
      scenario: 'v110-build18',
      args: ['submit-app-review', 'bld-17', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(/newer/i),
    },
    {
      id: 'FR4.33',
      title: 'submit-app-review <build 18> --dry-run (attached): "= build 18 already attached" + 3 submission writes',
      scenario: 'post-live',
      args: ['submit-app-review', 'bld-18', '--dry-run'],
      exit: 0,
      writes: submissionWrites,
      check: (r, t) => t.has(/^= build 18 already attached/m, 'stdout'),
    },
    {
      id: 'FR4.34',
      title: 'submit-app-review <build 18> --dry-run (not attached): attach PATCH + 3 submission writes',
      scenario: 'v110-build18',
      args: ['submit-app-review', 'bld-18', '--dry-run'],
      exit: 0,
      writes: [attach('asv-110', 'bld-18'), ...submissionWrites],
    },
    {
      id: 'FR4.35',
      title: 'check-submission after the FR7 writes shows releaseType, phased, copyright, whatsNew, URLs, socialMedia, rating',
      scenario: 'post-live',
      args: ['check-submission'],
      exit: 0,
      check: (r, t) => {
        t.has(/^Version 1\.1\.0: PREPARE_FOR_SUBMISSION\b/m, 'stdout');
        t.has(/^Attached build: v18 \(bld-18\)$/m, 'stdout');
        t.has(/^Review notes match Unlisted text: true$/m, 'stdout');
        t.has(/AFTER_APPROVAL/, 'stdout');
        t.has(/phased[^\n]*INACTIVE/i, 'stdout');
        t.has('2026 Jaime Alvarez', 'stdout');
        const flat = r.stdout.replace(/\s+/g, ' ');
        if (!flat.includes("• Managers: a new Team view in Overview lets you switch between")) t.fail('expected the en-US whatsNew (first 120 chars)');
        if (flat.includes('Privacy Policy and Support are now in Settings')) t.fail('whatsNew must be cut to its first 120 chars');
        for (const [k, u] of Object.entries(F.URLS)) if (!r.stdout.includes(u)) t.fail(`expected URLS.${k} (${u})`);
        t.has(/socialMedia\W+false/, 'stdout');
        t.has(/FOUR_PLUS/, 'stdout');
        t.has(/^ {2}rs-100 {2}state=COMPLETE/m, 'stdout');
        t.countLines(/^\s+rs-\S+\s+state=/, 1, 'stdout', 'no new review submission');
      },
    },
    {
      id: 'FR4.36',
      title: 'check-submission with no editable appInfo (today) still exits 0 and shows releaseType + phased none',
      scenario: 'today',
      args: ['check-submission'],
      exit: 0,
      check: (r, t) => {
        t.has(/MANUAL/, 'stdout');
        t.has(/phased[^\n]*\bnone\b/i, 'stdout');
      },
    },

    // ── FR5: compliance metadata ──
    {
      id: 'FR5.01',
      title: 'set-urls --dry-run before Pages is live: "URL not live: … -> 404 (finish spec 01 / OPS O2)", 0 writes',
      scenario: 'today',
      args: ['set-urls', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has(notLive);
        const m = r.out.match(notLive);
        if (m && !Object.values(F.URLS).includes(m[1])) t.fail(`refused URL ${m[1]} is not one of URLS.*`);
        if (m && m[2] !== '404') t.fail(`expected status 404, got ${m[2]}`);
      },
    },
    {
      id: 'FR5.02',
      title: 'set-urls --dry-run with Pages live but no 1.1.0: checks all 3 URLs, then "run create-version"',
      scenario: 'today+pages-live',
      args: ['set-urls', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        allPagesRequested(r, t);
        runCreateVersion(r, t);
      },
    },
    {
      id: 'FR5.03',
      title: 'set-urls --dry-run: 3 PATCHes (editable appInfo loc, version en-US loc, beta loc), values = URLS.*',
      scenario: 'v110-fresh',
      args: ['set-urls', '--dry-run'],
      exit: 0,
      unordered: true,
      writes: [
        { method: 'PATCH', path: '/appInfoLocalizations/ail-edit-en', type: 'appInfoLocalizations', id: 'ail-edit-en', attributes: { privacyPolicyUrl: F.URLS.privacy } },
        {
          method: 'PATCH',
          path: '/appStoreVersionLocalizations/asvl-110-en',
          type: 'appStoreVersionLocalizations',
          id: 'asvl-110-en',
          attributes: { supportUrl: F.URLS.support, marketingUrl: F.URLS.marketing },
        },
        { method: 'PATCH', path: '/betaAppLocalizations/bal-en', type: 'betaAppLocalizations', id: 'bal-en', attributes: { privacyPolicyUrl: F.URLS.privacy } },
      ],
      check: (r, t) => {
        allPagesRequested(r, t);
        t.notRequested(/\/appInfos\/ai-live\/appInfoLocalizations/, 'must target the editable appInfo');
      },
    },
    {
      id: 'FR5.03b',
      title: 'set-urls with two editable appInfos refuses before reading localizations',
      scenario: 'v110-fresh+two-editable-infos',
      args: ['set-urls', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        allPagesRequested(r, t);
        t.requested(/^\/v1\/apps\/6761698411\/appInfos\b/, 'getEditableAppInfo reads /apps/{id}/appInfos');
        t.notRequested(/appInfoLocalizations/, 'getEditableAppInfo must throw on more than one');
        ownRefusal(t);
      },
    },
    {
      id: 'FR5.04',
      title: 'set-urls sends only the fields that differ ("= … URLs unchanged" for the rest)',
      scenario: 'v110-fresh+partial-urls',
      args: ['set-urls', '--dry-run'],
      exit: 0,
      unordered: true,
      writes: [
        { method: 'PATCH', path: '/appStoreVersionLocalizations/asvl-110-en', type: 'appStoreVersionLocalizations', id: 'asvl-110-en', attributes: { marketingUrl: F.URLS.marketing } },
        { method: 'PATCH', path: '/betaAppLocalizations/bal-en', type: 'betaAppLocalizations', id: 'bal-en', attributes: { privacyPolicyUrl: F.URLS.privacy } },
      ],
      check: (r, t) => t.countLines(/^= .*URLs unchanged/, 1, 'stdout'),
    },
    {
      id: 'FR5.05',
      title: 'set-urls re-run after the live write: 3 "= … URLs unchanged", 0 writes',
      scenario: 'v110-prepped',
      args: ['set-urls', '--dry-run'],
      exit: 0,
      check: (r, t) => t.countLines(/^= .*URLs unchanged/, 3, 'stdout'),
    },
    {
      id: 'FR5.06',
      title: 'set-urls does not follow redirects: a 301 is "URL not live", 0 writes',
      scenario: 'v110-fresh+pages-redirect',
      args: ['set-urls', '--dry-run'],
      exit: 1,
      check: (r, t) => t.has(new RegExp(`URL not live: ${reEscape(F.URLS.support)} -> 301`)),
    },
    {
      id: 'FR5.07',
      title: 'no dead "hourglass/hourglassws" URLs remain (grep -c = 0)',
      run: () => {
        const n = (staticSource().match(/hourglass\/hourglassws/g) ?? []).length;
        return n === 0 ? [] : [`grep -c "hourglass/hourglassws" = ${n}, expected 0`];
      },
    },
    {
      id: 'FR5.08',
      title: 'set-beta-info / set-store-listing read their URLs from URLS.*',
      run: () => {
        const src = staticSource();
        const errs = [];
        const beta = functionBody(src, 'setBetaInfo') ?? '';
        const listing = functionBody(src, 'setStoreListing') ?? '';
        if (!/privacyPolicyUrl:\s*URLS\.privacy\b/.test(beta)) errs.push('setBetaInfo privacyPolicyUrl is not URLS.privacy');
        if (!/privacyPolicyUrl:\s*URLS\.privacy\b/.test(listing)) errs.push('setStoreListing privacyPolicyUrl is not URLS.privacy');
        if (!/supportUrl:\s*URLS\.support\b/.test(listing)) errs.push('setStoreListing supportUrl is not URLS.support');
        if (!/marketingUrl:\s*URLS\.marketing\b/.test(listing)) errs.push('setStoreListing marketingUrl is not URLS.marketing');
        return errs;
      },
    },
    {
      id: 'FR5.09',
      title: 'set-social-media-age-rating before 1.1.0 exists: "run create-version", exit 1',
      scenario: 'today',
      args: ['set-social-media-age-rating', '--dry-run'],
      exit: 1,
      check: runCreateVersion,
    },
    {
      id: 'FR5.10',
      title: 'set-social-media-age-rating --dry-run: shows socialMedia null, one PATCH {"socialMedia":false}, FOUR_PLUS, Brazil',
      scenario: 'v110-fresh',
      args: ['set-social-media-age-rating', '--dry-run'],
      exit: 0,
      writes: [{ method: 'PATCH', path: '/ageRatingDeclarations/ard-edit', type: 'ageRatingDeclarations', id: 'ard-edit', attributes: { socialMedia: false } }],
      check: (r, t) => {
        t.has(/socialMedia\W+null/, 'stdout');
        t.has(/FOUR_PLUS/, 'stdout');
        t.has(/SELF_RATED_L/, 'stdout', 'a /brazil/i attribute');
        t.requested(/^\/v1\/appInfos\/ai-edit\/ageRatingDeclaration\b/, 'editable appInfo');
        t.notRequested(/\/appInfos\/ai-live\/ageRatingDeclaration/, 'must not read the live appInfo');
      },
    },
    {
      id: 'FR5.11',
      title: 'set-social-media-age-rating re-run: "= socialMedia already false", 0 writes',
      scenario: 'v110-prepped',
      args: ['set-social-media-age-rating', '--dry-run'],
      exit: 0,
      check: (r, t) => {
        t.has(/^= socialMedia already false/m, 'stdout');
        t.has(/FOUR_PLUS/, 'stdout');
      },
    },
    {
      id: 'FR5.12',
      title: 'set-social-media-age-rating when the API has no socialMedia key: refuse, list keys, 0 writes',
      scenario: 'v110-fresh+no-socialmedia-key',
      args: ['set-social-media-age-rating', '--dry-run'],
      exit: 1,
      check: (r, t) => {
        t.has('socialMedia not exposed by the API; do OPS O3 in the ASC UI');
        t.has(/messagingAndChat/, 'out', 'the returned attribute keys are listed');
      },
    },
    {
      id: 'FR5.13',
      title: 'set-social-media-age-rating warns when the rating is not FOUR_PLUS (exit code not asserted)',
      scenario: 'v110-fresh+rating-nine-plus',
      args: ['set-social-media-age-rating', '--dry-run'],
      writes: [{ method: 'PATCH', path: '/ageRatingDeclarations/ard-edit', type: 'ageRatingDeclarations', id: 'ard-edit', attributes: { socialMedia: false } }],
      check: (r, t) => {
        t.has(/NINE_PLUS/);
        t.has(/warn|⚠/i);
      },
    },
  ];
}

// ── Self-test of the fake ASC and the transport ─────────────────────────────
function selfTest(workDir) {
  const { route } = require('./fake-asc');
  const errs = [];
  const expect = (cond, msg) => cond || errs.push(msg);
  const get = (s, p) => route(s, 'GET', new URL(`https://api.appstoreconnect.apple.com/v1${p}`));
  const used = makeCases({}).map((c) => c.scenario).filter(Boolean);
  for (const name of new Set([...F.SCENARIOS, ...used])) {
    try {
      F.buildState(name);
    } catch (e) {
      errs.push(`buildState(${name}): ${e.message}`);
    }
  }
  const today = F.buildState('today');
  expect(get(today, `/apps?filter[bundleId]=${F.BUNDLE_ID}`).body.data[0].id === A, 'apps by bundleId');
  expect(get(today, `/betaTesters?filter[apps]=${A}&limit=100`).body.data.length === 14, '14 testers today');
  expect(get(today, `/betaTesters?filter[apps]=${A}`).body.data.filter((x) => x.attributes.email === null).length === 12, '12 null-email testers');
  expect(get(today, `/apps/${A}/betaGroups`).body.data.length === 2, '2 beta groups');
  const b17 = get(today, '/builds/bld-17?include=preReleaseVersion').body;
  expect(b17.data.relationships.preReleaseVersion.data.id === 'prv-110' && b17.included[0].attributes.version === '1.1.0', 'build include=preReleaseVersion');
  expect(!get(today, '/builds/bld-17').body.data.relationships.preReleaseVersion.data, 'no relationship data without include');
  expect(get(today, `/builds?filter[app]=${A}&filter[preReleaseVersion.version]=1.1.0&filter[processingState]=VALID`).body.data.length === 2, 'builds filter by marketing version');
  expect(get(today, `/apps/${A}/appStoreVersions?filter[platform]=IOS`).body.data.length === 1, 'one version today');
  expect(get(today, '/appStoreVersions/asv-100/build').body.data.id === 'bld-15', '1.0 has build 15');
  expect(get(today, '/appStoreVersions/asv-100/appStoreVersionPhasedRelease').body.data === null, 'no phased on 1.0');
  expect(route(today, 'PATCH', new URL('https://api.appstoreconnect.apple.com/v1/betaGroups/bg-test')).blocked === true, 'PATCH blocked');
  expect(route(today, 'DELETE', new URL('https://api.appstoreconnect.apple.com/v1/betaTesters/x/relationships/apps')).blocked === true, 'DELETE blocked');
  expect(get(today, '/nope').unhandled === true, 'unknown GET is flagged unhandled');
  expect(route(today, 'GET', new URL(F.URLS.privacy)).status === 404, 'Pages 404 today');
  expect(Boolean(route(today, 'GET', new URL('https://example.com/')).networkError), 'other hosts fail');
  const fresh = F.buildState('v110-fresh');
  const infos = get(fresh, `/apps/${A}/appInfos`).body.data;
  expect(infos[0].id === 'ai-live' && infos[1].id === 'ai-edit', 'live appInfo listed before the editable one');
  expect(get(fresh, '/appInfos/ai-edit/ageRatingDeclaration').body.data.attributes.socialMedia === null, 'socialMedia null');
  expect(get(fresh, '/appStoreVersions/asv-110/appStoreVersionLocalizations').body.data[0].attributes.locale === 'en-GB', 'en-GB listed first');
  const live = F.buildState('post-live');
  expect(get(live, '/appStoreVersions/asv-110/build').body.data.id === 'bld-18', 'post-live: 18 attached');
  expect(get(live, '/appStoreVersions/asv-110/appStoreVersionPhasedRelease').body.data.attributes.phasedReleaseState === 'INACTIVE', 'post-live: phased INACTIVE');
  const forbidden = F.buildState('agreement-403');
  expect(get(forbidden, '/apps').body.errors[0].code === 'FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED', '403 body');
  expect(F.REVIEW_NOTES_NEW !== F.REVIEW_NOTES_OLD && F.REVIEW_NOTES_NEW.includes(F.NEW_UNLISTED_SENTENCE), 'notes replacement applies');

  // Transport: request/get/fetch go to the fake; raw sockets throw.
  const probe = `
    const https = require('https'); const net = require('net'); const out = {};
    const get = (fn) => new Promise((res) => fn((r) => { let b=''; r.on('data', c => b += c); r.on('end', () => res({ s: r.statusCode, b })); }));
    (async () => {
      out.request = await get((cb) => https.request({ hostname: 'api.appstoreconnect.apple.com', path: '/v1/apps?filter[bundleId]=${F.BUNDLE_ID}', method: 'GET' }, cb).end());
      out.get = await get((cb) => https.get('${F.URLS.privacy}', cb));
      out.patch = await get((cb) => { const q = https.request({ hostname: 'api.appstoreconnect.apple.com', path: '/v1/betaGroups/bg-test', method: 'PATCH' }, cb); q.write('{}'); q.end(); });
      out.fetchManual = (await fetch('${F.URLS.support}', { redirect: 'manual' })).status;
      out.fetchFollow = (await fetch('${F.URLS.support}')).status;
      try { net.connect(443, 'example.com'); out.net = 'connected'; } catch (e) { out.net = 'blocked'; }
      try { await fetch('https://example.com/'); out.otherHost = 'reached'; } catch (e) { out.otherHost = 'blocked'; }
      try { require('child_process').execSync('echo hi'); out.child = 'ran'; } catch (e) { out.child = 'blocked'; }
      console.log(JSON.stringify(out));
    })();`;
  const logFile = path.join(workDir, 'self-test.jsonl');
  const r = spawnSync(process.execPath, ['-r', MOCK, '-e', probe], {
    env: { ...process.env, ASC_MOCK_SCENARIO: 'v110-fresh+pages-redirect', ASC_MOCK_LOG: logFile },
    encoding: 'utf8',
    timeout: 20000,
  });
  let out = {};
  try {
    out = JSON.parse(r.stdout.trim().split('\n').pop());
  } catch {
    errs.push(`transport probe failed: ${r.stderr || r.stdout}`);
  }
  expect(out.request?.s === 200 && JSON.parse(out.request.b).data[0].id === A, 'https.request reaches the fake ASC');
  expect(out.get?.s === 200, 'https.get reaches the fake Pages host');
  expect(out.patch?.s === 403, 'PATCH answered with an error');
  expect(out.fetchManual === 301 && out.fetchFollow === 200, 'fetch honors redirect: manual vs follow');
  expect(out.net === 'blocked' && out.otherHost === 'blocked', 'raw sockets and other hosts are blocked');
  expect(out.child === 'blocked', 'child processes are blocked');
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  expect(/"blocked":true/.test(log), 'blocked PATCH is logged');
  const failClosed = spawnSync(process.execPath, ['-r', MOCK, '-e', 'console.log("ran")'], {
    env: { ...process.env, ASC_MOCK_SCENARIO: '' },
    encoding: 'utf8',
  });
  expect(failClosed.status !== 0 && !/ran/.test(failClosed.stdout), 'preload refuses to run without ASC_MOCK_SCENARIO');
  return errs;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-offline-'));
  try {
    if (flag('--self-test')) {
      const errs = selfTest(workDir);
      for (const e of errs) console.log(`FAIL  self-test: ${e}`);
      console.log(errs.length ? `\nself-test: ${errs.length} failure(s)` : 'self-test: OK');
      return errs.length ? 1 : 0;
    }
    const files = {
      empty: path.join(workDir, 'empty.txt'),
      blank: path.join(workDir, 'blank.txt'),
      whatsNewPadded: path.join(workDir, 'whats-new-padded.txt'),
      exactly4000: path.join(workDir, 'exactly-4000.txt'),
      over4000: path.join(workDir, 'over-4000.txt'),
    };
    fs.writeFileSync(files.empty, '');
    fs.writeFileSync(files.blank, '  \n\t\n  ');
    fs.writeFileSync(files.whatsNewPadded, `\n\n  ${F.WHATS_NEW_110}  \n\n`);
    fs.writeFileSync(files.exactly4000, `${'x'.repeat(4000)}\n`);
    fs.writeFileSync(files.over4000, 'x'.repeat(4001));

    const only = opt('--only');
    const cases = makeCases(files).filter((c) => !only || c.id.includes(only) || c.title.includes(only));
    if (flag('--list')) {
      for (const c of cases) console.log(`${c.id.padEnd(8)} ${c.characterization ? '[char] ' : ''}${c.title}`);
      return 0;
    }
    if (!fs.existsSync(TARGET)) {
      console.error(`asc.js not found at ${TARGET}. Pass --target /Users/Trilogy/Documents/Claude Code/WS/hourglassws/.appstore/asc.js`);
      return 2;
    }
    console.log(`target: ${TARGET}\n`);
    let pass = 0;
    let fail = 0;
    let charFail = 0;
    let unexpectedPass = 0;
    for (const c of cases) {
      let errs;
      let r;
      if (c.run) errs = c.run();
      else {
        r = runAsc(c.scenario, c.args, workDir, c.id);
        errs = evaluate(c, r);
      }
      const ok = errs.length === 0;
      if (ok) pass++;
      else fail++;
      if (!ok && c.characterization) charFail++;
      if (ok && !c.characterization) unexpectedPass++;
      const label = `${ok ? 'PASS' : 'FAIL'}  ${c.id.padEnd(7)} ${c.characterization ? '[char] ' : ''}${c.title}`;
      console.log(label);
      if (!ok) for (const e of errs) console.log(`        - ${e}`);
      if (r && (flag('--transcripts') || (!ok && flag('--verbose')))) {
        const cmd = `ASC_TRACE=1 node .appstore/asc.js ${c.args.join(' ')}   # fixture: ${c.scenario}, exit ${r.status}`;
        const indent = (s) => s.trimEnd().split('\n').map((l) => `        | ${l}`).join('\n');
        console.log(`        $ ${cmd}\n${indent(r.stdout)}\n${r.stderr.trim() ? `${indent(r.stderr)}\n` : ''}`);
      }
    }
    console.log(`\n${pass} passed, ${fail} failed (${cases.length} cases, ${cases.filter((c) => c.characterization).length} characterization)`);
    if (flag('--red')) {
      const okRed = charFail === 0 && unexpectedPass === 0;
      console.log(
        okRed
          ? 'red phase OK: every characterization case passes and every behaviour case fails'
          : `red phase NOT OK: ${charFail} characterization failure(s), ${unexpectedPass} behaviour case(s) already passing`,
      );
      return okRed ? 0 : 1;
    }
    return fail ? 1 : 0;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

process.exitCode = main();
