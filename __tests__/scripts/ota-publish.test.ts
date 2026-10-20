// 04-ota-lane FR3: guarded OTA publisher (scripts/ota-publish.sh).
//
// Runs the real script in a throwaway git repo. `npx` and `eas` are bash stubs placed first on
// PATH; they log every call (argv + EXPO_NO_DOTENV) to $STUB_LOG and answer from STUB_* env vars.
// Stubs and the log live in sibling dirs OUTSIDE the repo so they can never make the tree dirty.

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'ota-publish.sh');

const USAGE = 'Usage: scripts/ota-publish.sh [--dry-run] "<message>"';
const MSG = 'baseline: build 18 (v1.1.0)';

// Realistic fixtures (eas-cli 20.1.0 shapes: raw BuildFragment / getUpdateJsonInfosForUpdates).
const RTV = '7e91e3c1a9513c5e1890adb5f42eaaf0c5480e31';
const OTHER_RTV = '0221c51d4f8e2a7b9c3d6e1f0a5b8c7d2e4f6a90';
const BUILD_ID = 'b18a5f0c-2b8e-4c47-9d3e-8b2f6a1c0d18';
const BUILD_COMMIT = 'ddcfada3c1e9f0b2a4d6c8e0f1a3b5c7d9e1f2a4';
const UPDATE_ID = '019e0000-aaaa-7bbb-8ccc-000000000001';
const GROUP_ID = '2ea0f853-efcf-45c5-8108-dc2d377f52ef';

const rtvJson = (runtimeVersion: string) =>
  JSON.stringify({ runtimeVersion, fingerprintSources: null, workflow: 'managed' });

const build = (overrides: Record<string, unknown> = {}) => ({
  id: BUILD_ID,
  status: 'FINISHED',
  platform: 'IOS',
  channel: 'production',
  buildProfile: 'production',
  appVersion: '1.1.0',
  appBuildVersion: '18',
  runtimeVersion: RTV,
  gitCommitHash: BUILD_COMMIT,
  fingerprint: { hash: RTV },
  ...overrides,
});

const update = (overrides: Record<string, unknown> = {}) => ({
  id: UPDATE_ID,
  createdAt: '2026-11-05T17:00:00.000Z',
  group: GROUP_ID,
  branch: 'production',
  message: MSG,
  runtimeVersion: RTV,
  platform: 'ios',
  manifestPermalink: `https://u.expo.dev/update/${UPDATE_ID}`,
  isRollBackToEmbedded: false,
  gitCommitHash: BUILD_COMMIT,
  ...overrides,
});

// Stubs log, then answer. They print their canned stdout even when told to exit non-zero, so the
// script is forced to check exit codes instead of trusting output that merely parses.
const STUB_PREAMBLE = (name: string) =>
  [
    '#!/usr/bin/env bash',
    '{',
    `  echo "CALL ${name}"`,
    '  for a in "$@"; do printf \'ARG %s\\n\' "$a"; done',
    '  echo "ENV EXPO_NO_DOTENV=$EXPO_NO_DOTENV"',
    '} >> "$STUB_LOG"',
  ].join('\n');

const NPX_STUB = [
  STUB_PREAMBLE('npx'),
  'printf \'%s\\n\' "$STUB_RTV_JSON"',
  'exit "${STUB_RTV_EXIT:-0}"',
  '',
].join('\n');

const EAS_STUB = [
  STUB_PREAMBLE('eas'),
  'case "$1" in',
  '  build:list) printf \'%s\\n\' "$STUB_BUILDS_JSON"; exit "${STUB_BUILDS_EXIT:-0}" ;;',
  '  update) printf \'%s\\n\' "$STUB_UPDATE_JSON"; exit "${STUB_UPDATE_EXIT:-0}" ;;',
  'esac',
  'echo "eas stub: unexpected invocation: $*" >&2',
  'exit 99',
  '',
].join('\n');

