// 01-legal-pages FR6: scripts/check-legal-pages.sh — post-deploy verification of the
// three public legal-page URLs used by App Store Connect.
//
// Harness: each case starts a Node http server on 127.0.0.1:0 and runs the real script
// with child_process.execFile against it. Nothing touches the real network.
// Fixtures are the real site/ files (happy path) or single-defect variants of them.

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/check-legal-pages.sh');
const SITE = path.join(ROOT, 'site');
const PREFIX = '/hourglass-app';

jest.setTimeout(20_000);

// truncate: send the status line and half the body, then drop the connection (curl exits 18).
type Reply = { status: number; body?: string; headers?: Record<string, string>; truncate?: boolean };
type Handler = (pathname: string, query: URLSearchParams) => Reply;

const servers: http.Server[] = [];
const tmpRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) => {
          s.closeAllConnections();
          s.close(() => resolve());
        }),
    ),
  );
  for (const dir of tmpRoots.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Requests the script made, as "pathname?query". */
type Started = { port: number; base: string; requests: string[] };

async function startServer(handler: Handler): Promise<Started> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push(url.pathname + url.search);
    const reply = handler(url.pathname, url.searchParams);
    if (reply.truncate) {
      const body = Buffer.from(reply.body ?? '');
      res.writeHead(reply.status, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(body.length),
        ...reply.headers,
      });
      res.write(body.subarray(0, Math.floor(body.length / 2)), () => res.destroy());
      return;
    }
    res.writeHead(reply.status, { 'content-type': 'text/html; charset=utf-8', ...reply.headers });
    res.end(reply.body ?? '');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, base: `http://127.0.0.1:${port}${PREFIX}`, requests };
}

/** A port that nothing listens on: bind :0, read the port, close. */
async function closedPort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function readSitePage(name: string): string {
  const file = path.join(SITE, name);
  if (!fs.existsSync(file)) throw new Error(`site/${name} does not exist`);
  return fs.readFileSync(file, 'utf8');
}

/** Serves site/ files under /hourglass-app/ like GitHub Pages; `overrides` replaces a page body. */
function sitePages(overrides: Partial<Record<string, string>> = {}): Handler {
  return (pathname) => {
    if (!pathname.startsWith(`${PREFIX}/`)) return { status: 404, body: 'Not Found' };
    let name = pathname.slice(PREFIX.length + 1);
    if (name === '') name = 'index.html';
    if (overrides[name] !== undefined) return { status: 200, body: overrides[name] };
    if (!/^[\w-]+\.html$/.test(name) || !fs.existsSync(path.join(SITE, name))) {
      return { status: 404, body: 'Not Found' };
    }
    return { status: 200, body: readSitePage(name) };
  };
}

type Run = {
  code: number | string | null;
  killed: boolean;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  output: string;
  stdoutLines: string[];
};

