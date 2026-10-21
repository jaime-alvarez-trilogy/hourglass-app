// 10-sdk-58-ios-27 FR6 (Decision 5 (b), contract I7): plugins/withHourglassWidgetBackground.js.
//
// expo-widgets 56.0.0 removed the native widget background "in favor of @expo/ui modifier", and
// the 55 patch that re-added it is retired. The JS layout now sets containerBackground on each
// system root, but WidgetKit keeps evaluating the layout string build 18 stored in the App Group
// until 1.2.0 is opened once, and that layout has none. iOS 17+ shows its "adopt containerBackground
// API" placeholder for such a widget. The plugin puts the build-18 background back natively, on
// the generated entry view, so the update window is covered without a patch or a version pin.
//
// FIXTURE is the HourglassWidget.swift that expo-widgets@58.0.21 writes for this app.json: the
// non-configurable `widgetSwift` template in plugin/src/ios/withWidgetSourceFiles.ts (:353-368),
// copied byte-for-byte from a real `expo prebuild` output. A case below re-generates it with the
// installed expo-widgets mod, so a template change fails here before it can fail a prebuild.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';

type ConfigWithMods = ExpoConfig & {
  mods?: { ios?: { dangerous?: (config: unknown) => Promise<unknown> } };
};
type ConfigPlugin = (config: ConfigWithMods) => ConfigWithMods;
type WidgetsProps = { groupIdentifier: string; widgets: { name: string }[] };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withHourglassWidgetBackground') as ConfigPlugin & {
  addContainerBackground(source: string): string;
};
const { addContainerBackground } = plugin;

const ROOT = path.resolve(__dirname, '../..');
const ANCHOR = 'WidgetsEntryView(entry: entry)';
const MODIFIED = 'WidgetsEntryView(entry: entry).modifier(HourglassContainerBackground())';

const FIXTURE = [
  'import WidgetKit',
  'import SwiftUI',
  'internal import ExpoWidgets',
  '',
  'struct HourglassWidget: Widget {',
  '  let name: String = "HourglassWidget"',
  '',
  '  var body: some WidgetConfiguration {',
  '    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in',
  '      WidgetsEntryView(entry: entry)',
  '    }',
  '    .configurationDisplayName("Hourglass")',
  '    .description("Track your weekly hours and earnings")',
  '    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])',
  '    .contentMarginsDisabled()',
  '  }',
  '}',
].join('\n');

const expo = appJson.expo as unknown as ExpoConfig;

