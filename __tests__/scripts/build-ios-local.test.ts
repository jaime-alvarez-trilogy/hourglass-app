// Local App Store builds (scripts/build-ios-local.sh), decided 2026-10-27: every store build from
// build 21 on runs on J's Mac with `eas build --local`.
//
// Runs the real script in a throwaway git repo whose origin is a bare repo next to it. `eas`,
// `npx` and `xcodebuild` are bash stubs placed first on PATH; they log every call (argv +
// EXPO_NO_DOTENV) to $STUB_LOG and answer from STUB_* env vars. `plutil` and `security` are
// stubbed too, because CI runs on ubuntu-latest: the synthetic IPAs hold their plists as JSON,
// which the plutil stub reads with plutil's `-extract <keypath> raw` semantics, and the security
// stub "decodes" embedded.mobileprovision by printing it. unzip, zip and shasum are real.
// Stubs, the log, origin and the build output live in sibling dirs OUTSIDE the repo.

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.setTimeout(30_000);

const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'build-ios-local.sh');
const OTA_SCRIPT = path.join(ROOT, 'scripts', 'ota-publish.sh');

const USAGE = 'Usage: scripts/build-ios-local.sh [--dry-run]';

// Real values from the 2026-10-27 local build of df37d85: its IPA embeds this runtime in
// Payload/Hourglassxo.app/EXUpdates.bundle/fingerprint, with Expo.plist saying "file:fingerprint".
const RTV = 'c4b216cfbddeebce0fa38838499b63e4af85e313';
const OTHER_RTV = '0221c51d4f8e2a7b9c3d6e1f0a5b8c7d2e4f6a90';
const VERSION = '1.2.0';
const BUILD = '21';
const TAG = `build-${BUILD}`;
const PIN = 'macos-tahoe-26.6-xcode-27.1';
const XCODE_27_0 = 'Xcode 27.0\nBuild version 27A266a';
const XCODE_27_1 = 'Xcode 27.1\nBuild version 27A9275';
const APP = 'Payload/Hourglassxo.app';
const WIDGET = `${APP}/PlugIns/ExpoWidgetsTarget.appex`;

const rtvJson = (runtimeVersion: string) =>
  JSON.stringify({ runtimeVersion, fingerprintSources: null, workflow: 'managed' });

// --- Synthetic IPA ----------------------------------------------------------------------------
// Keys as Xcode 27.0 (27A266a) wrote them into the 2026-10-27 local IPA.
const appInfo = (overrides: Record<string, unknown> = {}) => ({
  CFBundleIdentifier: 'com.jalvarez0907.hourglass',
  CFBundleShortVersionString: VERSION,
  CFBundleVersion: BUILD,
  DTXcode: '2700',
  DTXcodeBuild: '27A266a',
  DTSDKName: 'iphoneos27.0',
  DTPlatformBuild: '24A430',
  DTSDKBuild: '24A430',
  MinimumOSVersion: '16.4',
  ...overrides,
});
const widgetInfo = (overrides: Record<string, unknown> = {}) => ({
  CFBundleIdentifier: 'com.jalvarez0907.hourglass.ExpoWidgetsTarget',
  CFBundleShortVersionString: VERSION,
  CFBundleVersion: BUILD,
  ...overrides,
});
// An App Store distribution profile: no device list, not debuggable.
const appStoreProfile = (overrides: Record<string, unknown> = {}) => ({
  Name: '*[expo] com.jalvarez0907.hourglass AppStore 2026-04-06T00:43:04.835Z',
  TeamIdentifier: ['M85UZ4KQC2'],
  Entitlements: { 'get-task-allow': false, 'aps-environment': 'production' },
  ...overrides,
});

type Entry = string | Record<string, unknown> | null;

// null drops an entry; objects are written as JSON (the plutil stub's plist format).
const ipaEntries = (overrides: Record<string, Entry> = {}): Record<string, Entry> => ({
  [`${APP}/Info.plist`]: appInfo(),
  [`${APP}/Expo.plist`]: { EXUpdatesRuntimeVersion: 'file:fingerprint' },
  [`${APP}/EXUpdates.bundle/fingerprint`]: RTV,
  [`${APP}/embedded.mobileprovision`]: appStoreProfile(),
  [`${APP}/main.jsbundle`]: '// bundle',
  [`${WIDGET}/Info.plist`]: widgetInfo(),
  [`${WIDGET}/embedded.mobileprovision`]: appStoreProfile(),
  ...overrides,
});

// --- Stubs -----------------------------------------------------------------------------------
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

// `eas build` copies $STUB_IPA to its --output path; STUB_MOVE_HEAD commits in that repo first.
const EAS_STUB = [
  STUB_PREAMBLE('eas'),
  'if [ "$1" = build ]; then',
  '  out=""; prev=""',
  '  for a in "$@"; do if [ "$prev" = --output ]; then out=$a; fi; prev=$a; done',
  '  if [ -n "$STUB_MOVE_HEAD" ]; then',
  '    git -C "$STUB_MOVE_HEAD" -c user.name=t -c user.email=t@example.com commit -q --allow-empty -m moved',
  '  fi',
  '  if [ -n "$STUB_IPA" ] && [ -n "$out" ]; then cp "$STUB_IPA" "$out"; fi',
  '  exit "${STUB_BUILD_EXIT:-0}"',
  'fi',
  'echo "eas stub: unexpected invocation: $*" >&2',
  'exit 99',
  '',
].join('\n');

