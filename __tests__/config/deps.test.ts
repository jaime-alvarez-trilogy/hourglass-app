// 06-dependency-hygiene — static dependency guards (FR1–FR4), ported and adapted by
// 10-sdk-58-ios-27 FR1: spec 06's FR5 (SDK 55 patch-line floors) is dropped, FR4 is the
// "install.exclude iff patched" rule, and react-native-inner-shadow stays removed.
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
  packageNames: string[]; // top-level first: 'a++b+1.0.0.patch' → ['a', 'b']
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

/**
 * Pure. The top-level package each patch file targets: `patches/X+*.patch` → X. A nested
 * `a++b+1.0.0.patch` targets `a`, the direct dependency whose bump would orphan it.
 * Unparseable filenames are rule 1's business, so they are skipped here.
 */
function patchedTopLevelPackages(patchFilenames: string[]): string[] {
  const names = new Set<string>();
  for (const file of patchFilenames) {
    const details = getPackageDetailsFromPatchFilename(file);
    if (details) names.add(details.packageNames[0]);
  }
  return [...names].sort();
}

/**
 * Pure. `expo.install.exclude` must contain X if and only if a `patches/X+*.patch` exists, and
 * every entry must be a direct dependency. An absent or empty list is valid with no patches.
 * Returns one human-readable problem per violation; [] means aligned.
 */
function collectExcludeProblems(pkg: PackageJson, patchFilenames: string[]): string[] {
  const exclude = pkg.expo?.install?.exclude ?? [];
  const patched = patchedTopLevelPackages(patchFilenames);
  const problems: string[] = [];
  for (const name of patched) {
    if (!exclude.includes(name)) {
      problems.push(`${name}: patched but missing from expo.install.exclude`);
    }
  }
  for (const name of exclude) {
    if (!patched.includes(name)) {
      problems.push(`${name}: in expo.install.exclude but no patches/${name}+*.patch exists`);
    }
    if (declaringSection(pkg, name) === undefined) {
      problems.push(`${name}: in expo.install.exclude but not a direct dependency`);
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

describe('FR3 (spec 10 FR1): the dead inner-shadow dependency is removed', () => {
  // Zero imports (GlassCard.tsx explains why) and JS-only, so removing it changes no native code.
  it('react-native-inner-shadow is in neither dependencies nor devDependencies', () => {
    expect(pkg.dependencies ?? {}).not.toHaveProperty(['react-native-inner-shadow']);
    expect(pkg.devDependencies ?? {}).not.toHaveProperty(['react-native-inner-shadow']);
  });

  it('package-lock.json has no node_modules/react-native-inner-shadow entry', () => {
    expect(lockVersion('react-native-inner-shadow')).toBeUndefined();
  });
});

describe('FR4 (spec 10 FR1): expo.install.exclude lists exactly the patched packages', () => {
  describe('real tree', () => {
    it('expo.install.exclude contains X if and only if a patches/X+*.patch file exists', () => {
      const exclude = [...(pkg.expo?.install?.exclude ?? [])].sort();
      expect(exclude).toEqual(patchedTopLevelPackages(patchFiles));
    });

    it('every expo.install.exclude entry is a direct dependency (no stale entries)', () => {
      const stale = (pkg.expo?.install?.exclude ?? []).filter(
        (name) => declaringSection(pkg, name) === undefined,
      );
      expect(stale).toEqual([]);
    });

    it('collectExcludeProblems(package.json, patches/) is []', () => {
      expect(collectExcludeProblems(pkg, patchFiles)).toEqual([]);
    });
  });

  describe('collectExcludeProblems fixtures', () => {
    const withExclude = (exclude?: string[]): PackageJson =>
      alignedPkg(exclude === undefined ? {} : { expo: { install: { exclude } } });

    it('control: no patches and no exclude list is valid', () => {
      expect(collectExcludeProblems(withExclude(), [])).toEqual([]);
    });

    it('control: no patches and an empty exclude list is valid', () => {
      expect(collectExcludeProblems(withExclude([]), [])).toEqual([]);
    });

    it('control: one patch, excluded, is valid', () => {
      expect(collectExcludeProblems(withExclude(['expo-widgets']), [WIDGETS_PATCH])).toEqual([]);
    });

    it('a patched package missing from the exclude list is reported', () => {
      expect(collectExcludeProblems(withExclude(), [WIDGETS_PATCH])).toEqual([
        'expo-widgets: patched but missing from expo.install.exclude',
      ]);
    });

    it('an exclude entry with no patch file is reported (exclude only while a patch exists)', () => {
      expect(collectExcludeProblems(withExclude(['expo-widgets']), [])).toEqual([
        'expo-widgets: in expo.install.exclude but no patches/expo-widgets+*.patch exists',
      ]);
    });

    it('an exclude entry that is not a direct dependency is reported', () => {
      const problems = collectExcludeProblems(withExclude(['left-pad']), ['left-pad+1.3.0.patch']);
      expect(problems).toEqual(['left-pad: in expo.install.exclude but not a direct dependency']);
    });

    it('a scoped patch maps to the scoped package name', () => {
      const p = alignedPkg({
        devDependencies: { '@scope/tool': '2.1.0' },
        expo: { install: { exclude: ['@scope/tool'] } },
      });
      expect(collectExcludeProblems(p, ['@scope+tool+2.1.0.patch'])).toEqual([]);
    });

    it('a nested a++b patch requires the top-level package a, not b', () => {
      const nested = (exclude: string[]): PackageJson =>
        alignedPkg({ dependencies: { a: '1.0.0' }, expo: { install: { exclude } } });
      expect(collectExcludeProblems(nested(['a']), ['a++b+1.0.0.patch'])).toEqual([]);
      expect(collectExcludeProblems(nested(['b']), ['a++b+1.0.0.patch'])).toEqual([
        'a: patched but missing from expo.install.exclude',
        'b: in expo.install.exclude but no patches/b+*.patch exists',
        'b: in expo.install.exclude but not a direct dependency',
      ]);
    });
  });
});

describe('helpers', () => {
  // Kept for the SDK 58 floors (spec 10 FR4); spec 06's SDK 55 patch-line floors are gone.
  describe('versionAtLeast', () => {
    it.each([
      ['58.0.16', '58.0.16', true],
      ['58.0.9', '58.0.16', false],
      ['0.88.10', '0.88.2', true],
      ['0.13.4', '0.13.4', true],
      ['0.88.2', '0.88.10', false],
      ['59.0.0', '58.0.16', true],
    ])('versionAtLeast(%s, %s) is %s', (actual, floor, expected) => {
      expect(versionAtLeast(actual, floor)).toBe(expected);
    });

    it('throws on a non x.y.z version instead of comparing NaN', () => {
      expect(() => versionAtLeast('~58.0.16', '58.0.16')).toThrow('not an x.y.z version');
    });
  });
});