type Call = { cmd: string; argv: string[]; env: Record<string, string> };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reportLine = (label: string, value: string) =>
  new RegExp(`^\\s*${label}:\\s+${escapeRegExp(value)}\\s*$`, 'm');

// Hermetic env: no inherited EXPO_NO_DOTENV (so the "=1" assertion can't pass by accident), no
// GIT_* leakage (e.g. when jest runs inside a git hook), and no user/system git config.
const hermeticEnv = () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === 'EXPO_NO_DOTENV' || key.startsWith('GIT_') || key.startsWith('STUB_')) delete env[key];
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
};

describe('FR3: scripts/ota-publish.sh', () => {
  let tmp: string;
  let repo: string;
  let stubs: string;
  let log: string;

  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, env: hermeticEnv(), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout.trim();
  };

  const readCalls = (): Call[] => {
    if (!fs.existsSync(log)) return [];
    const calls: Call[] = [];
    for (const line of fs.readFileSync(log, 'utf8').split('\n')) {
      if (line.startsWith('CALL ')) {
        calls.push({ cmd: line.slice(5), argv: [], env: {} });
      } else if (line.startsWith('ARG ')) {
        calls[calls.length - 1].argv.push(line.slice(4));
      } else if (line.startsWith('ENV ')) {
        const [key, ...rest] = line.slice(4).split('=');
        calls[calls.length - 1].env[key] = rest.join('=');
      }
    }
    return calls;
  };

  const run = (args: string[], stubEnv: Record<string, string> = {}) => {
    const result = spawnSync('bash', [path.join(repo, 'scripts', 'ota-publish.sh'), ...args], {
      // Not the repo: proves the script cds to its own repo root.
      cwd: os.tmpdir(),
      env: {
        ...hermeticEnv(),
        PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
        STUB_LOG: log,
        STUB_RTV_JSON: rtvJson(RTV),
        STUB_BUILDS_JSON: JSON.stringify([build()]),
        STUB_UPDATE_JSON: JSON.stringify([update()]),
        ...stubEnv,
      },
      encoding: 'utf8',
      timeout: 15_000,
    });
    const calls = readCalls();
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls,
      labels: calls.map((c) => `${c.cmd} ${c.argv[0] ?? ''}`.trim()),
      easCalls: calls.filter((c) => c.cmd === 'eas'),
      updateCalls: calls.filter((c) => c.cmd === 'eas' && c.argv[0] === 'update'),
    };
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ota-publish-'));
    repo = path.join(tmp, 'repo');
    stubs = path.join(tmp, 'stubs');
    log = path.join(tmp, 'stub.log');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.mkdirSync(stubs);

    fs.copyFileSync(SCRIPT, path.join(repo, 'scripts', 'ota-publish.sh'));
    fs.writeFileSync(
      path.join(repo, 'app.json'),
      `${JSON.stringify({ expo: { version: '1.1.0', ios: { buildNumber: '18' } } }, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(stubs, 'npx'), NPX_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubs, 'eas'), EAS_STUB, { mode: 0o755 });

    git('-c', 'init.defaultBranch=main', 'init', '-q');
    git('add', '-A');
    git(
      '-c', 'user.name=test',
      '-c', 'user.email=test@example.com',
      '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'init',
    );
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('step 1: arguments', () => {
    it.each<[string, string[]]>([
      ['no arguments', []],
      ['an empty message', ['']],
      ['a whitespace-only message', ['   ']],
      ['a tabs-and-spaces-only message', [' \t ']],
      ['--dry-run without a message', ['--dry-run']],
      ['--dry-run with a whitespace-only message', ['--dry-run', '   ']],
      ['two positional arguments (unquoted message)', ['fix', 'thing']],
      ['--dry-run with two positional arguments', ['--dry-run', 'fix', 'thing']],
      ['an unknown flag', ['--force', 'msg']],
    ])('refuses %s: exit 1, usage on stderr, no npx/eas calls', (_label, args) => {
      const r = run(args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(USAGE);
      expect(r.calls).toEqual([]);
    });

    it('checks arguments before the tree: no arguments on a dirty tree is a usage error', () => {
      fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n');
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(USAGE);
      expect(r.stderr).not.toContain('uncommitted changes');
    });
  });

  describe('step 2: clean tree', () => {
    it('refuses a modified tracked file, listing it, before any npx/eas call', () => {
      fs.writeFileSync(
        path.join(repo, 'app.json'),
        `${JSON.stringify({ expo: { version: '1.1.0', ios: { buildNumber: '19' } } })}\n`,
      );
      const r = run([MSG]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Refusing to publish: uncommitted changes');
      expect(r.stderr).toContain(' M app.json');
      expect(r.calls).toEqual([]);
    });

    it('refuses when the only change is an untracked file, listing it, before any npx/eas call', () => {
      fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n');
      const r = run([MSG]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Refusing to publish: uncommitted changes');
      expect(r.stderr).toContain('?? stray.txt');
      expect(r.calls).toEqual([]);
    });
  });

  describe('step 3: runtime must be a 40-hex fingerprint', () => {
    it.each<[string, string]>([
      ['a leftover literal runtime', '1.1.0'],
      ['39 hex chars', RTV.slice(0, 39)],
      ['41 hex chars', `${RTV}a`],
      ['uppercase hex', RTV.toUpperCase()],
    ])('refuses %s: exit 1, "is not a fingerprint hash", no eas calls', (_label, rtv) => {
      const r = run([MSG], { STUB_RTV_JSON: rtvJson(rtv) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Refusing to publish: runtime version "${rtv}" is not a fingerprint hash`);
      expect(r.labels).toEqual(['npx expo-updates']);
      expect(r.easCalls).toEqual([]);
    });

    it('refuses when the resolver exits non-zero (even if its stdout looks valid), no eas calls', () => {
      const r = run([MSG], { STUB_RTV_EXIT: '1' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/\S/);
      expect(r.easCalls).toEqual([]);
    });

    it.each<[string, string]>([
      ['the runtimeVersion field is missing', JSON.stringify({ fingerprintSources: null, workflow: 'managed' })],
      ['the output is not JSON', 'not json'],
    ])('refuses when %s, no eas calls', (_label, stdout) => {
      const r = run([MSG], { STUB_RTV_JSON: stdout });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/\S/);
      expect(r.easCalls).toEqual([]);
    });
  });

  describe('step 4: audience guard', () => {
    it('refuses when no finished production iOS build has the runtime, with both static hints and no extra eas call', () => {
      const r = run([MSG], { STUB_BUILDS_JSON: '[]' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(
        `Refusing to publish: no finished iOS build on channel "production" has runtime ${RTV}`,
      );
      expect(r.stderr).toContain('npm ci');
      expect(r.stderr).toContain('eas fingerprint:compare --build-id');
      expect(r.labels).toEqual(['npx expo-updates', 'eas build:list']);
      expect(r.updateCalls).toEqual([]);
    });

    it('queries build:list with platform, status, channel, runtime and JSON filters', () => {
      const r = run([MSG], { STUB_BUILDS_JSON: '[]' });
      const argv = r.easCalls[0]?.argv ?? [];
      const valueOf = (flag: string) => argv[argv.indexOf(flag) + 1];
      expect(argv[0]).toBe('build:list');
      expect(valueOf('--platform')).toBe('ios');
      expect(valueOf('--status')).toBe('finished');
      expect(valueOf('--channel')).toBe('production');
      expect(valueOf('--runtime-version')).toBe(RTV);
      expect(argv).toContain('--json');
      expect(argv).toContain('--non-interactive');
    });

    it('fails closed when build:list exits non-zero (even if its stdout lists a build)', () => {
      const r = run([MSG], { STUB_BUILDS_EXIT: '1' });
      expect(r.status).toBe(1);
      expect(r.updateCalls).toEqual([]);
      expect(r.stdout).not.toContain('OTA published');
    });

    it('fails closed when build:list prints something that is not JSON', () => {
      const r = run([MSG], { STUB_BUILDS_JSON: 'Error: not logged in' });
      expect(r.status).toBe(1);
      expect(r.updateCalls).toEqual([]);
    });

    it('--dry-run is still refused at the audience guard (runbook §C relies on this)', () => {
      const r = run(['--dry-run', 'check'], { STUB_BUILDS_JSON: '[]' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`no finished iOS build on channel "production" has runtime ${RTV}`);
      expect(r.stdout).not.toContain('Dry run OK');
      expect(r.updateCalls).toEqual([]);
    });
  });

  describe('happy path: publish and report', () => {
    it('runs npx resolve, then build:list, then exactly one eas update, with the exact contract argv', () => {
      const r = run([MSG]);
      expect(r.status).toBe(0);
      expect(r.labels).toEqual(['npx expo-updates', 'eas build:list', 'eas update']);
      expect(r.calls[0].argv).toEqual(['expo-updates', 'runtimeversion:resolve', '--platform', 'ios']);
      expect(r.calls[1].argv).toEqual([
        'build:list',
        '--platform', 'ios',
        '--status', 'finished',
        '--channel', 'production',
        '--runtime-version', RTV,
        '--limit', '1',
        '--json',
        '--non-interactive',
      ]);
      expect(r.updateCalls).toHaveLength(1);
      expect(r.updateCalls[0].argv).toEqual([
        'update',
        '--channel', 'production',
        '--environment', 'production',
        '--platform', 'ios',
        '--message', MSG,
        '--json',
        '--non-interactive',
      ]);
    });

    it('publishes with EXPO_NO_DOTENV=1 so .env.local cannot leak into the bundle', () => {
      const r = run([MSG]);
      expect(r.status).toBe(0);
      expect(r.updateCalls[0]?.env.EXPO_NO_DOTENV).toBe('1');
    });

    it('prints the OTA published block: commit, runtime, group, iOS update id and the 8-char Settings row', () => {
      const shortHead = git('rev-parse', '--short', 'HEAD');
      const r = run([MSG]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('OTA published');
      expect(r.stdout).toMatch(reportLine('commit', shortHead));
      expect(r.stdout).toMatch(reportLine('runtime', RTV));
      expect(r.stdout).toMatch(reportLine('group', GROUP_ID));
      expect(r.stdout).toMatch(reportLine('update', UPDATE_ID));
      expect(r.stdout).toMatch(reportLine('settings', 'Update: 019e0000'));
      expect(r.stdout).not.toContain('Dry run OK');
      expect(r.stderr).not.toContain('WARNING:');
    });

    it('reports the element with platform "ios", not simply the first array element', () => {
      const androidFirst = update({ id: '019dffff-0000-7000-8000-00000000a11d', platform: 'android' });
      const r = run([MSG], { STUB_UPDATE_JSON: JSON.stringify([androidFirst, update()]) });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(reportLine('update', UPDATE_ID));
      expect(r.stdout).toMatch(reportLine('settings', 'Update: 019e0000'));
      expect(r.stdout).not.toContain('019dffff');
    });

    it.each<[string, string]>([
      ['spaces and double quotes', 'fix: "Approve" button'],
      ['shell metacharacters', "it's $HOME `whoami` * \\ done"],
    ])('passes a message with %s to eas as one argv element, byte for byte', (_label, message) => {
      const r = run([message]);
      expect(r.status).toBe(0);
      const argv = r.updateCalls[0]?.argv ?? [];
      expect(argv).toHaveLength(11);
      expect(argv[argv.indexOf('--message') + 1]).toBe(message);
    });
  });

  describe('step 6: --dry-run', () => {
    it('prints Dry run OK with the runtime, the matched build and the exact publish command, and does not publish', () => {
      const r = run(['--dry-run', MSG]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Dry run OK');
      expect(r.stdout).toContain(RTV);
      expect(r.stdout).toContain(BUILD_ID);
      expect(r.stdout).toContain('1.1.0 (18)');
      expect(r.stdout).toContain(
        'EXPO_NO_DOTENV=1 eas update --channel production --environment production --platform ios --message',
      );
      expect(r.stdout).not.toContain('OTA published');
      expect(r.labels).toEqual(['npx expo-updates', 'eas build:list']);
      expect(r.updateCalls).toEqual([]);
    });
  });

  describe('step 5: version mismatch warns but continues', () => {
    it.each<[string, Record<string, unknown>, string]>([
      ['buildNumber', { appBuildVersion: '17' }, '1.1.0 (17)'],
      ['version', { appVersion: '1.0.0' }, '1.0.0 (18)'],
    ])('a %s mismatch prints WARNING to stderr and still publishes once', (_label, overrides, target) => {
      const r = run([MSG], { STUB_BUILDS_JSON: JSON.stringify([build(overrides)]) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain(`WARNING: app.json is 1.1.0 (18) but the target build is ${target}`);
      expect(r.stdout).not.toContain('WARNING:');
      expect(r.updateCalls).toHaveLength(1);
      expect(r.stdout).toContain('OTA published');
    });

    it('warns during --dry-run too (step 5 runs before step 6), without publishing', () => {
      const r = run(['--dry-run', MSG], {
        STUB_BUILDS_JSON: JSON.stringify([build({ appBuildVersion: '17' })]),
      });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('WARNING: app.json is 1.1.0 (18) but the target build is 1.1.0 (17)');
      expect(r.stdout).toContain('Dry run OK');
      expect(r.updateCalls).toEqual([]);
    });
  });

  describe('steps 7-8: eas failures after the guard', () => {
    it("exits with eas update's own exit code (3) and prints no success block", () => {
      const r = run([MSG], { STUB_UPDATE_EXIT: '3' });
      expect(r.status).toBe(3);
      expect(r.updateCalls).toHaveLength(1);
      expect(r.stdout).not.toContain('OTA published');
    });

    it('exits 1 with ERROR and rollback guidance when eas reports a different runtime than the guard checked', () => {
      const r = run([MSG], { STUB_UPDATE_JSON: JSON.stringify([update({ runtimeVersion: OTHER_RTV })]) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`ERROR: eas published to runtime ${OTHER_RTV} but the guard checked ${RTV}`);
      expect(r.stderr).toMatch(/roll-back-to-embedded|RELEASING\.md/);
      expect(r.stdout).not.toContain('OTA published');
    });
  });
});

describe('FR3: scripts/ota-publish.sh file', () => {
  const source = (): string => fs.readFileSync(SCRIPT, 'utf8');

  it('is executable (mode & 0o111)', () => {
    expect(fs.statSync(SCRIPT).mode & 0o111).not.toBe(0);
  });

  it('starts with #!/usr/bin/env bash and sets -euo pipefail', () => {
    const lines = source().split('\n');
    expect(lines[0]).toBe('#!/usr/bin/env bash');
    expect(lines).toContain('set -euo pipefail');
  });

  it('passes bash -n', () => {
    const r = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' });
    expect({ status: r.status, stderr: r.stderr }).toEqual({ status: 0, stderr: '' });
  });

  // CI runs bash 5, so the runtime tests alone would not catch a break on macOS's stock bash 3.2.
  it('uses no bash-4-only constructs (associative arrays, mapfile/readarray, case-modifying expansions)', () => {
    const code = source()
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/\bdeclare\s+-[a-zA-Z]*A/);
    expect(code).not.toMatch(/\b(mapfile|readarray)\b/);
    expect(code).not.toMatch(/\$\{[#!]?\w+(\[[^\]]*\])?(,,?|\^\^?)\}/);
  });
});