const XCODEBUILD_STUB = [
  STUB_PREAMBLE('xcodebuild'),
  '[ "$*" = -version ] || { echo "xcodebuild stub: unexpected invocation: $*" >&2; exit 99; }',
  'printf \'%s\\n\' "$STUB_XCODE_OUT"',
  'exit "${STUB_XCODE_EXIT:-0}"',
  '',
].join('\n');

// plutil -extract <keypath> raw -o - <file>, over JSON: strings as is, booleans as true/false,
// arrays as their count, dictionaries as their keys; a missing key exits 1, as the real one does.
const PLUTIL_STUB = `#!/usr/bin/env node
const fs = require('fs');
const [cmd, keypath, fmt, o, dash, file] = process.argv.slice(2);
if (cmd !== '-extract' || fmt !== 'raw' || o !== '-o' || dash !== '-' || !file || process.argv.length !== 8) {
  console.error('plutil stub: unexpected invocation: ' + process.argv.slice(2).join(' '));
  process.exit(99);
}
let value;
try {
  value = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(file + ': Property List error: not a plist');
  process.exit(1);
}
for (const part of keypath.split('.')) {
  if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) {
    console.error(file + ': Could not extract value, error: No value at that key path or invalid key path: ' + keypath);
    process.exit(1);
  }
  value = value[part];
}
const out = Array.isArray(value) ? String(value.length)
  : value !== null && typeof value === 'object' ? Object.keys(value).join('\\n')
  : String(value);
process.stdout.write(out + '\\n');
`;

const SECURITY_STUB = [
  '#!/usr/bin/env bash',
  'if [ "$#" -ne 4 ] || [ "$1 $2 $3" != "cms -D -i" ]; then',
  '  echo "security stub: unexpected invocation: $*" >&2',
  '  exit 99',
  'fi',
  'if [ -n "$STUB_SECURITY_EXIT" ]; then exit "$STUB_SECURITY_EXIT"; fi',
  'cat "$4"',
  '',
].join('\n');

type Call = { cmd: string; argv: string[]; env: Record<string, string> };

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reportLine = (label: string, value: string) =>
  new RegExp(`^\\s*${label}:\\s+${escapeRegExp(value)}\\s*$`, 'm');

// Hermetic env: no inherited EXPO_NO_DOTENV, DEVELOPER_DIR or HOURGLASS_BUILD_DIR, no GIT_*
// leakage (e.g. when jest runs inside a git hook), and no user/system git config.
const hermeticEnv = () => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key === 'EXPO_NO_DOTENV' ||
      key === 'DEVELOPER_DIR' ||
      key === 'HOURGLASS_BUILD_DIR' ||
      key.startsWith('GIT_') ||
      key.startsWith('STUB_')
    ) {
      delete env[key];
    }
  }
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  return env;
};

const tagMessage = (overrides: { sdkBuild?: string; sha: string }) =>
  [
    `Hourglass ${VERSION} (${BUILD}), local build`,
    '',
    `Version: ${VERSION}`,
    `Build: ${BUILD}`,
    `Runtime: ${RTV}`,
    'Xcode: 27.0 (27A266a)',
    `SDK: iphoneos27.0 (${overrides.sdkBuild ?? '24A430'})`,
    `IPA-SHA256: ${overrides.sha}`,
    '',
  ].join('\n');

