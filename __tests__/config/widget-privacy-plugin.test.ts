// 10-sdk-58-ios-27 FR6 (Decision 5, contract I10): plugins/withHourglassWidgetPrivacyManifest.js.
//
// React Native's privacy aggregation writes a manifest only for `:application` targets
// (react-native@0.88.0 scripts/cocoapods/privacy_manifest_utils.rb:52-54), so ExpoWidgetsTarget, an
// app extension that links React Native and reads app-group UserDefaults, ships none. Spec 05's
// remedy went through the deleted expo-widgets 55 patch. This plugin writes the extension's own
// PrivacyInfo.xcprivacy and adds it to that target's Resources build phase (spec-research F2.10).
//
// FIXTURE_PBXPROJ is the project.pbxproj a real `expo prebuild -p ios --no-install` writes for this
// app on SDK 58 (expo-widgets 58.0.21), before this plugin existed: ExpoWidgetsTarget is there and,
// like every app without localizations, it has no Resources build phase
// (expo-widgets plugin/src/ios/xcode/addBuildPhases.ts:84-96).

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';

type PlainObject = Record<string, unknown>;
type PhaseRef = { value: string; comment?: string };
type XcodeProject = {
  parseSync(): XcodeProject;
  writeSync(): string;
  hash: { project: { objects: Record<string, Record<string, PlainObject | string>> } };
  findTargetKey(name: string): string | null;
  pbxNativeTargetSection(): Record<string, PlainObject>;
  addBuildPhase(files: string[], isa: string, comment: string, target: string): unknown;
};
type ConfigWithMods = ExpoConfig & {
  mods?: { ios?: Record<string, (config: unknown) => Promise<{ modResults?: unknown }>> };
};
type PluginModule = ((config: ConfigWithMods) => ConfigWithMods) & {
  default?: unknown;
  buildWidgetPrivacyManifest(): PlainObject;
  addPrivacyManifestToTarget(project: XcodeProject, targetName: string): XcodeProject;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withHourglassWidgetPrivacyManifest') as PluginModule;
const { buildWidgetPrivacyManifest, addPrivacyManifestToTarget } = plugin;

const ROOT = path.resolve(__dirname, '../..');
const FIXTURE_PBXPROJ = path.join(__dirname, 'fixtures/expo-widgets-58.0.21.project.pbxproj');
const TARGET = 'ExpoWidgetsTarget';
const APP_TARGET = 'Hourglassxo';
const FILE = 'PrivacyInfo.xcprivacy';

// `xcode` and `@expo/plist` are what expo's own config plugins use. Resolve them from
// @expo/config-plugins (a dependency of `expo`) rather than relying on hoisting.
const configPluginsDir = path.dirname(
  require.resolve('@expo/config-plugins/package.json', { paths: [path.dirname(require.resolve('expo/package.json'))] }),
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const xcode = require(require.resolve('xcode', { paths: [configPluginsDir] })) as { project(file: string): XcodeProject };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plist = require(require.resolve('@expo/plist', { paths: [configPluginsDir] })) as {
  default: { parse(xml: string): unknown };
};

const EXPECTED_MANIFEST = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
  ],
};

const expo = appJson.expo as unknown as ExpoConfig;

function loadFixture(): XcodeProject {
  return xcode.project(FIXTURE_PBXPROJ).parseSync();
}

function section(project: XcodeProject, isa: string): Record<string, PlainObject | string> {
  return project.hash.project.objects[isa] ?? {};
}

function targetUuid(project: XcodeProject, name: string): string {
  const uuid = project.findTargetKey(name);
  if (!uuid) throw new Error(`fixture has no ${name} target`);
  return uuid;
}

/** The target's build phases of one isa, resolved to their objects. */
function targetPhases(project: XcodeProject, name: string, isa: string): PlainObject[] {
  const target = project.pbxNativeTargetSection()[targetUuid(project, name)] as { buildPhases?: PhaseRef[] };
  const phases = section(project, isa);
  return (target.buildPhases ?? []).map((ref) => phases[ref.value]).filter((p): p is PlainObject => typeof p === 'object');
}

/** File references (path) behind a phase's build files. */
function phaseFilePaths(project: XcodeProject, phase: PlainObject): string[] {
  const buildFiles = section(project, 'PBXBuildFile');
  const refs = section(project, 'PBXFileReference');
  return ((phase.files as PhaseRef[]) ?? []).map((f) => {
    const buildFile = buildFiles[f.value] as PlainObject | undefined;
    const ref = buildFile ? (refs[buildFile.fileRef as string] as PlainObject | undefined) : undefined;
    return String(ref?.path ?? '<dangling>').replace(/^"|"$/g, '');
  });
}

