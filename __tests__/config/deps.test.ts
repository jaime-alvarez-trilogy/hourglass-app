// 06-dependency-hygiene — static dependency guards (FR1–FR5).
// Reads package.json, package-lock.json and patches/ from disk on purpose (no mocks), so the
// guard sees exactly what `npm ci` + `postinstall` will see. Runs offline inside `npm test`.

import * as fs from 'fs';
import * as path from 'path';

type PatchDetails = {
  name: string;
  version: string;
  path: string; // e.g. 'node_modules/expo-widgets'
  isNested: boolean;
  patchFilename: string;
};

// patch-package ships no .d.ts; use its own parser + discovery so this guard reads
// patches/ exactly as `postinstall` does (scoped, nested `++`, `.dev`, sequence names).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPackageDetailsFromPatchFilename } = require('patch-package/dist/PackageDetails') as {
  getPackageDetailsFromPatchFilename(f: string): PatchDetails | null;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getPatchFiles } = require('patch-package/dist/patchFs') as {
  getPatchFiles(dir: string): string[];
};

const ROOT = path.resolve(__dirname, '../..');

type DepSection = 'dependencies' | 'devDependencies';

type PackageJson = {
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  expo?: { install?: { exclude?: string[] } };
};

type PackageLock = {
  packages: Record<
    string,
    {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
  >;
};

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** Which package.json section declares `name`, if any. */
function declaringSection(pkg: PackageJson, name: string): DepSection | undefined {
  if (pkg.dependencies && name in pkg.dependencies) return 'dependencies';
  if (pkg.devDependencies && name in pkg.devDependencies) return 'devDependencies';
  return undefined;
}

/** Pure. Returns one human-readable problem per violation; [] means aligned. */
function collectPatchProblems(
  pkg: PackageJson,
  lock: PackageLock,
  patchFilenames: string[],
): string[] {
  const problems: string[] = [];

  for (const file of patchFilenames) {
    const details = getPackageDetailsFromPatchFilename(file);
    // Rule 1: patch-package itself would skip this file with a warning.
    if (!details) {
      problems.push(`Unrecognized patch file: ${file}`);
      continue;
    }

    const { name, version } = details;

    if (!details.isNested) {
      const section = declaringSection(pkg, name);
      if (!section) {
        // Rule 2
        problems.push(`${name}: patched but not a direct dependency`);
      } else {
        const declared = pkg[section]![name];
        // Rule 3
        if (!EXACT_VERSION.test(declared) || declared !== version) {
          problems.push(`${name}: declared "${declared}" must be exactly "${version}" (${file})`);
        }
        // Rule 6
        const lockRootSpec = lock.packages['']?.[section]?.[name];
        if (lockRootSpec !== declared) {
          problems.push(
            `${name}: package-lock root spec "${lockRootSpec}" != package.json "${declared}"`,
          );
        }
      }
    }

    const lockPath = details.path.split(path.sep).join('/');
    const lockEntry = lock.packages[lockPath];
    if (!lockEntry) {
      // Rule 4
      problems.push(`${name}: not in package-lock.json at ${lockPath}`);
    } else if (lockEntry.version !== version) {
      // Rule 5
      problems.push(
        `${name}: lockfile has ${lockEntry.version}, patch is for ${version} (orphaned patch)`,
      );
    }
  }

  return problems;
}

/** Numeric x.y.z comparison (no prerelease handling needed for these packages). */
function versionAtLeast(actual: string, floor: string): boolean {
  const parse = (v: string): number[] => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
    if (!m) throw new Error(`versionAtLeast: not an x.y.z version: "${v}"`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };
  const a = parse(actual);
  const f = parse(floor);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== f[i]) return a[i] > f[i];
  }
  return true;
}

const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as T;

let pkg: PackageJson;
let lock: PackageLock;
let patchFiles: string[];

beforeAll(() => {
  pkg = readJson<PackageJson>('package.json');
  lock = readJson<PackageLock>('package-lock.json');
  patchFiles = getPatchFiles(path.join(ROOT, 'patches'));
});

const lockVersion = (name: string): string | undefined =>
  lock.packages[`node_modules/${name}`]?.version;

// ---------------------------------------------------------------------------
// Fixture builders: lockfile v3 shapes, aligned by default so each negative
// fixture differs from a passing tree in exactly one way.
// ---------------------------------------------------------------------------

const WIDGETS_PATCH = 'expo-widgets+55.0.5.patch';

function alignedPkg(overrides: Partial<PackageJson> = {}): PackageJson {
  return {
    dependencies: { 'expo-widgets': '55.0.5', react: '19.2.0' },
    devDependencies: { 'patch-package': '^8.0.1' },
    ...overrides,
  };
}