describe('scripts/build-ios-local.sh', () => {
  let tmp: string;
  let repo: string;
  let origin: string;
  let stubs: string;
  let log: string;
  let buildDir: string;
  let ipaSource: string;
  let ipaOut: string;

  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: repo, env: hermeticEnv(), encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout.trim();
  };

  const commitAll = (message: string) => {
    git('add', '-A');
    git('commit', '-qm', message);
  };

  const writeJson = (file: string, value: unknown) =>
    fs.writeFileSync(path.join(repo, file), `${JSON.stringify(value, null, 2)}\n`);

  const appJson = (overrides: Record<string, unknown> = {}) => ({
    expo: {
      name: 'Hourglass',
      version: VERSION,
      runtimeVersion: { policy: 'fingerprint' },
      ios: { bundleIdentifier: 'com.jalvarez0907.hourglass', buildNumber: BUILD },
      ...overrides,
    },
  });

  const easJson = (production: Record<string, unknown> = { channel: 'production', ios: { image: PIN } }) => ({
    cli: { version: '>= 25.2.0', appVersionSource: 'local' },
    build: { development: { channel: 'development' }, production },
  });

  // Writes a synthetic IPA with the real `zip` (CI has it), so entry names, directory entries
  // and compression look like an exported IPA's.
  const makeIpa = (file: string, entries: Record<string, Entry>) => {
    const src = fs.mkdtempSync(path.join(tmp, 'ipa-src-'));
    for (const [name, content] of Object.entries(entries)) {
      if (content === null) continue;
      fs.mkdirSync(path.join(src, path.dirname(name)), { recursive: true });
      fs.writeFileSync(
        path.join(src, name),
        typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`,
      );
    }
    fs.rmSync(file, { force: true });
    const r = spawnSync('zip', ['-q', '-r', '-X', file, 'Payload'], { cwd: src, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`zip failed: ${r.stderr}`);
    fs.rmSync(src, { recursive: true, force: true });
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

  const run = (args: string[], stubEnv: Record<string, string> = {}, script = 'build-ios-local.sh') => {
    fs.rmSync(log, { force: true });
    const result = spawnSync('bash', [path.join(repo, 'scripts', script), ...args], {
      // Not the repo: proves the script cds to its own repo root.
      cwd: os.tmpdir(),
      env: {
        ...hermeticEnv(),
        PATH: `${stubs}${path.delimiter}${process.env.PATH}`,
        STUB_LOG: log,
        STUB_RTV_JSON: rtvJson(RTV),
        STUB_XCODE_OUT: XCODE_27_0,
        STUB_IPA: ipaSource,
        HOURGLASS_BUILD_DIR: buildDir,
        ...stubEnv,
      },
      encoding: 'utf8',
      timeout: 25_000,
    });
    const calls = readCalls();
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls,
      labels: calls.map((c) => `${c.cmd} ${c.argv[0] ?? ''}`.trim()),
      easCalls: calls.filter((c) => c.cmd === 'eas'),
    };
  };

  const tags = () => git('tag', '-l').split('\n').filter(Boolean);
  const remoteTags = () => {
    const r = spawnSync('git', ['ls-remote', '--tags', origin], { env: hermeticEnv(), encoding: 'utf8' });
    return r.stdout.trim();
  };

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-ios-local-'));
    repo = path.join(tmp, 'repo');
    origin = path.join(tmp, 'origin.git');
    stubs = path.join(tmp, 'stubs');
    log = path.join(tmp, 'stub.log');
    buildDir = path.join(tmp, 'builds');
    ipaSource = path.join(tmp, 'synthetic.ipa');
    ipaOut = path.join(buildDir, `hourglass-${VERSION}-${BUILD}.ipa`);
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.mkdirSync(stubs);

    fs.copyFileSync(SCRIPT, path.join(repo, 'scripts', 'build-ios-local.sh'));
    // Committed too, so the handoff test can run it on the tag this script creates.
    fs.copyFileSync(OTA_SCRIPT, path.join(repo, 'scripts', 'ota-publish.sh'));
    writeJson('app.json', appJson());
    writeJson('eas.json', easJson());
    fs.writeFileSync(path.join(stubs, 'npx'), NPX_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubs, 'eas'), EAS_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubs, 'xcodebuild'), XCODEBUILD_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubs, 'plutil'), PLUTIL_STUB, { mode: 0o755 });
    fs.writeFileSync(path.join(stubs, 'security'), SECURITY_STUB, { mode: 0o755 });
    makeIpa(ipaSource, ipaEntries());

    spawnSync('git', ['init', '-q', '--bare', origin], { env: hermeticEnv() });
    git('-c', 'init.defaultBranch=main', 'init', '-q');
    // Repo-local identity: the script's `git tag -a` needs a tagger.
    git('config', 'user.name', 'test');
    git('config', 'user.email', 'test@example.com');
    git('config', 'commit.gpgsign', 'false');
    git('config', 'tag.gpgsign', 'false');
    commitAll('init');
    git('remote', 'add', 'origin', origin);
    git('push', '-q', '-u', 'origin', 'main');
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  // Every refusal before the build: exit 1, the reason on stderr, no eas call, no IPA, no tag.
  const expectRefusedBeforeBuild = (r: ReturnType<typeof run>, reason: string) => {
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(reason);
    expect(r.easCalls).toEqual([]);
    expect(fs.existsSync(buildDir)).toBe(false);
    expect(tags()).toEqual([]);
  };

  describe('step 1: arguments', () => {
    it.each<[string, string[]]>([
      ['an unknown flag', ['--force']],
      ['a positional argument', ['21']],
      ['--dry-run twice', ['--dry-run', '--dry-run']],
      ['--dry-run after another argument', ['now', '--dry-run']],
    ])('refuses %s: exit 1, usage on stderr, no stub calls', (_label, args) => {
      const r = run(args);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(USAGE);
      expect(r.calls).toEqual([]);
    });
  });

  describe('step 2: clean, pushed tree', () => {
    it('refuses a modified tracked file, listing it, before any stub call', () => {
      writeJson('app.json', appJson({ version: '1.2.1' }));
      const r = run(['--dry-run']);
      expectRefusedBeforeBuild(r, 'Refusing to build: uncommitted changes');
      expect(r.stderr).toContain(' M app.json');
      expect(r.calls).toEqual([]);
    });

    it('refuses an untracked file, listing it', () => {
      fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n');
      const r = run([]);
      expectRefusedBeforeBuild(r, 'Refusing to build: uncommitted changes');
      expect(r.stderr).toContain('?? stray.txt');
      expect(r.calls).toEqual([]);
    });

    it('refuses a branch with no upstream', () => {
      git('checkout', '-q', '-b', 'topic');
      const r = run([]);
      expectRefusedBeforeBuild(r, 'Refusing to build: HEAD is not on a branch with an upstream');
      expect(r.stderr).toContain('git push -u origin');
      expect(r.calls).toEqual([]);
    });

    it('refuses a detached HEAD', () => {
      git('checkout', '-q', '--detach');
      const r = run([]);
      expectRefusedBeforeBuild(r, 'Refusing to build: HEAD is not on a branch with an upstream');
    });

    it('refuses a commit that origin does not have', () => {
      git('commit', '-q', '--allow-empty', '-m', 'unpushed');
      const r = run([]);
      expectRefusedBeforeBuild(r, "Refusing to build: HEAD has 1 commit(s) that origin/main doesn't have");
      expect(r.calls).toEqual([]);
    });
  });

  describe('step 3: app.json version and build number', () => {
    it.each<[string, Record<string, unknown>, string]>([
      ['a numeric buildNumber', { ios: { buildNumber: 21 } }, 'expo.ios.buildNumber must be a positive integer string, got 21'],
      ['buildNumber "0"', { ios: { buildNumber: '0' } }, 'got "0"'],
      ['buildNumber "21a"', { ios: { buildNumber: '21a' } }, 'got "21a"'],
      ['no buildNumber', { ios: {} }, 'got undefined'],
      ['no version', { version: undefined }, 'expo.version must be a string like "1.2.0", got undefined'],
      ['a version with a slash', { version: '1.2/0' }, 'got "1.2/0"'],
    ])('refuses %s', (_label, overrides, detail) => {
      writeJson('app.json', appJson(overrides));
      commitAll('bad app.json');
      git('push', '-q');
      const r = run(['--dry-run']);
      expectRefusedBeforeBuild(r, 'Refusing to build: app.json has no usable expo.version and expo.ios.buildNumber');
      expect(r.stderr).toContain(detail);
      expect(r.calls).toEqual([]);
    });
  });

  describe('step 4: build number unused', () => {
    it('refuses when tag build-<N> exists locally', () => {
      git('tag', TAG);
      const r = run(['--dry-run']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Refusing to build: tag ${TAG} already exists here, so build ${BUILD} is taken`);
      expect(r.calls).toEqual([]);
    });

    it('refuses when tag build-<N> exists only on origin', () => {
      git('tag', TAG);
      git('push', '-q', 'origin', `refs/tags/${TAG}`);
      git('tag', '-d', TAG);
      const r = run(['--dry-run']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Refusing to build: tag ${TAG} already exists on origin, so build ${BUILD} is taken`);
      expect(r.calls).toEqual([]);
    });

    it('fails closed when git ls-remote origin fails', () => {
      git('remote', 'set-url', 'origin', path.join(tmp, 'missing.git'));
      const r = run(['--dry-run']);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('Refusing to build: `git ls-remote --tags origin` failed');
      expect(r.calls).toEqual([]);
    });

    it('matches the tag name exactly: build-2 and build-210 do not take build 21', () => {
      git('tag', 'build-2');
      git('tag', 'build-210');
      git('push', '-q', 'origin', '--tags');
      const r = run(['--dry-run']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Dry run OK');
    });
  });

  describe('step 5: Xcode against the eas.json image pin', () => {
    it.each<[string, Record<string, unknown>, string]>([
      ['no ios.image', { channel: 'production' }, 'is "", which pins no Xcode'],
      ['the auto alias', { channel: 'production', ios: { image: 'auto' } }, 'is "auto", which pins no Xcode'],
      [
        'an image without a minor',
        { channel: 'production', ios: { image: 'macos-tahoe-26.6-xcode-27' } },
        'is "macos-tahoe-26.6-xcode-27", which pins no Xcode',
      ],
    ])('refuses an eas.json production profile with %s', (_label, production, detail) => {
      writeJson('eas.json', easJson(production));
      commitAll('unpinned');
      git('push', '-q');
      const r = run(['--dry-run']);
      expectRefusedBeforeBuild(r, `Refusing to build: eas.json build.production.ios.image ${detail}`);
      expect(r.calls).toEqual([]);
    });

    it('refuses a different Xcode major, naming both versions', () => {
      const r = run(['--dry-run'], { STUB_XCODE_OUT: 'Xcode 26.2\nBuild version 17C52' });
      expectRefusedBeforeBuild(
        r,
        `Refusing to build: this Mac builds with Xcode 26.2 (17C52), but eas.json pins Xcode 27.1 (${PIN})`,
      );
      expect(r.stderr).toContain('DEVELOPER_DIR=');
      expect(r.labels).toEqual(['xcodebuild -version']);
    });

    it('warns, and continues, when only the minor differs (27.0 here, 27.1 pinned)', () => {
      const r = run(['--dry-run']);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain(`WARNING: this Mac builds with Xcode 27.0 (27A266a); eas.json pins Xcode 27.1 (${PIN})`);
      expect(r.stdout).toContain('Dry run OK');
    });

    it('prints no warning when the Xcode matches the pin exactly', () => {
      const r = run(['--dry-run'], { STUB_XCODE_OUT: XCODE_27_1 });
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain('WARNING');
    });

    it('refuses when xcodebuild -version fails (even if its stdout looks valid)', () => {
      const r = run(['--dry-run'], { STUB_XCODE_EXIT: '1' });
      expectRefusedBeforeBuild(r, 'Refusing to build: `xcodebuild -version` failed');
    });

    it('refuses output it cannot parse', () => {
      const r = run(['--dry-run'], { STUB_XCODE_OUT: 'xcode-select: note: no developer tools' });
      expectRefusedBeforeBuild(r, 'Refusing to build: could not read the Xcode version and build');
    });

    it('names DEVELOPER_DIR in the dry run when it is set', () => {
      // macOS's /usr/bin/git is an xcrun shim that also follows DEVELOPER_DIR, so on a Mac it must
      // name a real developer dir. On Linux (CI) any path will do.
      const developerDir =
        process.platform === 'darwin'
          ? spawnSync('xcode-select', ['-p'], { encoding: 'utf8' }).stdout.trim()
          : '/Applications/Xcode-27.1.app/Contents/Developer';
      const r = run(['--dry-run'], { DEVELOPER_DIR: developerDir });
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(reportLine('xcode', `27.0 (27A266a), eas.json pins 27.1, DEVELOPER_DIR=${developerDir}`));
    });
  });

  describe('step 6: runtime must be a 40-hex fingerprint', () => {
    it.each<[string, string]>([
      ['a literal runtime', '1.2.0'],
      ['uppercase hex', RTV.toUpperCase()],
      ['39 hex chars', RTV.slice(0, 39)],
    ])('refuses %s', (_label, rtv) => {
      const r = run(['--dry-run'], { STUB_RTV_JSON: rtvJson(rtv) });
      expectRefusedBeforeBuild(r, `Refusing to build: runtime version "${rtv}" is not a fingerprint hash`);
      expect(r.labels).toEqual(['xcodebuild -version', 'npx expo-updates']);
    });

    it('refuses when the resolver exits non-zero (even if its stdout looks valid)', () => {
      const r = run(['--dry-run'], { STUB_RTV_EXIT: '1' });
      expectRefusedBeforeBuild(r, 'Refusing to build: `npx expo-updates runtimeversion:resolve --platform ios` failed');
    });

    it('refuses resolver output that is not JSON', () => {
      const r = run(['--dry-run'], { STUB_RTV_JSON: 'not json' });
      expectRefusedBeforeBuild(r, 'Refusing to build: could not read runtimeVersion');
    });
  });

  describe('step 7: output path', () => {
    it('refuses when the IPA already exists, and leaves it alone', () => {
      fs.mkdirSync(buildDir);
      fs.writeFileSync(ipaOut, 'earlier build\n');
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`Refusing to build: ${ipaOut} already exists`);
      expect(r.easCalls).toEqual([]);
      expect(fs.readFileSync(ipaOut, 'utf8')).toBe('earlier build\n');
      expect(tags()).toEqual([]);
    });

    it('refuses a relative HOURGLASS_BUILD_DIR', () => {
      const r = run(['--dry-run'], { HOURGLASS_BUILD_DIR: 'builds' });
      expectRefusedBeforeBuild(r, 'Refusing to build: HOURGLASS_BUILD_DIR must be an absolute path, got "builds"');
    });

    it('defaults to $HOME/hourglass-builds/hourglass-<version>-<N>.ipa', () => {
      const home = path.join(tmp, 'home');
      const env: Record<string, string> = { HOME: home, HOURGLASS_BUILD_DIR: '' };
      const r = run(['--dry-run'], env);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(reportLine('output', path.join(home, 'hourglass-builds', `hourglass-${VERSION}-${BUILD}.ipa`)));
      expect(fs.existsSync(home)).toBe(false);
    });
  });

  describe('step 8: --dry-run', () => {
    it('prints commit, version, build, runtime, Xcode, output and the exact build command, and creates nothing', () => {
      const shortHead = git('rev-parse', '--short', 'HEAD');
      const r = run(['--dry-run']);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Dry run OK: nothing was built or tagged');
      expect(r.stdout).toMatch(reportLine('commit', `${shortHead} (origin/main)`));
      expect(r.stdout).toMatch(reportLine('version', VERSION));
      expect(r.stdout).toMatch(reportLine('build', `${BUILD} (tag ${TAG} is free here and on origin)`));
      expect(r.stdout).toMatch(reportLine('runtime', RTV));
      expect(r.stdout).toMatch(reportLine('xcode', '27.0 (27A266a), eas.json pins 27.1'));
      expect(r.stdout).toMatch(reportLine('output', ipaOut));
      expect(r.stdout).toMatch(
        reportLine(
          'command',
          `EXPO_NO_DOTENV=1 eas build --local --platform ios --profile production --non-interactive --output '${ipaOut}'`,
        ),
      );
      expect(r.labels).toEqual(['xcodebuild -version', 'npx expo-updates']);
      expect(r.calls[1].argv).toEqual(['expo-updates', 'runtimeversion:resolve', '--platform', 'ios']);
      expect(fs.existsSync(buildDir)).toBe(false);
      expect(tags()).toEqual([]);
      expect(git('status', '--porcelain')).toBe('');
    });
  });

  describe('step 9: build', () => {
    it('runs eas build --local once with the exact argv and EXPO_NO_DOTENV=1', () => {
      const r = run([]);
      expect(r.status).toBe(0);
      expect(r.labels).toEqual(['xcodebuild -version', 'npx expo-updates', 'eas build']);
      expect(r.easCalls[0].argv).toEqual([
        'build',
        '--local',
        '--platform', 'ios',
        '--profile', 'production',
        '--non-interactive',
        '--output', ipaOut,
      ]);
      expect(r.easCalls[0].env.EXPO_NO_DOTENV).toBe('1');
    });

    it("exits with eas build's own exit code (3) and creates no tag", () => {
      const r = run([], { STUB_BUILD_EXIT: '3' });
      expect(r.status).toBe(3);
      expect(r.stderr).toContain('ERROR: eas build --local failed with exit code 3');
      expect(tags()).toEqual([]);
      expect(r.stdout).not.toContain('Built and tagged');
    });

    it('exits 1 with no tag when eas exits 0 but writes no IPA', () => {
      const r = run([], { STUB_IPA: '' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`ERROR: eas build --local exited 0 but wrote no ${ipaOut}`);
      expect(tags()).toEqual([]);
    });

    it('creates no tag when HEAD moves during the build', () => {
      const r = run([], { STUB_MOVE_HEAD: repo });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('ERROR: HEAD moved during the build');
      expect(tags()).toEqual([]);
    });
  });

  describe('step 10: IPA check (mismatch keeps the IPA and creates no tag)', () => {
    it.each<[string, Record<string, Entry>, string]>([
      [
        'a CFBundleVersion that is not app.json\'s (e.g. an export that bumped it)',
        { [`${APP}/Info.plist`]: appInfo({ CFBundleVersion: '22' }) },
        'Hourglassxo.app: CFBundleVersion is 22, not 21',
      ],
      [
        'a different CFBundleShortVersionString',
        { [`${APP}/Info.plist`]: appInfo({ CFBundleShortVersionString: '1.1.0' }) },
        'Hourglassxo.app: CFBundleShortVersionString is 1.1.0, not 1.2.0',
      ],
      [
        'a widget with a different build',
        { [`${WIDGET}/Info.plist`]: widgetInfo({ CFBundleVersion: '20' }) },
        'Hourglassxo.app/PlugIns/ExpoWidgetsTarget.appex: CFBundleVersion is 20, not 21',
      ],
      [
        'a widget with no version',
        { [`${WIDGET}/Info.plist`]: { CFBundleVersion: BUILD } },
        'ExpoWidgetsTarget.appex: CFBundleShortVersionString is (missing), not 1.2.0',
      ],
      [
        'a DTXcodeBuild from another Xcode',
        { [`${APP}/Info.plist`]: appInfo({ DTXcodeBuild: '27A9275' }) },
        'DTXcodeBuild is 27A9275, but xcodebuild -version says 27A266a',
      ],
      [
        'a DTXcode from another Xcode',
        { [`${APP}/Info.plist`]: appInfo({ DTXcode: '2710' }) },
        'DTXcode is 2710, but xcodebuild -version says 27.0 (2700)',
      ],
      [
        'an iOS 26 SDK',
        { [`${APP}/Info.plist`]: appInfo({ DTSDKName: 'iphoneos26.2' }) },
        'DTSDKName is iphoneos26.2, not iphoneos27.x',
      ],
      [
        'no SDK build at all',
        { [`${APP}/Info.plist`]: appInfo({ DTPlatformBuild: undefined, DTSDKBuild: undefined }) },
        'Info.plist has neither DTPlatformBuild nor DTSDKBuild',
      ],
      [
        'an embedded runtime that differs from the resolved one',
        { [`${APP}/EXUpdates.bundle/fingerprint`]: OTHER_RTV },
        `the embedded runtime is ${OTHER_RTV}, but this tree resolves ${RTV}`,
      ],
      [
        'no EXUpdates.bundle/fingerprint',
        { [`${APP}/EXUpdates.bundle/fingerprint`]: null },
        "Expo.plist says file:fingerprint, but there's no EXUpdates.bundle/fingerprint",
      ],
      ['no Expo.plist', { [`${APP}/Expo.plist`]: null }, "no Expo.plist, so the embedded runtime can't be found"],
      [
        'an Expo.plist without EXUpdatesRuntimeVersion',
        { [`${APP}/Expo.plist`]: { EXUpdatesURL: 'https://u.expo.dev/x' } },
        'Expo.plist has no EXUpdatesRuntimeVersion',
      ],
      [
        'a literal Expo.plist runtime that differs',
        { [`${APP}/Expo.plist`]: { EXUpdatesRuntimeVersion: OTHER_RTV } },
        `the embedded runtime is ${OTHER_RTV}`,
      ],
      [
        'a profile with ProvisionedDevices (development or ad hoc)',
        { [`${APP}/embedded.mobileprovision`]: appStoreProfile({ ProvisionedDevices: ['00008110-000A'] }) },
        'Hourglassxo.app: the profile lists ProvisionedDevices',
      ],
      [
        'a profile with ProvisionsAllDevices (enterprise)',
        { [`${APP}/embedded.mobileprovision`]: appStoreProfile({ ProvisionsAllDevices: true }) },
        'Hourglassxo.app: the profile has ProvisionsAllDevices',
      ],
      [
        'a debuggable profile (get-task-allow true)',
        { [`${APP}/embedded.mobileprovision`]: appStoreProfile({ Entitlements: { 'get-task-allow': true } }) },
        "Hourglassxo.app: the profile's get-task-allow is true, not false",
      ],
      [
        'a profile with no get-task-allow',
        { [`${APP}/embedded.mobileprovision`]: appStoreProfile({ Entitlements: {} }) },
        "the profile's get-task-allow is (missing), not false",
      ],
      [
        'a widget with a development profile',
        { [`${WIDGET}/embedded.mobileprovision`]: appStoreProfile({ ProvisionedDevices: ['00008110-000A'] }) },
        'ExpoWidgetsTarget.appex: the profile lists ProvisionedDevices',
      ],
      [
        'no embedded.mobileprovision',
        { [`${APP}/embedded.mobileprovision`]: null },
        'Hourglassxo.app: no embedded.mobileprovision',
      ],
    ])('refuses %s', (_label, overrides, detail) => {
      makeIpa(ipaSource, ipaEntries(overrides));
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain(`IPA check failed: ${ipaOut}`);
      expect(r.stderr).toContain(detail);
      expect(r.stderr).toContain('no tag was created');
      expect(r.easCalls).toHaveLength(1);
      expect(fs.existsSync(ipaOut)).toBe(true);
      expect(tags()).toEqual([]);
      expect(r.stdout).not.toContain('Built and tagged');
    });

    it('lists every mismatch in one run', () => {
      makeIpa(
        ipaSource,
        ipaEntries({
          [`${APP}/Info.plist`]: appInfo({ CFBundleVersion: '22' }),
          [`${APP}/EXUpdates.bundle/fingerprint`]: OTHER_RTV,
        }),
      );
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('CFBundleVersion is 22, not 21');
      expect(r.stderr).toContain(`the embedded runtime is ${OTHER_RTV}`);
      expect(tags()).toEqual([]);
    });

    // DTXcode is major (2 digits), minor, patch. "08"/"09"/"010" pin base 10: bash reads a leading 0
    // as octal, so printf would abort on "08" with a bare bash error and turn "010" into 8.
    it.each<[string, string]>([
      ['27.1', '2710'],
      ['27.0.1', '2701'],
      ['27.08', '2780'],
      ['27.0.09', '2709'],
      ['27.010', '27100'],
    ])('derives DTXcode for Xcode %s as %s, in base 10', (xcodeVersion, dtXcode) => {
      makeIpa(ipaSource, ipaEntries({ [`${APP}/Info.plist`]: appInfo({ DTXcode: dtXcode }) }));
      const r = run([], { STUB_XCODE_OUT: `Xcode ${xcodeVersion}\nBuild version 27A266a` });
      expect(r.stderr).not.toMatch(/invalid (octal )?number|value too great/);
      expect(r.status).toBe(0);
      expect(tags()).toEqual([TAG]);
    });

    it('refuses a DTXcode that does not match a zero-padded Xcode minor read in base 10', () => {
      const r = run([], { STUB_XCODE_OUT: 'Xcode 27.08\nBuild version 27A266a' });
      expect(r.status).toBe(1);
      expect(r.stderr).not.toMatch(/invalid (octal )?number|value too great/);
      expect(r.stderr).toContain('DTXcode is 2700, but xcodebuild -version says 27.08 (2780)');
      expect(tags()).toEqual([]);
    });

    it('refuses a profile that security cannot decode', () => {
      const r = run([], { STUB_SECURITY_EXIT: '1' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("`security cms -D` can't decode embedded.mobileprovision");
      expect(tags()).toEqual([]);
    });

    it('refuses a file that is not a zip', () => {
      fs.writeFileSync(ipaSource, 'not a zip\n');
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("unzip can't list it");
      expect(fs.existsSync(ipaOut)).toBe(true);
      expect(tags()).toEqual([]);
    });

    it('refuses an IPA with no app under Payload/', () => {
      makeIpa(ipaSource, { 'Payload/readme.txt': 'x' });
      const r = run([]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('no Payload/<App>.app/Info.plist');
      expect(tags()).toEqual([]);
    });

    it('accepts a literal runtime in Expo.plist that equals the resolved one', () => {
      makeIpa(
        ipaSource,
        ipaEntries({
          [`${APP}/Expo.plist`]: { EXUpdatesRuntimeVersion: RTV },
          [`${APP}/EXUpdates.bundle/fingerprint`]: null,
        }),
      );
      const r = run([]);
      expect(r.status).toBe(0);
      expect(tags()).toEqual([TAG]);
    });
  });

  describe('steps 11-13: sha256, annotated tag and report', () => {
    const sha256 = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

    it('creates exactly one annotated tag, build-<N> at HEAD, with the exact message, and does not push it', () => {
      const head = git('rev-parse', 'HEAD');
      const r = run([]);
      expect(r.status).toBe(0);
      expect(tags()).toEqual([TAG]);
      expect(git('cat-file', '-t', TAG)).toBe('tag');
      expect(git('rev-parse', `${TAG}^{commit}`)).toBe(head);
      expect(git('for-each-ref', '--format=%(contents)', `refs/tags/${TAG}`) + '\n').toBe(
        tagMessage({ sha: sha256(ipaOut) }),
      );
      expect(remoteTags()).toBe('');
      expect(git('status', '--porcelain')).toBe('');
    });

    it('records DTSDKBuild on the SDK line when DTPlatformBuild is missing', () => {
      makeIpa(ipaSource, ipaEntries({ [`${APP}/Info.plist`]: appInfo({ DTPlatformBuild: undefined, DTSDKBuild: '24A431' }) }));
      const r = run([]);
      expect(r.status).toBe(0);
      expect(git('for-each-ref', '--format=%(contents)', `refs/tags/${TAG}`) + '\n').toBe(
        tagMessage({ sha: sha256(ipaOut), sdkBuild: '24A431' }),
      );
    });

    it('prints the IPA path, sha256, tag and the upload, VALID and push commands in that order', () => {
      const r = run([]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('Built and tagged; the tag is not pushed');
      expect(r.stdout).toMatch(reportLine('ipa', ipaOut));
      expect(r.stdout).toMatch(reportLine('sha256', sha256(ipaOut)));
      expect(r.stdout).toMatch(reportLine('tag', `${TAG} (annotated, local only)`));
      const submit = r.stdout.indexOf(`eas submit -p ios --profile production --path '${ipaOut}'`);
      const valid = r.stdout.indexOf(`node .appstore/asc.js builds, until it lists ${BUILD} as VALID`);
      const push = r.stdout.indexOf(`git push origin ${TAG}`);
      expect(submit).toBeGreaterThan(-1);
      expect(valid).toBeGreaterThan(submit);
      expect(push).toBeGreaterThan(valid);
      expect(r.stdout).toContain(`makes runtime ${RTV} OTA-eligible`);
    });

    it('hands off to scripts/ota-publish.sh: once pushed, the tag is its audience and build:list is never called', () => {
      expect(run([]).status).toBe(0);
      git('push', '-q', 'origin', `refs/tags/${TAG}`);
      const r = run(['--dry-run', 'check'], {}, 'ota-publish.sh');
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(reportLine('build', `tag ${TAG}, ${VERSION} (${BUILD})`));
      expect(r.stderr).not.toContain('WARNING:');
      expect(r.labels).toEqual(['npx expo-updates']);
    });

    it('before the push, scripts/ota-publish.sh does not count the tag', () => {
      expect(run([]).status).toBe(0);
      const r = run(['--dry-run', 'check'], {}, 'ota-publish.sh');
      // The eas stub answers build:list with exit 99, so the EAS fallback fails closed.
      expect(r.status).toBe(1);
      expect(r.labels).toEqual(['npx expo-updates', 'eas build:list']);
      expect(r.stdout).not.toContain('Dry run OK');
    });
  });
});

describe('scripts/build-ios-local.sh file', () => {
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
  it('uses no bash-4-only constructs and no arrays', () => {
    const code = source()
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/\bdeclare\s+-[a-zA-Z]*A/);
    expect(code).not.toMatch(/\b(mapfile|readarray)\b/);
    expect(code).not.toMatch(/\$\{[#!]?\w+(\[[^\]]*\])?(,,?|\^\^?)\}/);
    // Arrays: `name=(...)`, `${name[...]}` (BASH_REMATCH included) and `declare -a`.
    expect(code).not.toMatch(/(^|[\s;])\w+=\(/m);
    expect(code).not.toMatch(/\$\{#?\w+\[/);
    expect(code).not.toMatch(/\bdeclare\s+-[a-zA-Z]*a/);
  });
});
