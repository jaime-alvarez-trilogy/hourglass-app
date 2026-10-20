import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';
import pkg from '@/package.json';

type PrivacyManifest = NonNullable<NonNullable<ExpoConfig['ios']>['privacyManifests']>;

const expo = appJson.expo as unknown as ExpoConfig;

const pluginEntries = (name: string) =>
  (expo.plugins ?? []).filter((p) => (Array.isArray(p) ? (p as unknown[])[0] : p) === name);

const EXPECTED_PRIVACY_MANIFEST: PrivacyManifest = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [
    {
      NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeDeviceID',
      NSPrivacyCollectedDataTypeLinked: false,
      NSPrivacyCollectedDataTypeTracking: false,
      NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
    },
  ],
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
      NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
      NSPrivacyAccessedAPITypeReasons: ['C617.1', '0A2A.1', '3B52.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
      NSPrivacyAccessedAPITypeReasons: ['E174.1', '85F4.1'],
    },
    {
      NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
      NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
    },
  ],
};

const accessedApiReasons = (category: string) =>
  expo.ios?.privacyManifests?.NSPrivacyAccessedAPITypes?.find(
    (t) => t.NSPrivacyAccessedAPIType === category,
  )?.NSPrivacyAccessedAPITypeReasons;

describe('app.json — 03 native config cleanup', () => {
  describe('FR1: schema-invalid keys removed', () => {
    it('expo has no newArchEnabled key', () => {
      expect(expo).not.toHaveProperty('newArchEnabled');
    });

    it('expo.android has no edgeToEdgeEnabled key', () => {
      expect(expo.android).not.toHaveProperty('edgeToEdgeEnabled');
    });

    it('guard: expo.android.predictiveBackGestureEnabled stays false', () => {
      expect(expo.android?.predictiveBackGestureEnabled).toBe(false);
    });
  });

  describe('FR2: no fetch background mode', () => {
    it('UIBackgroundModes is exactly ["remote-notification"]', () => {
      expect(expo.ios?.infoPlist?.UIBackgroundModes).toEqual(['remote-notification']);
    });

    it('expo-background-fetch is not a dependency or devDependency', () => {
      expect(Object.keys(pkg.dependencies)).not.toContain('expo-background-fetch');
      expect(Object.keys(pkg.devDependencies)).not.toContain('expo-background-fetch');
    });

    it('expo-task-manager is not a dependency or devDependency', () => {
      expect(Object.keys(pkg.dependencies)).not.toContain('expo-task-manager');
      expect(Object.keys(pkg.devDependencies)).not.toContain('expo-task-manager');
    });
  });

  describe('FR3: no Face ID usage description', () => {
    // A leftover bare-string entry would run first under createRunOncePlugin and bring the key back.
    it('has exactly one expo-secure-store plugin entry, in tuple form', () => {
      const entries = pluginEntries('expo-secure-store');
      expect(entries).toHaveLength(1);
      expect(entries.map((e) => (Array.isArray(e) ? 'tuple' : 'string'))).toEqual(['tuple']);
    });

    it('the expo-secure-store entry is exactly ["expo-secure-store", { faceIDPermission: false }]', () => {
      expect(pluginEntries('expo-secure-store')[0]).toEqual([
        'expo-secure-store',
        { faceIDPermission: false },
      ]);
    });

    // Green before and after: the key is plugin-injected, so app.json never carries it today.
    it('expo.ios.infoPlist does not hard-code NSFaceIDUsageDescription', () => {
      expect(expo.ios?.infoPlist).not.toHaveProperty('NSFaceIDUsageDescription');
    });

    it('guard: ITSAppUsesNonExemptEncryption stays false', () => {
      expect(expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption).toBe(false);
    });
  });

  describe('FR4: app-level privacy manifest', () => {
    it('expo.ios.privacyManifests deep-equals the contract object, array order included', () => {
      expect(expo.ios?.privacyManifests).toEqual(EXPECTED_PRIVACY_MANIFEST);
    });

    it('UserDefaults reasons are exactly ["CA92.1", "1C8F.1"]', () => {
      expect(accessedApiReasons('NSPrivacyAccessedAPICategoryUserDefaults')).toEqual([
        'CA92.1',
        '1C8F.1',
      ]);
    });

    it('SystemBootTime reasons are exactly ["35F9.1"]', () => {
      expect(accessedApiReasons('NSPrivacyAccessedAPICategorySystemBootTime')).toEqual(['35F9.1']);
    });

    it('declares no tracking and no tracking domains', () => {
      expect(expo.ios?.privacyManifests?.NSPrivacyTracking).toBe(false);
      expect(expo.ios?.privacyManifests?.NSPrivacyTrackingDomains).toEqual([]);
    });

    it('declares exactly the four required-reason categories and no ActiveKeyboards', () => {
      const categories = (expo.ios?.privacyManifests?.NSPrivacyAccessedAPITypes ?? []).map(
        (t) => t.NSPrivacyAccessedAPIType,
      );
      expect(categories).toEqual([
        'NSPrivacyAccessedAPICategoryUserDefaults',
        'NSPrivacyAccessedAPICategoryFileTimestamp',
        'NSPrivacyAccessedAPICategoryDiskSpace',
        'NSPrivacyAccessedAPICategorySystemBootTime',
      ]);
      expect(categories).not.toContain('NSPrivacyAccessedAPICategoryActiveKeyboards');
    });

    it('collects only Device ID, not linked, not tracking, for app functionality', () => {
      expect(expo.ios?.privacyManifests?.NSPrivacyCollectedDataTypes).toEqual([
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeDeviceID',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
      ]);
    });
  });
});
