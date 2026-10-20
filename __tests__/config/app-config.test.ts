import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';
import easJson from '@/eas.json';
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
    {
      NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
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

    // Device ID: the anonymous push token and EAS-Client-ID (policy §5). Crash Data: expo-updates
    // sends the previous launch's fatal error to EAS Update in the Expo-Fatal-Error header
    // (FileDownloader.swift, ErrorRecovery.consumeErrorLog), which policy §5 discloses. Both must
    // match the App Privacy label (OPS O5).
    it('collects only Device ID and Crash Data, not linked, not tracking, for app functionality', () => {
      expect(expo.ios?.privacyManifests?.NSPrivacyCollectedDataTypes).toEqual(
        ['NSPrivacyCollectedDataTypeDeviceID', 'NSPrivacyCollectedDataTypeCrashData'].map((type) => ({
          NSPrivacyCollectedDataType: type,
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        })),
      );
    });
  });
});

describe('app.json — 04 OTA lane', () => {
  describe('FR1: fingerprint runtime policy', () => {
    it('expo.runtimeVersion is exactly { policy: "fingerprint" }', () => {
      expect(expo.runtimeVersion).toEqual({ policy: 'fingerprint' });
    });

    // resolveRuntimeVersionAsync reads config[platform]?.runtimeVersion ?? config.runtimeVersion,
    // so a platform-level value would shadow the top-level policy.
    it('neither expo.ios nor expo.android overrides runtimeVersion', () => {
      expect(expo.ios).not.toHaveProperty('runtimeVersion');
      expect(expo.android).not.toHaveProperty('runtimeVersion');
    });

    it('package.json version equals expo.version', () => {
      expect(pkg.version).toBe(expo.version);
    });

    // Guard (green before and after): binaries listen on this URL; it must stay tied to the EAS project.
    it('expo.updates.url is the u.expo.dev URL for extra.eas.projectId', () => {
      expect(expo.extra?.eas?.projectId).toEqual(expect.any(String));
      expect(expo.updates?.url).toBe(`https://u.expo.dev/${expo.extra?.eas?.projectId}`);
    });
  });
});

describe('05-release-build-18', () => {
  describe('FR1: build number with a pinned local version source', () => {
    // Range-based on purpose: later native builds take the next unused number (19+).
    it('ios.buildNumber is an integer string >= 18', () => {
      const buildNumber = expo.ios?.buildNumber;
      expect(typeof buildNumber).toBe('string');
      expect(buildNumber).toMatch(/^\d+$/);
      expect(Number(buildNumber)).toBeGreaterThanOrEqual(18);
    });

    it('expo.version is semver x.y.z', () => {
      expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    // toHaveProperty, not easJson.cli.appVersionSource: the inferred JSON type lacks the key
    // until it is added, so a direct read would be TS2339.
    it('eas.json pins cli.appVersionSource to local', () => {
      expect(easJson.cli).toHaveProperty('appVersionSource', 'local');
    });
  });
});