function countOf(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** The `expo-widgets` tuple's props from app.json. */
function expoWidgetsProps(): WidgetsProps {
  const entry = (expo.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-widgets');
  if (!Array.isArray(entry)) throw new Error('app.json has no expo-widgets tuple');
  return entry[1] as WidgetsProps;
}

/** expo-widgets' own source-file plugin (the dangerous mod that writes ExpoWidgetsTarget/*). */
function expoWidgetsSourceFilesPlugin(): (config: ConfigWithMods, props: object) => ConfigWithMods {
  const file = path.join(path.dirname(require.resolve('expo-widgets/package.json')), 'plugin/build/ios/withWidgetSourceFiles.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require(file) as { default: (config: ConfigWithMods, props: object) => ConfigWithMods }).default;
}

function withExpoWidgetsSourceFiles(config: ConfigWithMods): ConfigWithMods {
  const { widgets, groupIdentifier } = expoWidgetsProps();
  return expoWidgetsSourceFilesPlugin()(config, {
    targetName: 'ExpoWidgetsTarget',
    widgets,
    groupIdentifier,
    onFilesGenerated: () => undefined,
  });
}

function baseConfig(): ConfigWithMods {
  return { name: expo.name, slug: expo.slug, version: expo.version, ios: { ...expo.ios } };
}

/** Runs the config's ios dangerous-mod chain against `iosDir`, as `expo prebuild` does. */
async function runDangerousMods(config: ConfigWithMods, iosDir: string): Promise<void> {
  const mod = config.mods?.ios?.dangerous;
  if (!mod) throw new Error('no ios dangerous mod registered');
  await mod({
    ...config,
    modRequest: { projectRoot: ROOT, platformProjectRoot: iosDir, platform: 'ios', modName: 'dangerous', introspect: false },
  });
}

function tmpIosDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hg-widget-bg-'));
}

describe('addContainerBackground (I7 transform)', () => {
  it('inserts .modifier(HourglassContainerBackground()) on the entry view exactly once', () => {
    const out = addContainerBackground(FIXTURE);
    expect(countOf(out, MODIFIED)).toBe(1);
    expect(countOf(out, ANCHOR)).toBe(1); // replaced in place, not duplicated
    expect(countOf(out, '.modifier(HourglassContainerBackground())')).toBe(1);
  });

  it('appends the HourglassContainerBackground ViewModifier: iOS 17+ background #0D0D1A, else content', () => {
    const out = addContainerBackground(FIXTURE);
    expect(countOf(out, 'struct HourglassContainerBackground: ViewModifier')).toBe(1);
    const struct = out.slice(out.indexOf('struct HourglassContainerBackground'));
    expect(struct).toContain('if #available(iOS 17.0, *)');
    expect(struct).toContain('content.containerBackground(Color(red: 0.051, green: 0.051, blue: 0.102), for: .widget)');
    expect(struct).toMatch(/\}\s*else\s*\{\s*content\s*\}/);
  });

  it('changes nothing else in the generated file', () => {
    const out = addContainerBackground(FIXTURE);
    const structStart = out.indexOf('\n\n// Added by plugins/withHourglassWidgetBackground.js');
    expect(structStart).toBeGreaterThan(0);
    expect(out.slice(0, structStart).replace('.modifier(HourglassContainerBackground())', '')).toBe(FIXTURE);
  });

  it('is idempotent: a second run returns identical text', () => {
    const once = addContainerBackground(FIXTURE);
    expect(addContainerBackground(once)).toBe(once);
  });

  it("throws when the anchor 'WidgetsEntryView(entry: entry)' is missing", () => {
    const changedTemplate = FIXTURE.replace(ANCHOR, 'WidgetsEntryView(entry: entry, family: family)');
    expect(() => addContainerBackground(changedTemplate)).toThrow(
      "HourglassWidget.swift: anchor 'WidgetsEntryView(entry: entry)' not found",
    );
    expect(() => addContainerBackground('')).toThrow("anchor 'WidgetsEntryView(entry: entry)' not found");
  });
});

describe('the fixture is the real expo-widgets 58 output', () => {
  it('expo-widgets is 58.x (the template this fixture was copied from)', () => {
    const { version } = require('expo-widgets/package.json') as { version: string };
    expect(version).toMatch(/^58\./);
  });

  it("the installed expo-widgets writes exactly FIXTURE for app.json's HourglassWidget", async () => {
    const dir = tmpIosDir();
    try {
      await runDangerousMods(withExpoWidgetsSourceFiles(baseConfig()), dir);
      expect(fs.readFileSync(path.join(dir, 'ExpoWidgetsTarget/HourglassWidget.swift'), 'utf8')).toBe(FIXTURE);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('withHourglassWidgetBackground (config plugin)', () => {
  it('is a function exported as the module (and as default)', () => {
    expect(typeof plugin).toBe('function');
    expect((plugin as unknown as { default?: unknown }).default).toBe(plugin);
  });

  it('its ios dangerous mod rewrites ExpoWidgetsTarget/HourglassWidget.swift in place', async () => {
    const dir = tmpIosDir();
    try {
      fs.mkdirSync(path.join(dir, 'ExpoWidgetsTarget'));
      fs.writeFileSync(path.join(dir, 'ExpoWidgetsTarget/HourglassWidget.swift'), FIXTURE);
      await runDangerousMods(plugin(baseConfig()), dir);
      expect(fs.readFileSync(path.join(dir, 'ExpoWidgetsTarget/HourglassWidget.swift'), 'utf8')).toBe(
        addContainerBackground(FIXTURE),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails the prebuild when the generated file is missing', async () => {
    const dir = tmpIosDir();
    try {
      await expect(runDangerousMods(plugin(baseConfig()), dir)).rejects.toThrow('HourglassWidget.swift');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('listed before expo-widgets, its mod runs after expo-widgets writes the file (mod order)', async () => {
    const dir = tmpIosDir();
    try {
      // app.json order: this plugin, then expo-widgets. The later plugin's mod runs first.
      await runDangerousMods(withExpoWidgetsSourceFiles(plugin(baseConfig())), dir);
      expect(fs.readFileSync(path.join(dir, 'ExpoWidgetsTarget/HourglassWidget.swift'), 'utf8')).toBe(
        addContainerBackground(FIXTURE),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('app.json lists it immediately before the expo-widgets tuple', () => {
    const names = (expo.plugins ?? []).map((p) => (Array.isArray(p) ? p[0] : p));
    const widgets = names.indexOf('expo-widgets');
    expect(widgets).toBeGreaterThan(0);
    expect(names[widgets - 1]).toBe('./plugins/withHourglassWidgetBackground');
  });
});
