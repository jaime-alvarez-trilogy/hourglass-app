#!/usr/bin/env node
// Offline unit check of asc.js's transport layer: request(), api(), write().
//
// check.js runs whole commands, and only with --dry-run, so write()'s live branch (send, then
// throw on status >= 400 or body.errors) never runs there. This file evaluates asc.js in a vm
// sandbox with argv [node, asc.js] and no command, so the dispatcher only prints its usage. Then
// it calls the transport functions directly against a stub `https` whose request() answers from
// a canned list. No asc.js command is dispatched, and nothing can leave the process: the sandbox
// has no fetch, and its require() refuses http, http2, net, tls, dgram and child_process.
//
// Usage: node write-path.js --target <path/to/.appstore/asc.js>   (exit 1 on any failure)

const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');

const argv = process.argv.slice(2);
const i = argv.indexOf('--target');
const TARGET = path.resolve(i >= 0 ? argv[i + 1] : process.env.ASC_JS ?? '.appstore/asc.js');
const BLOCKED = new Set(['http', 'http2', 'net', 'tls', 'dgram', 'child_process', 'undici']);

function load({ dryRun = false, trace = false, replies = [] } = {}) {
  const calls = [];
  const stdout = [];
  const stderr = [];
  const stubHttps = {
    request(opts, cb) {
      const req = new EventEmitter();
      const chunks = [];
      Object.assign(req, {
        write: (c) => chunks.push(String(c)),
        setTimeout: () => req,
        destroy: () => req,
        end() {
          const reply = replies.shift() ?? { status: 599, raw: 'no canned reply left' };
          calls.push({ method: opts.method, hostname: opts.hostname, path: opts.path, headers: opts.headers, body: chunks.join('') });
          setImmediate(() => {
            const res = new PassThrough();
            res.statusCode = reply.status;
            cb(res);
            res.end(reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)));
          });
          return req;
        },
      });
      return req;
    },
    get() {
      throw new Error('stub https.get is not expected in this check');
    },
  };
  const sandboxRequire = (name) => {
    const bare = String(name).replace(/^node:/, '');
    if (bare === 'https') return stubHttps;
    if (BLOCKED.has(bare)) throw new Error(`write-path.js: require('${name}') is blocked`);
    return require(bare);
  };
  const ctx = vm.createContext({
    require: sandboxRequire,
    Buffer,
    URL,
    setImmediate,
    setTimeout,
    clearTimeout,
    console: { log: (...a) => stdout.push(a.join(' ')), error: (...a) => stderr.push(a.join(' ')) },
    process: {
      argv: [process.execPath, TARGET, ...(dryRun ? ['--dry-run'] : [])],
      env: trace ? { ASC_TRACE: '1' } : {},
      stderr: { write: (s) => stderr.push(String(s).replace(/\n$/, '')) },
      exitCode: undefined,
    },
    __dirname: path.dirname(TARGET),
    __filename: TARGET,
  });
  vm.runInContext(fs.readFileSync(TARGET, 'utf8').replace(/^#!.*/, ''), ctx, { filename: TARGET });
  return { calls, stdout, stderr, run: (code) => vm.runInContext(code, ctx) };
}

const BODY = { data: { type: 'betaGroups', id: 'bg-test', attributes: { publicLinkEnabled: false } } };
const ERR409 = {
  errors: [{ status: '409', code: 'ENTITY_ERROR.ATTRIBUTE.INVALID', title: 'An attribute value is invalid.', detail: 'publicLinkEnabled is not allowed here' }],
};

async function settle(promise) {
  try {
    return { value: await promise };
  } catch (e) {
    return { error: e?.message ?? String(e) };
  }
}

const cases = [
  {
    id: 'W.01',
    title: 'loading asc.js with no command dispatches nothing (usage only, exitCode 1, 0 requests)',
    run: async () => {
      const sb = load();
      const errs = [];
      if (sb.calls.length) errs.push(`expected 0 requests, got ${sb.calls.length}`);
      if (!sb.stdout.join('\n').includes('Usage: node .appstore/asc.js')) errs.push('expected the usage text');
      if (sb.run('process.exitCode') !== 1) errs.push(`exitCode ${sb.run('process.exitCode')}, expected 1`);
      return errs;
    },
  },
  {
    id: 'W.02',
    title: 'live write() 200: sends method, /v1 path, compact JSON body, auth + JSON headers; resolves the body',
    run: async () => {
      const sb = load({ replies: [{ status: 200, body: { data: { type: 'betaGroups', id: 'bg-test' } } }] });
      const r = await settle(sb.run(`write('PATCH', '/betaGroups/bg-test', ${JSON.stringify(BODY)})`));
      const c = sb.calls[0] ?? {};
      const errs = [];
      if (r.error) errs.push(`rejected: ${r.error}`);
      else if (r.value?.data?.id !== 'bg-test') errs.push(`resolved ${JSON.stringify(r.value)}, expected the response body`);
      if (sb.calls.length !== 1) errs.push(`expected 1 request, got ${sb.calls.length}`);
      if (c.method !== 'PATCH' || c.hostname !== 'api.appstoreconnect.apple.com' || c.path !== '/v1/betaGroups/bg-test') {
        errs.push(`sent ${c.method} ${c.hostname}${c.path}`);
      }
      if (c.body !== JSON.stringify(BODY)) errs.push(`body ${c.body}`);
      if (c.headers?.['Content-Type'] !== 'application/json') errs.push('Content-Type is not application/json');
      if (!/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(c.headers?.Authorization ?? '')) errs.push('Authorization is not a Bearer JWT');
      if (c.headers?.['Content-Length'] !== Buffer.byteLength(JSON.stringify(BODY))) errs.push('Content-Length mismatch');
      if (sb.stdout.some((l) => l.startsWith('[dry-run]'))) errs.push('a live write printed a [dry-run] line');
      return errs;
    },
  },
  {
    id: 'W.03',
    title: 'live write() 204 with an empty body resolves (DELETE relationship)',
    run: async () => {
      const sb = load({ replies: [{ status: 204, raw: '' }] });
      const r = await settle(sb.run(`write('DELETE', '/betaTesters/bt-1/relationships/apps', { data: [{ type: 'apps', id: '6761698411' }] })`));
      return r.error ? [`rejected: ${r.error}`] : sb.calls[0]?.method === 'DELETE' ? [] : ['no DELETE sent'];
    },
  },
  {
    id: 'W.04',
    title: 'live write() 409 with errors throws "<METHOD> <path> failed: ASC API error: 409 <code> — <title> (<detail>)"',
    run: async () => {
      const sb = load({ replies: [{ status: 409, body: ERR409 }] });
      const r = await settle(sb.run(`write('PATCH', '/betaGroups/bg-test', ${JSON.stringify(BODY)})`));
      const want = 'PATCH /betaGroups/bg-test failed: ASC API error: 409 ENTITY_ERROR.ATTRIBUTE.INVALID — An attribute value is invalid. (publicLinkEnabled is not allowed here)';
      return r.error === want ? [] : [`got ${JSON.stringify(r.error ?? r.value)}, expected rejection ${JSON.stringify(want)}`];
    },
  },
  {
    id: 'W.05',
    title: 'live write() 200 whose body carries errors still throws',
    run: async () => {
      const sb = load({ replies: [{ status: 200, body: ERR409 }] });
      const r = await settle(sb.run(`write('POST', '/appStoreVersions', { data: {} })`));
      return /^POST \/appStoreVersions failed: ASC API error: 200 ENTITY_ERROR/.test(r.error ?? '') ? [] : [`got ${JSON.stringify(r)}`];
    },
  },
  {
    id: 'W.06',
    title: 'live write() 500 with a non-JSON body throws with the status and the start of the body',
    run: async () => {
      const sb = load({ replies: [{ status: 500, raw: '<html>Internal Server Error</html>' }] });
      const r = await settle(sb.run(`write('PATCH', '/appStoreVersionLocalizations/l1', { data: {} })`));
      return /failed: ASC API error: 500 — <html>Internal Server Error/.test(r.error ?? '') ? [] : [`got ${JSON.stringify(r)}`];
    },
  },
  {
    id: 'W.07',
    title: 'request() resolves { status, body }; api() keeps its contract and resolves only the body',
    run: async () => {
      const reply = { status: 200, body: { data: [{ id: 'x' }] } };
      const sb = load({ replies: [reply, reply] });
      const r1 = await settle(sb.run(`request('GET', '/apps')`));
      const r2 = await settle(sb.run(`api('GET', '/apps')`));
      const errs = [];
      if (r1.value?.status !== 200 || r1.value?.body?.data?.[0]?.id !== 'x') errs.push(`request() resolved ${JSON.stringify(r1)}`);
      if (r2.value?.data?.[0]?.id !== 'x' || 'status' in (r2.value ?? {})) errs.push(`api() resolved ${JSON.stringify(r2)}`);
      return errs;
    },
  },
  {
    id: 'W.08',
    title: 'ASC_TRACE=1: request() logs "[http] <METHOD> <path> -> <status>" to stderr, write errors included',
    run: async () => {
      const sb = load({ trace: true, replies: [{ status: 409, body: ERR409 }] });
      await settle(sb.run(`write('PATCH', '/betaGroups/bg-test', ${JSON.stringify(BODY)})`));
      return sb.stderr.includes('[http] PATCH /v1/betaGroups/bg-test -> 409') ? [] : [`stderr: ${JSON.stringify(sb.stderr)}`];
    },
  },
  {
    id: 'W.09',
    title: '--dry-run: write() prints "[dry-run] <METHOD> <path> <json>", resolves null, sends nothing',
    run: async () => {
      const sb = load({ dryRun: true });
      const r = await settle(sb.run(`write('PATCH', '/betaGroups/bg-test', ${JSON.stringify(BODY)})`));
      const errs = [];
      if (r.error || r.value !== null) errs.push(`settled ${JSON.stringify(r)}, expected null`);
      if (sb.calls.length) errs.push(`sent ${sb.calls.length} request(s)`);
      if (!sb.stdout.includes(`[dry-run] PATCH /betaGroups/bg-test ${JSON.stringify(BODY)}`)) errs.push(`stdout: ${JSON.stringify(sb.stdout)}`);
      return errs;
    },
  },
  {
    id: 'W.10',
    title: '--dry-run backstop: request() refuses POST/PATCH/DELETE before sending, still sends GET',
    run: async () => {
      const sb = load({ dryRun: true, replies: [{ status: 200, body: { data: [] } }] });
      const errs = [];
      for (const m of ['POST', 'PATCH', 'DELETE']) {
        const r = await settle(sb.run(`request('${m}', '/x', { data: {} })`));
        if (!new RegExp(`^Refusing ${m} in --dry-run`).test(r.error ?? '')) errs.push(`${m}: ${JSON.stringify(r)}`);
      }
      if (sb.calls.length) errs.push(`sent ${sb.calls.length} non-GET request(s)`);
      const g = await settle(sb.run(`request('GET', '/apps')`));
      if (g.value?.status !== 200 || sb.calls.length !== 1 || sb.calls[0].method !== 'GET') errs.push(`GET under --dry-run: ${JSON.stringify(g)}`);
      return errs;
    },
  },
];

async function main() {
  if (!fs.existsSync(TARGET)) {
    console.error(`asc.js not found at ${TARGET}. Pass --target <path/to/.appstore/asc.js>`);
    return 2;
  }
  console.log(`target: ${TARGET}\n`);
  let fail = 0;
  for (const c of cases) {
    let errs;
    try {
      errs = await c.run();
    } catch (e) {
      errs = [`threw: ${e?.stack ?? e}`];
    }
    console.log(`${errs.length ? 'FAIL' : 'PASS'}  ${c.id}  ${c.title}`);
    for (const e of errs) console.log(`        - ${e}`);
    if (errs.length) fail++;
  }
  console.log(`\n${cases.length - fail} passed, ${fail} failed (${cases.length} cases)`);
  return fail ? 1 : 0;
}

main().then((code) => {
  process.exitCode = code;
});
