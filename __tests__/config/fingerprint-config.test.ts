// 04-ota-lane FR1 (lockfile root version) + FR2 (fingerprint scope).
// This file reads from disk on purpose; app-config.test.ts is restricted to typed JSON
// imports by spec 03's test-file contract.

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SourceSkips } from 'expo/fingerprint';
import appJson from '@/app.json';

const ROOT = path.resolve(__dirname, '../..');

const EXPECTED_SOURCE_SKIPS = ['ExpoConfigVersions', 'GitIgnore', 'PackageJsonScriptsAll'];

type FingerprintConfig = Record<string, unknown> & { sourceSkips?: unknown };

const loadFingerprintConfig = () =>
  jest.requireActual<FingerprintConfig>('../../fingerprint.config.js');

const readFingerprintIgnoreLines = (): string[] =>
  fs
    .readFileSync(path.join(ROOT, '.fingerprintignore'), 'utf8')
    .split('\n')
    .map((line: string) => line.trim());

describe('FR1: lockfile root version', () => {
  // `npm ci` does not catch root-version drift (measured 2026-10-19), so assert it here.
  // Only these two root fields are read; nothing else in the lockfile is asserted.
  let lock: { version?: string; packages: Record<string, { version?: string }> };

  beforeAll(() => {
    lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  });

  it('package-lock.json top-level version equals expo.version', () => {
    expect(lock.version).toBe(appJson.expo.version);
  });

  it('package-lock.json packages[""].version equals expo.version', () => {
    expect(lock.packages[''].version).toBe(appJson.expo.version);
  });
});

describe('FR2: fingerprint scope', () => {
  describe('fingerprint.config.js', () => {
    it('exports exactly { sourceSkips } with ExpoConfigVersions, PackageJsonScriptsAll and GitIgnore', () => {
      const config = loadFingerprintConfig();
      expect(Object.keys(config)).toEqual(['sourceSkips']);
      expect(Array.isArray(config.sourceSkips)).toBe(true);
      expect([...(config.sourceSkips as string[])].sort()).toEqual(EXPECTED_SOURCE_SKIPS);
    });

    // @expo/fingerprint's normalizeSourceSkips silently drops unknown names, so a typo
    // would quietly turn a skip off instead of failing.
    it('every sourceSkips entry is a SourceSkips enum name from expo/fingerprint', () => {
      const sourceSkips = loadFingerprintConfig().sourceSkips as string[];
      const enumValues = SourceSkips as unknown as Record<string, unknown>;
      expect(sourceSkips.length).toBeGreaterThan(0);
      expect(sourceSkips.filter((name) => typeof enumValues[name] !== 'number')).toEqual([]);
    });

    // Guard: @expo/fingerprint also accepts fingerprint.config.cjs and takes whichever file
    // it stats first, which would make the effective config ambiguous.
    it('guard: there is no competing fingerprint.config.cjs', () => {
      expect(fs.existsSync(path.join(ROOT, 'fingerprint.config.cjs'))).toBe(false);
    });
  });

  describe('.fingerprintignore', () => {
    it('has exactly one effective pattern: eas.json', () => {
      const patterns = readFingerprintIgnoreLines().filter(
        (line) => line !== '' && !line.startsWith('#'),
      );
      expect(patterns).toEqual(['eas.json']);
    });

    it('explains itself with at least one # comment line', () => {
      expect(readFingerprintIgnoreLines().filter((line) => line.startsWith('#')).length).toBeGreaterThan(0);
    });
  });

  // Guard: EAS builds the upload archive from git (no .easignore), so a gitignored config
  // file would be missing on EAS and the local and EAS runtimes would silently diverge.
  it('guard: neither fingerprint.config.js nor .fingerprintignore is gitignored', () => {
    const result = spawnSync(
      'git',
      ['check-ignore', '--no-index', 'fingerprint.config.js', '.fingerprintignore'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    // git check-ignore exits 1 when none of the paths is ignored.
    expect({ status: result.status, ignored: result.stdout.trim() }).toEqual({ status: 1, ignored: '' });
  });
});
