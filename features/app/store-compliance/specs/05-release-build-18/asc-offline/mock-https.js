// Preload for `node -r mock-https.js .appstore/asc.js …`. Replaces https/http request/get, fetch, raw
// socket connects and child processes, so asc.js runs against an in-memory App Store Connect built from
// fixtures.js and nothing reaches the network. Every non-GET/HEAD request is answered with an
// error and logged as `blocked`; check.js fails any case that has one.
//
// Env: ASC_MOCK_SCENARIO (required, e.g. "v110-fresh+no-en-us"), ASC_MOCK_LOG (JSONL request log).

const { Buffer } = require('buffer');
const fs = require('fs');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const fixtures = require('./fixtures');
const { route } = require('./fake-asc');

function install() {
  const scenario = process.env.ASC_MOCK_SCENARIO;
  if (!scenario) throw new Error('mock-https.js: ASC_MOCK_SCENARIO is required');
  const state = fixtures.buildState(scenario);
  const logFile = process.env.ASC_MOCK_LOG;
  const log = (entry) => logFile && fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`);
  log({ event: 'mock-loaded', scenario, pid: process.pid });

  const parseBody = (text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  function respond(method, url, bodyText) {
    const r = route(state, method, url);
    log({
      host: url.hostname,
      method,
      path: url.pathname + url.search,
      body: parseBody(bodyText),
      status: r.status ?? null,
      ...(r.blocked ? { blocked: true } : {}),
      ...(r.unhandled ? { unhandled: true } : {}),
      ...(r.networkError ? { networkError: r.networkError } : {}),
    });
    return r;
  }

  function fakeRequest(protocol, ...args) {
    let url;
    let options = {};
    let cb;
    if (typeof args[0] === 'string' || args[0] instanceof URL) {
      url = new URL(String(args[0]));
      if (typeof args[1] === 'function') cb = args[1];
      else {
        options = args[1] ?? {};
        cb = args[2];
      }
    } else {
      options = args[0] ?? {};
      cb = args[1];
      const host = options.hostname ?? String(options.host ?? 'localhost').split(':')[0];
      url = new URL(`${protocol}//${host}${options.path ?? '/'}`);
    }
    const method = String(options.method ?? 'GET').toUpperCase();
    const req = new EventEmitter();
    const chunks = [];
    let ended = false;
    Object.assign(req, {
      method,
      path: url.pathname + url.search,
      write(chunk) {
        if (chunk != null) chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk) {
        if (typeof chunk !== 'function') req.write(chunk);
        if (ended) return req;
        ended = true;
        setImmediate(() => {
          const r = respond(method, url, Buffer.concat(chunks).toString('utf8'));
          if (r.networkError) {
            req.emit('error', Object.assign(new Error(r.networkError), { code: 'ENOTFOUND' }));
            return;
          }
          const res = new PassThrough();
          res.statusCode = r.status;
          res.statusMessage = String(r.status);
          res.headers = r.headers;
          req.emit('response', res);
          res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body));
        });
        return req;
      },
      setTimeout: () => req,
      setHeader: () => {},
      getHeader: () => undefined,
      removeHeader: () => {},
      flushHeaders: () => {},
      destroy: () => req,
      abort: () => {},
    });
    if (cb) req.once('response', cb);
    return req;
  }

  for (const [modName, protocol] of [
    ['https', 'https:'],
    ['http', 'http:'],
  ]) {
    const mod = require(modName);
    mod.request = (...a) => fakeRequest(protocol, ...a);
    mod.get = (...a) => fakeRequest(protocol, ...a).end();
  }

  globalThis.fetch = async (input, init = {}) => {
    let url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const method = String(init.method ?? input?.method ?? 'GET').toUpperCase();
    let r = respond(method, url, init.body == null ? '' : String(init.body));
    for (let hops = 0; r.status >= 300 && r.status < 400 && r.headers?.location && hops < 5; hops++) {
      if (init.redirect === 'manual') break;
      if (init.redirect === 'error') throw new TypeError('fetch failed: redirect');
      url = new URL(r.headers.location, url);
      r = respond('GET', url, '');
    }
    if (r.networkError) throw new TypeError(`fetch failed: ${r.networkError}`);
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(r.status === 204 ? null : text, { status: r.status, headers: r.headers });
  };

  const refuse = () => {
    throw new Error('offline harness: raw socket connections are blocked');
  };
  const net = require('net');
  const tls = require('tls');
  net.connect = refuse;
  net.createConnection = refuse;
  tls.connect = refuse;
  // A shell-out (e.g. curl for the URL check) would bypass the fakes.
  const cp = require('child_process');
  for (const k of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    cp[k] = () => {
      throw new Error('offline harness: child processes are blocked');
    };
  }
}

// Fail closed: loading this file always installs the fakes, and throws without a scenario.
install();
