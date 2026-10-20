import { execFileSync } from 'child_process';
import * as path from 'path';
import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';

type IntrospectedConfig = ExpoConfig & { _internal: { pluginHistory: Record<string, unknown> } };

const ROOT = path.resolve(__dirname, '../..');
const EXPO_CLI = path.join(ROOT, 'node_modules/expo/bin/cli');
const staticExpo = appJson.expo as unknown as ExpoConfig;

let resolved: IntrospectedConfig;

beforeAll(() => {
  const stdout = execFileSync(
    process.execPath,
    [EXPO_CLI, 'config', '--type', 'introspect', '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  resolved = JSON.parse(stdout);
}, 60_000);

describe('resolved config (expo config --type introspect) — 03 native config cleanup', () => {
  describe('non-vacuity guards: config plugins actually ran', () => {
    it('expo-widgets set ios.infoPlist.ExpoWidgetsAppGroupIdentifier', () => {
      expect(resolved.ios?.infoPlist?.ExpoWidgetsAppGroupIdentifier).toBe(
        'group.com.jalvarez0907.hourglass.widgets',
      );
    });

    it('pluginHistory records expo-secure-store and expo-notifications', () => {
      expect(Object.keys(resolved._internal.pluginHistory)).toEqual(
        expect.arrayContaining(['expo-secure-store', 'expo-notifications']),
      );
    });
  });

  describe('FR1: schema-invalid keys absent after plugins', () => {
    it('has no top-level newArchEnabled and no android.edgeToEdgeEnabled', () => {
      expect(resolved).not.toHaveProperty('newArchEnabled');
      expect(resolved.android ?? {}).not.toHaveProperty('edgeToEdgeEnabled');
    });
  });

  describe('FR2: no fetch background mode after plugins', () => {
    it('ios.infoPlist.UIBackgroundModes is exactly ["remote-notification"]', () => {
      expect(resolved.ios?.infoPlist?.UIBackgroundModes).toEqual(['remote-notification']);
    });

    it('pluginHistory has neither expo-background-fetch nor expo-task-manager', () => {
      const history = Object.keys(resolved._internal.pluginHistory);
      expect(history).not.toContain('expo-background-fetch');
      expect(history).not.toContain('expo-task-manager');
    });
  });

  describe('FR3: no Face ID usage description after plugins', () => {
    it('ios.infoPlist.NSFaceIDUsageDescription is undefined', () => {
      expect(resolved.ios?.infoPlist?.NSFaceIDUsageDescription).toBeUndefined();
    });
  });

  describe('FR4: privacy manifest survives plugin resolution', () => {
    it('ios.privacyManifests deep-equals app.json and declares 1C8F.1 for UserDefaults', () => {
      const userDefaultsReasons = resolved.ios?.privacyManifests?.NSPrivacyAccessedAPITypes?.find(
        (t) => t.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults',
      )?.NSPrivacyAccessedAPITypeReasons;
      expect(userDefaultsReasons ?? []).toContain('1C8F.1');
      expect(resolved.ios?.privacyManifests).toEqual(staticExpo.ios?.privacyManifests);
    });
  });
});