function alignedLock(
  packages: PackageLock['packages'] = {},
  rootOverrides: Partial<PackageLock['packages']['']> = {},
): PackageLock {
  return {
    packages: {
      '': {
        dependencies: { 'expo-widgets': '55.0.5', react: '19.2.0' },
        devDependencies: { 'patch-package': '^8.0.1' },
        ...rootOverrides,
      },
      'node_modules/expo-widgets': { version: '55.0.5' },
      'node_modules/react': { version: '19.2.0' },
      'node_modules/patch-package': { version: '8.0.1' },
      ...packages,
    },
  };
}

describe('FR1: patched packages are pinned to their patch version', () => {
  describe('real tree', () => {
    it('patches/ has at least one patch file and every filename parses', () => {
      expect(patchFiles.length).toBeGreaterThanOrEqual(1);
      const unparsed = patchFiles.filter((f) => getPackageDetailsFromPatchFilename(f) === null);
      expect(unparsed).toEqual([]);
    });

    it('dependencies["expo-widgets"] is exactly "55.0.5"', () => {
      expect(pkg.dependencies?.['expo-widgets']).toBe('55.0.5');
    });

    it('collectPatchProblems(package.json, package-lock.json, patches/) is []', () => {
      expect(collectPatchProblems(pkg, lock, patchFiles)).toEqual([]);
    });
  });

  describe('collectPatchProblems fixtures', () => {
    it('control: an aligned tree has no problems', () => {
      expect(collectPatchProblems(alignedPkg(), alignedLock(), [WIDGETS_PATCH])).toEqual([]);
    });

    it('control: a scoped, exact-pinned devDependency patch has no problems', () => {
      const p = alignedPkg({ devDependencies: { '@scope/tool': '2.1.0' } });
      const l = alignedLock(
        { 'node_modules/@scope/tool': { version: '2.1.0' } },
        { devDependencies: { '@scope/tool': '2.1.0' } },
      );
      expect(collectPatchProblems(p, l, ['@scope+tool+2.1.0.patch'])).toEqual([]);
    });

    it('rule 3: a range spec (^55.0.5) is rejected', () => {
      const p = alignedPkg({ dependencies: { 'expo-widgets': '^55.0.5' } });
      const l = alignedLock({}, { dependencies: { 'expo-widgets': '^55.0.5' } });
      const problems = collectPatchProblems(p, l, [WIDGETS_PATCH]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('expo-widgets');
      expect(problems[0]).toContain('exactly "55.0.5"');
    });

    it('rule 3: an exact spec for a different version is rejected', () => {
      const p = alignedPkg({ dependencies: { 'expo-widgets': '55.0.6' } });
      const l = alignedLock({}, { dependencies: { 'expo-widgets': '55.0.6' } });
      const problems = collectPatchProblems(p, l, [WIDGETS_PATCH]);
      expect(problems).toEqual([
        expect.stringContaining('expo-widgets: declared "55.0.6" must be exactly "55.0.5"'),
      ]);
    });

    it('rule 5: lockfile drift (55.0.20 vs patch 55.0.5) is an orphaned patch', () => {
      const l = alignedLock({ 'node_modules/expo-widgets': { version: '55.0.20' } });
      const problems = collectPatchProblems(alignedPkg(), l, [WIDGETS_PATCH]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('expo-widgets');
      expect(problems[0]).toContain('55.0.20');
      expect(problems[0]).toContain('orphaned patch');
    });

    it('rule 4: a patched package missing from package-lock.json is reported', () => {
      const l = alignedLock();
      delete l.packages['node_modules/expo-widgets'];
      const problems = collectPatchProblems(alignedPkg(), l, [WIDGETS_PATCH]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('expo-widgets');
      expect(problems[0]).toContain('not in package-lock.json');
      expect(problems[0]).toContain('node_modules/expo-widgets');
    });

    it('rule 2: a patch for a package not declared in package.json is reported', () => {
      const l = alignedLock({ 'node_modules/left-pad': { version: '1.3.0' } });
      const problems = collectPatchProblems(alignedPkg(), l, ['left-pad+1.3.0.patch']);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('left-pad');
      expect(problems[0]).toContain('not a direct dependency');
    });

    it('rule 1: an unparseable patch filename is reported', () => {
      expect(collectPatchProblems(alignedPkg(), alignedLock(), ['garbage.patch'])).toEqual([
        'Unrecognized patch file: garbage.patch',
      ]);
    });

    it('rule 6: lockfile root spec ^55.0.5 vs package.json 55.0.5 is reported', () => {
      const l = alignedLock({}, { dependencies: { 'expo-widgets': '^55.0.5', react: '19.2.0' } });
      const problems = collectPatchProblems(alignedPkg(), l, [WIDGETS_PATCH]);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('expo-widgets');
      expect(problems[0]).toContain('package-lock root spec');
      expect(problems[0]).toContain('"^55.0.5"');
    });

    it('nested a++b+1.0.0.patch only needs the nested lock entry (b need not be direct)', () => {
      const l = alignedLock({ 'node_modules/a/node_modules/b': { version: '1.0.0' } });
      expect(collectPatchProblems(alignedPkg(), l, ['a++b+1.0.0.patch'])).toEqual([]);
    });

    it('nested patch with lock drift at the nested path is still an orphaned patch', () => {
      const l = alignedLock({ 'node_modules/a/node_modules/b': { version: '1.0.1' } });
      const problems = collectPatchProblems(alignedPkg(), l, ['a++b+1.0.0.patch']);
      expect(problems).toEqual([
        expect.stringContaining('b: lockfile has 1.0.1, patch is for 1.0.0 (orphaned patch)'),
      ]);
    });
  });
});

describe('FR2: a failed or mismatched patch fails the install', () => {
  it('postinstall runs patch-package with --error-on-fail and --error-on-warn', () => {
    const postinstall = pkg.scripts?.postinstall ?? '';
    expect(postinstall).toMatch(/^patch-package(\s|$)/);
    const argv = postinstall.split(/\s+/);
    expect(argv).toEqual(expect.arrayContaining(['--error-on-fail', '--error-on-warn']));
  });

  it('patch-package stays a devDependency', () => {
    expect(pkg.devDependencies?.['patch-package']).toBeDefined();
  });
});

describe('FR3: the unused dev tunnel helper is removed', () => {
  it('@expo/ngrok is in neither dependencies nor devDependencies', () => {
    expect(pkg.dependencies ?? {}).not.toHaveProperty(['@expo/ngrok']);
    expect(pkg.devDependencies ?? {}).not.toHaveProperty(['@expo/ngrok']);
  });

  it('package-lock.json has no node_modules/@expo/ngrok* entries', () => {
    const ngrokKeys = Object.keys(lock.packages).filter((k) =>
      k.startsWith('node_modules/@expo/ngrok'),
    );
    expect(ngrokKeys).toEqual([]);
  });
});

describe('FR4: expo install stays away from expo-widgets', () => {
  it('expo.install.exclude is an array containing "expo-widgets"', () => {
    expect(pkg.expo?.install?.exclude).toEqual(expect.arrayContaining(['expo-widgets']));
  });

  it('every expo.install.exclude entry is a direct dependency (no stale entries)', () => {
    const exclude = pkg.expo?.install?.exclude;
    // Non-vacuous: a missing or empty list must not pass this guard.
    expect(exclude).toEqual(expect.arrayContaining([expect.any(String)]));
    const stale = (exclude ?? []).filter((name) => declaringSection(pkg, name) === undefined);
    expect(stale).toEqual([]);
  });
});

describe('FR5: refreshed to the latest SDK 55 patch line', () => {
  describe('versionAtLeast', () => {
    it.each([
      ['55.0.31', '55.0.31', true],
      ['55.0.7', '55.0.31', false],
      ['0.83.10', '0.83.2', true],
      ['0.7.4', '0.7.4', true],
      ['0.83.2', '0.83.10', false],
      ['56.0.0', '55.0.31', true],
    ])('versionAtLeast(%s, %s) is %s', (actual, floor, expected) => {
      expect(versionAtLeast(actual, floor)).toBe(expected);
    });

    it('throws on a non x.y.z version instead of comparing NaN', () => {
      expect(() => versionAtLeast('^55.0.31', '55.0.31')).toThrow('not an x.y.z version');
    });
  });

  // [package, floor, required release line]
  it.each([
    ['expo', '55.0.31', '55.'],
    ['react-native', '0.83.10', '0.83.'],
    ['expo-notifications', '55.0.27', '55.'],
    ['expo-updates', '55.0.33', '55.'],
    ['jest-expo', '55.0.22', '55.'],
    // reanimated 4.2.x supports worklets 0.7.x only (react-native-reanimated/compatibility.json)
    ['react-native-worklets', '0.7.4', '0.7.'],
  ])('lockfile %s is >= %s and stays on the %s line', (name, floor, line) => {
    const version = lockVersion(name);
    expect(version).toBeDefined();
    expect(version).toMatch(new RegExp(`^${line.replace(/\./g, '\\.')}`));
    expect({ version, atLeastFloor: versionAtLeast(version!, floor) }).toEqual({
      version,
      atLeastFloor: true,
    });
  });
});