/** The PBXGroup expo-widgets creates for the target (name and path = target name). */
function targetGroup(project: XcodeProject): PlainObject & { children: PhaseRef[] } {
  const groups = Object.values(section(project, 'PBXGroup')).filter(
    (g): g is PlainObject & { children: PhaseRef[] } => typeof g === 'object' && String(g.path).replace(/^"|"$/g, '') === TARGET,
  );
  if (groups.length !== 1) throw new Error(`expected one ${TARGET} group with path ${TARGET}, found ${groups.length}`);
  return groups[0];
}

/** Deep copy of every object a target owns through its build phases, for before/after comparison. */
function snapshotTarget(project: XcodeProject, name: string): unknown {
  const target = project.pbxNativeTargetSection()[targetUuid(project, name)] as { buildPhases?: PhaseRef[] };
  const buildFiles = section(project, 'PBXBuildFile');
  return JSON.parse(
    JSON.stringify({
      target,
      phases: (target.buildPhases ?? []).map((ref) => {
        for (const isa of Object.keys(project.hash.project.objects)) {
          const phase = project.hash.project.objects[isa][ref.value];
          if (typeof phase === 'object') {
            return { phase, files: ((phase.files as PhaseRef[]) ?? []).map((f) => buildFiles[f.value]) };
          }
        }
        return null;
      }),
    }),
  );
}

function removeTarget(project: XcodeProject, name: string): XcodeProject {
  const targets = project.pbxNativeTargetSection();
  const uuid = targetUuid(project, name);
  delete targets[uuid];
  delete targets[`${uuid}_comment`];
  return project;
}

function tmpIosDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hg-widget-privacy-'));
}

async function runMod(config: ConfigWithMods, mod: string, iosDir: string, modResults?: unknown) {
  const fn = config.mods?.ios?.[mod];
  if (!fn) throw new Error(`no ios ${mod} mod registered`);
  return fn({
    ...config,
    modResults,
    modRequest: { projectRoot: ROOT, platformProjectRoot: iosDir, platform: 'ios', modName: mod, introspect: false },
  });
}

describe('buildWidgetPrivacyManifest (I10)', () => {
  it('declares exactly the four required reasons, no tracking, and no collected data', () => {
    expect(buildWidgetPrivacyManifest()).toEqual(EXPECTED_MANIFEST);
  });

  it('the reason codes are exactly CA92.1, 1C8F.1, C617.1 and 35F9.1, each under its full category name', () => {
    const types = buildWidgetPrivacyManifest().NSPrivacyAccessedAPITypes as {
      NSPrivacyAccessedAPIType: string;
      NSPrivacyAccessedAPITypeReasons: string[];
    }[];
    const byCategory = Object.fromEntries(types.map((t) => [t.NSPrivacyAccessedAPIType, [...t.NSPrivacyAccessedAPITypeReasons].sort()]));
    expect(byCategory).toEqual({
      NSPrivacyAccessedAPICategoryUserDefaults: ['1C8F.1', 'CA92.1'],
      NSPrivacyAccessedAPICategoryFileTimestamp: ['C617.1'],
      NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
    });
    expect(types.flatMap((t) => t.NSPrivacyAccessedAPITypeReasons).sort()).toEqual(['1C8F.1', '35F9.1', 'C617.1', 'CA92.1']);
  });

  it('returns a fresh object on every call', () => {
    const first = buildWidgetPrivacyManifest();
    (first.NSPrivacyAccessedAPITypes as unknown[]).length = 0;
    expect(buildWidgetPrivacyManifest()).toEqual(EXPECTED_MANIFEST);
  });
});