function runScript(args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      SCRIPT,
      args,
      {
        timeout: 15_000,
        env: {
          ...process.env,
          // Never route the loopback fixtures through a developer/CI proxy.
          NO_PROXY: '127.0.0.1,localhost',
          no_proxy: '127.0.0.1,localhost',
          ...env,
        },
      },
      (error, stdout, stderr) => {
        resolve({
          // Exit status on non-zero exit; 'ENOENT'/'EACCES' if the script cannot be spawned.
          code: error ? (error.code ?? null) : 0,
          killed: Boolean(error?.killed),
          signal: (error?.signal ?? null) as NodeJS.Signals | null,
          stdout,
          stderr,
          output: `${stdout}\n${stderr}`,
          stdoutLines: stdout.split('\n').filter((l) => l.length > 0),
        });
      },
    );
  });
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('FR6: scripts/check-legal-pages.sh', () => {
  it('FR6 (a): real site/ served under /hourglass-app/ → exit 0 with three PASS lines', async () => {
    const srv = await startServer(sitePages());
    const run = await runScript([srv.base]);
    expect(run.code).toBe(0);
    expect(run.stdoutLines).toEqual([
      'PASS index',
      'PASS privacy',
      'PASS support',
      `All legal page checks passed for ${srv.base}`,
    ]);
    // Exactly the three public paths, index requested with its trailing slash; no probes on success.
    expect(srv.requests).toEqual([
      `${PREFIX}/`,
      `${PREFIX}/privacy-policy.html`,
      `${PREFIX}/support.html`,
    ]);
  });

  it('FR6 (b): one trailing slash on BASE_URL is stripped → exit 0', async () => {
    const srv = await startServer(sitePages());
    const run = await runScript([`${srv.base}/`]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('PASS index');
    expect(run.stdout).toContain('PASS privacy');
    expect(run.stdout).toContain('PASS support');
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `All legal page checks passed for ${srv.base}`,
    );
    expect(srv.requests.some((r) => r.includes('//'))).toBe(false);
  });

  it('FR6 (c): every path 404 → exit 1, three HTTP 404 FAILs and the OPS O2 hint once', async () => {
    const srv = await startServer(() => ({ status: 404, body: 'Not Found' }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('FAIL index: HTTP 404');
    expect(run.stdout).toContain('FAIL privacy: HTTP 404');
    expect(run.stdout).toContain('FAIL support: HTTP 404');
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `3 legal page check(s) failed for ${srv.base}`,
    );
    expect(run.output).toContain('OPS O2');
    expect(run.output).toContain('build_type=workflow');
    expect(run.output).toContain('gh workflow run pages.yml --ref main');
    expect(count(run.output, 'OPS O2')).toBe(1);
    expect(run.output).not.toContain('cached');
  });

  it('FR6 (d): privacy body still has the false "user accounts or databases" claim → FAIL privacy only', async () => {
    const tainted = readSitePage('privacy-policy.html').replace(
      '</ul>',
      '  <li>We do not operate any user accounts or databases</li>\n    </ul>',
    );
    expect(tainted).toContain('user accounts or databases');
    const srv = await startServer(sitePages({ 'privacy-policy.html': tainted }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain(
      'FAIL privacy: contains forbidden "user accounts or databases"',
    );
    // All three checks still run.
    expect(run.stdoutLines).toContain('PASS index');
    expect(run.stdoutLines).toContain('PASS support');
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `1 legal page check(s) failed for ${srv.base}`,
    );
    // A content failure on a 200 is not a deployment problem: no hint.
    expect(run.output).not.toContain('HINT');
  });

  it('FR6 (d2): privacy body missing the retention section → FAIL privacy: missing "Data Retention"', async () => {
    const stale = readSitePage('privacy-policy.html').split('Data Retention').join('Data Handling');
    const srv = await startServer(sitePages({ 'privacy-policy.html': stale }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain('FAIL privacy: missing "Data Retention"');
    expect(run.stdoutLines).toContain('PASS index');
    expect(run.stdoutLines).toContain('PASS support');
  });

  // Build-18 re-review: the silent push never reaches JS on iOS, so a deployed page that still
  // promises background widget refresh is stale.
  it('FR6 (d3): privacy body still claims the push keeps the widget up to date → FAIL privacy', async () => {
    const stale = readSitePage('privacy-policy.html').replace(
      'Hourglass includes a lightweight background ping service',
      'Hourglass uses a lightweight background ping mechanism to keep your home screen widget up to date. Hourglass includes a lightweight background ping service',
    );
    expect(stale).toContain('to keep your home screen widget up to date');
    const srv = await startServer(sitePages({ 'privacy-policy.html': stale }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain(
      'FAIL privacy: contains forbidden "to keep your home screen widget up to date"',
    );
    expect(run.stdoutLines).toContain('PASS support');
  });

  it('FR6 (e0): support FAQ still claims background widget updates → FAIL support', async () => {
    const stale = readSitePage('support.html').replace(
      'After that, the widget updates each time you open the app.',
      'After that, the widget updates when you open the app and in the background when iOS allows it.',
    );
    expect(stale).toContain('in the background when iOS allows it');
    const srv = await startServer(sitePages({ 'support.html': stale }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain(
      'FAIL support: contains forbidden "in the background when iOS allows it"',
    );
    expect(run.stdoutLines).toContain('PASS privacy');
  });

  // Build-18 final review: "Internal tool for Crossover employees" contradicted the footer's
  // non-affiliation disclaimer, so a deployed page that still says it is stale.
  it('FR6 (e1): any page still calling Hourglass a "tool for Crossover employees" → FAIL that page', async () => {
    const OLD_FOOTER_PHRASE = 'Internal tool for Crossover employees';
    const NEW_FOOTER_PHRASE = 'A companion tool for people who work through Crossover';
    const stale = (name: string) => {
      const html = readSitePage(name);
      expect(html).toContain(NEW_FOOTER_PHRASE);
      return html.split(NEW_FOOTER_PHRASE).join(OLD_FOOTER_PHRASE);
    };
    const srv = await startServer(
      sitePages({
        'index.html': stale('index.html'),
        'privacy-policy.html': stale('privacy-policy.html'),
        'support.html': stale('support.html'),
      }),
    );
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    for (const name of ['index', 'privacy', 'support']) {
      expect(run.stdoutLines).toContain(
        `FAIL ${name}: contains forbidden "tool for Crossover employees"`,
      );
    }
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `3 legal page check(s) failed for ${srv.base}`,
    );
    expect(run.output).not.toContain('HINT');
  });

  it('FR6 (e): support page without the contact mailto → exit 1 with FAIL support', async () => {
    const noMailto = readSitePage('support.html')
      .split('mailto:jaime.alvarez@trilogy.com')
      .join('mailto:someone-else@example.com');
    expect(noMailto).not.toContain('mailto:jaime.alvarez@trilogy.com');
    const srv = await startServer(sitePages({ 'support.html': noMailto }));
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain('FAIL support: missing "mailto:jaime.alvarez@trilogy.com"');
    expect(run.stdoutLines).toContain('PASS index');
    expect(run.stdoutLines).toContain('PASS privacy');
  });

  it('FR6 (f): index answers 301 (to a page that would pass) → exit 1 with FAIL index; redirects not followed', async () => {
    const pages = sitePages();
    const srv = await startServer((pathname, query) =>
      pathname === `${PREFIX}/`
        ? { status: 301, headers: { Location: `${PREFIX}/index.html` } }
        : pages(pathname, query),
    );
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain('FAIL index: HTTP 301');
    expect(run.stdoutLines).toContain('PASS privacy');
    expect(run.stdoutLines).toContain('PASS support');
    expect(srv.requests).not.toContain(`${PREFIX}/index.html`);
  });

  it('FR6 (g): exact URL 404 but ?cb= 200 → exit 1 with the cached-CDN hint, not OPS O2', async () => {
    const pages = sitePages();
    const srv = await startServer((pathname, query) =>
      query.has('cb') ? pages(pathname, query) : { status: 404, body: 'Not Found' },
    );
    const run = await runScript([srv.base]);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain('FAIL index: HTTP 404');
    expect(run.stdout).toContain('FAIL privacy: HTTP 404');
    expect(run.stdout).toContain('FAIL support: HTTP 404');
    expect(run.output).toContain('cached');
    expect(run.output).toContain(`${srv.base}/privacy-policy.html is served by origin`);
    expect(run.output).not.toContain('OPS O2');
    // The cache-busting probe uses an epoch-seconds value.
    const probes = srv.requests.filter((r) => r.includes('?cb='));
    expect(probes).toHaveLength(3);
    for (const probe of probes) expect(probe).toMatch(/\?cb=\d{9,}$/);
  });

  it('FR6 (h): closed port → exit 1 reporting HTTP 000, without hanging or crashing', async () => {
    const port = await closedPort();
    const base = `http://127.0.0.1:${port}${PREFIX}`;
    const run = await runScript([base]);
    expect(run.killed).toBe(false);
    expect(run.signal).toBeNull();
    expect(run.code).toBe(1);
    expect(run.output).toContain('000');
    expect(run.stdout).toContain('FAIL index: HTTP 000');
    expect(run.stdout).toContain('FAIL privacy: HTTP 000');
    expect(run.stdout).toContain('FAIL support: HTTP 000');
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `3 legal page check(s) failed for ${base}`,
    );
  });

  it('FR6 (h2): 200 status line then a dropped connection → FAIL HTTP 000, not a misleading content failure', async () => {
    const pages = sitePages();
    const srv = await startServer((pathname, query) => {
      const reply = pages(pathname, query);
      // Only the exact policy URL drops; the ?cb= probe gets the full page.
      return pathname === `${PREFIX}/privacy-policy.html` && !query.has('cb') ? { ...reply, truncate: true } : reply;
    });
    const run = await runScript([srv.base]);
    expect(run.killed).toBe(false);
    expect(run.code).toBe(1);
    expect(run.stdoutLines).toContain('FAIL privacy: HTTP 000');
    expect(run.stdout).not.toContain('FAIL privacy: missing');
    expect(run.stdoutLines).toContain('PASS index');
    expect(run.stdoutLines).toContain('PASS support');
    expect(run.stdoutLines[run.stdoutLines.length - 1]).toBe(
      `1 legal page check(s) failed for ${srv.base}`,
    );
    // curl's own transport error stays visible on stderr.
    expect(run.stderr).toMatch(/curl: \(18\)/);
  });

  it('FR6 (i): two arguments → exit 2 and usage on stderr', async () => {
    const run = await runScript(['http://127.0.0.1:9/a', 'http://127.0.0.1:9/b']);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('Usage: scripts/check-legal-pages.sh [BASE_URL]');
    expect(run.stdout).not.toMatch(/PASS|FAIL/);
  });

  it('FR6 (j): script is executable with a portable bash shebang and defaults to the production URL', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src.split('\n')[0]).toBe('#!/usr/bin/env bash');
    expect(src).toContain('https://jaime-alvarez-trilogy.github.io/hourglass-app');
  });

  it.each([
    ['passing', sitePages(), 0],
    ['failing', (() => ({ status: 404, body: 'Not Found' })) as Handler, 1],
  ] as const)('FR6 (k): temp files are cleaned up on a %s run', async (_label, handler, expected) => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'check-legal-pages-test-'));
    tmpRoots.push(tmpRoot);
    // Snapshot $TMPDIR while the script is mid-run (blocked on our response) to prove it
    // really writes its temp files there, so the empty-after check is not vacuous.
    let duringRun: string[] | null = null;
    const srv = await startServer((pathname, query) => {
      duringRun ??= fs.readdirSync(tmpRoot);
      return handler(pathname, query);
    });
    const run = await runScript([srv.base], { TMPDIR: tmpRoot });
    expect(run.code).toBe(expected);
    expect(duringRun).not.toBeNull();
    expect(duringRun!.length).toBeGreaterThan(0);
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });
});