describe('the ios dangerous mod writes ExpoWidgetsTarget/PrivacyInfo.xcprivacy', () => {
  let dir: string;
  let xml: string;
  beforeAll(async () => {
    dir = tmpIosDir();
    fs.mkdirSync(path.join(dir, TARGET));
    await runMod(plugin({ name: expo.name, slug: expo.slug }), 'dangerous', dir);
    xml = fs.readFileSync(path.join(dir, TARGET, FILE), 'utf8');
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('the XML parses as a plist equal to buildWidgetPrivacyManifest()', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"')).toBe(true);
    expect(plist.default.parse(xml)).toEqual(EXPECTED_MANIFEST);
  });

  (process.platform === 'darwin' ? it : it.skip)('plutil -lint accepts it (macOS only)', () => {
    expect(execFileSync('plutil', ['-lint', path.join(dir, TARGET, FILE)], { encoding: 'utf8' })).toMatch(/: OK\s*$/);
  });
});

describe('addPrivacyManifestToTarget on the SDK 58 prebuild fixture', () => {
  it('precondition: the fixture has ExpoWidgetsTarget, without a Resources phase', () => {
    const project = loadFixture();
    expect(project.findTargetKey(TARGET)).not.toBeNull();
    expect(targetPhases(project, TARGET, 'PBXResourcesBuildPhase')).toEqual([]);
    expect(targetGroup(project).children.map((c) => c.comment)).not.toContain(FILE);
  });

  it('adds one Resources phase to ExpoWidgetsTarget holding exactly one PrivacyInfo.xcprivacy build file', () => {
    const project = addPrivacyManifestToTarget(loadFixture(), TARGET);
    const phases = targetPhases(project, TARGET, 'PBXResourcesBuildPhase');
    expect(phases).toHaveLength(1);
    expect(phaseFilePaths(project, phases[0])).toEqual([FILE]);
  });

  it("the file reference sits in the target's group, so it resolves to ExpoWidgetsTarget/PrivacyInfo.xcprivacy", () => {
    const project = addPrivacyManifestToTarget(loadFixture(), TARGET);
    const child = targetGroup(project).children.filter((c) => c.comment === FILE);
    expect(child).toHaveLength(1);
    const ref = section(project, 'PBXFileReference')[child[0].value] as PlainObject;
    expect(ref).toEqual(expect.objectContaining({ isa: 'PBXFileReference', path: FILE, sourceTree: '"<group>"' }));
    const [phase] = targetPhases(project, TARGET, 'PBXResourcesBuildPhase');
    const buildFile = section(project, 'PBXBuildFile')[(phase.files as PhaseRef[])[0].value] as PlainObject;
    expect(buildFile.fileRef).toBe(child[0].value);
  });

  it("doesn't touch the app target", () => {
    const before = snapshotTarget(loadFixture(), APP_TARGET);
    const project = addPrivacyManifestToTarget(loadFixture(), TARGET);
    expect(snapshotTarget(project, APP_TARGET)).toEqual(before);
    const [appResources] = targetPhases(project, APP_TARGET, 'PBXResourcesBuildPhase');
    expect(phaseFilePaths(project, appResources).filter((p) => p.endsWith(FILE))).toEqual(['Hourglassxo/PrivacyInfo.xcprivacy']);
  });

  it('a second run adds nothing (identical pbxproj text)', () => {
    const project = addPrivacyManifestToTarget(loadFixture(), TARGET);
    const once = project.writeSync();
    expect(addPrivacyManifestToTarget(project, TARGET).writeSync()).toBe(once);
  });

  it('the written pbxproj parses back with the same single build file', () => {
    const dir = tmpIosDir();
    try {
      const file = path.join(dir, 'project.pbxproj');
      fs.writeFileSync(file, addPrivacyManifestToTarget(loadFixture(), TARGET).writeSync());
      const reparsed = xcode.project(file).parseSync();
      const phases = targetPhases(reparsed, TARGET, 'PBXResourcesBuildPhase');
      expect(phases).toHaveLength(1);
      expect(phaseFilePaths(reparsed, phases[0])).toEqual([FILE]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reuses an existing Resources phase (the localizations case) instead of adding a second one', () => {
    const project = loadFixture();
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetUuid(project, TARGET));
    addPrivacyManifestToTarget(project, TARGET);
    const phases = targetPhases(project, TARGET, 'PBXResourcesBuildPhase');
    expect(phases).toHaveLength(1);
    expect(phaseFilePaths(project, phases[0])).toEqual([FILE]);
  });

  it('throws "ExpoWidgetsTarget: target not found" when the target is missing', () => {
    expect(() => addPrivacyManifestToTarget(removeTarget(loadFixture(), TARGET), TARGET)).toThrow(
      'ExpoWidgetsTarget: target not found',
    );
  });
});

describe('withHourglassWidgetPrivacyManifest (config plugin)', () => {
  it('is a function exported as the module (and as default)', () => {
    expect(typeof plugin).toBe('function');
    expect(plugin.default).toBe(plugin);
  });

  it('registers an ios xcodeproj mod that adds the manifest to ExpoWidgetsTarget', async () => {
    const dir = tmpIosDir();
    try {
      const result = await runMod(plugin({ name: expo.name, slug: expo.slug }), 'xcodeproj', dir, loadFixture());
      const project = result.modResults as XcodeProject;
      const phases = targetPhases(project, TARGET, 'PBXResourcesBuildPhase');
      expect(phases).toHaveLength(1);
      expect(phaseFilePaths(project, phases[0])).toEqual([FILE]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('app.json lists it immediately before withHourglassWidgetBackground', () => {
    const names = (expo.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    const background = names.indexOf('./plugins/withHourglassWidgetBackground');
    expect(background).toBeGreaterThan(0);
    expect(names[background - 1]).toBe('./plugins/withHourglassWidgetPrivacyManifest');
  });
});
