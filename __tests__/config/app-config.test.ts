import type { ExpoConfig } from 'expo/config';
import appJson from '@/app.json';
import easJson from '@/eas.json';
import pkg from '@/package.json';

type PrivacyManifest = NonNullable<NonNullable<ExpoConfig['ios']>['privacyManifests']>;

const expo = appJson.expo as unknown as ExpoConfig;

const pluginEntries = (name: string) =>
  (expo.plugins ?? []).filter((p) => (Array.isArray(p) ? (p as unknown[])[0] : p) === name);

/** Plugin names in app.json order (a tuple contributes its first element). */
const pluginNames = () => (expo.plugins ?? []).map((p) => (Array.isArray(p) ? (p as unknown[])[0] : p));

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

// Spec 10 Decision 9: the only expo-build-properties entry allowed is the precompiled-modules
// fallback. Returns every plugin entry naming expo-build-properties that isn't exactly it.
const BUILD_PROPERTIES_FALLBACK = ['expo-build-properties', { ios: { usePrecompiledModules: false } }];
const disallowedBuildPropertiesEntries = (plugins: unknown[]) =>
  plugins.filter((p) => {
    const name = Array.isArray(p) ? (p as unknown[])[0] : p;
    if (typeof name !== 'string' || !name.includes('expo-build-properties')) return false;
    return JSON.stringify(p) !== JSON.stringify(BUILD_PROPERTIES_FALLBACK);
  });

// Integer comparison of x.y.z strings; NaN-safe (a non-semver value compares as less).
const semverAtLeast = (version: string | undefined, floor: [number, number, number]) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!m) return false;
  const v = m.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (v[i] !== floor[i]) return v[i] > floor[i];
  return true;
};

// eas.json's inferred type only has the keys present today, so optional keys are read through
// this cast (and asserted with toHaveProperty) instead of a direct property access.
type EasBuildProfile = { ios?: { image?: string } };

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

describe('10-sdk-58-ios-27', () => {
  // FR1: every EAS build in spec 10 runs on the same CLI. eas-cli >= 22 changed the build JSON
  // shape (scripts/ota-publish.sh reads both), and 25.2.0 is the floor recorded in spec-research.
  it('eas cli.version floor is >= 25.2.0', () => {
    const m = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(easJson.cli.version);
    expect(m).not.toBeNull();
    const [major, minor, patch] = m!.slice(1).map(Number);
    const floor = major * 1e6 + minor * 1e3 + patch;
    expect({ version: easJson.cli.version, atLeast25_2_0: floor >= 25_002_000 }).toEqual({
      version: easJson.cli.version,
      atLeast25_2_0: true,
    });
  });

  // FR5 (Decision 9): the SDK 58 template generates the scene lifecycle and the iOS 16.4 minimum,
  // so no plugin may force either.
  it('plugins never mention enableSceneSupport or deploymentTarget', () => {
    const plugins = JSON.stringify(expo.plugins ?? []);
    expect(plugins).not.toContain('enableSceneSupport');
    expect(plugins).not.toContain('deploymentTarget');
  });

  it('any expo-build-properties entry is exactly { ios: { usePrecompiledModules: false } }', () => {
    expect(disallowedBuildPropertiesEntries(expo.plugins ?? [])).toEqual([]);
    // The predicate itself: the exact fallback passes; every other form is flagged.
    const bare = 'expo-build-properties';
    const scenes = ['expo-build-properties', { ios: { enableSceneSupport: true } }];
    const extra = ['expo-build-properties', { ios: { usePrecompiledModules: false, deploymentTarget: '17.0' } }];
    const on = ['expo-build-properties', { ios: { usePrecompiledModules: true } }];
    expect(disallowedBuildPropertiesEntries([BUILD_PROPERTIES_FALLBACK, 'expo-router'])).toEqual([]);
    expect(disallowedBuildPropertiesEntries([bare, scenes, extra, on, BUILD_PROPERTIES_FALLBACK])).toEqual([
      bare,
      scenes,
      extra,
      on,
    ]);
  });

  it('ios.infoPlist has no UIApplicationSceneManifest; ios has no deploymentTarget', () => {
    expect(expo.ios?.infoPlist).not.toHaveProperty('UIApplicationSceneManifest');
    expect(expo.ios).not.toHaveProperty('deploymentTarget');
  });

  it('expo.version is semver >= 1.2.0', () => {
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect({ version: expo.version, atLeast1_2_0: semverAtLeast(expo.version, [1, 2, 0]) }).toEqual({
      version: expo.version,
      atLeast1_2_0: true,
    });
    // The helper compares numerically, not lexically.
    expect(['1.10.0', '1.2.0', '1.1.9', 'x'].map((v) => semverAtLeast(v, [1, 2, 0]))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('ios.buildNumber is an integer string >= 19', () => {
    const buildNumber = expo.ios?.buildNumber;
    expect(typeof buildNumber).toBe('string');
    expect(buildNumber).toMatch(/^\d+$/);
    expect(Number(buildNumber)).toBeGreaterThanOrEqual(19);
  });

  // Decision 10 (a): windows resize freely on iOS 27; requireFullScreen (deprecated) stays off.
  // Flips to `toBe(true)` only under Decision 10 (b).
  it('supportsTablet stays true and requireFullScreen is not true', () => {
    expect(expo.ios?.supportsTablet).toBe(true);
    expect(expo.ios?.requireFullScreen).not.toBe(true);
  });

  // Decision 8: production pins the Xcode 27.1 GA image by full name, so a moving alias can't
  // change the toolchain under build 19.
  it('eas production ios.image is a full xcode-27 image name, not an alias', () => {
    const production = easJson.build.production as EasBuildProfile;
    expect(production).toHaveProperty(
      ['ios', 'image'],
      expect.stringMatching(/^macos-[a-z]+-\d+(\.\d+)*-xcode-27(\.\d+)+$/),
    );
    expect(['auto', 'default', 'latest', 'sdk-58']).not.toContain(production.ios?.image);
  });

  it('eas development and preview have no ios.image', () => {
    expect(easJson.build.development).not.toHaveProperty(['ios', 'image']);
    expect(easJson.build.preview).not.toHaveProperty(['ios', 'image']);
  });

  it('web.output stays static', () => {
    expect(expo.web?.output).toBe('static');
  });

  // FR6 (Decision 5): a later plugin's mod runs first (@expo/config-plugins withMod: action, then
  // nextMod), so a plugin listed *before* expo-widgets runs *after* it and sees the files and the
  // ExpoWidgetsTarget target that expo-widgets just generated.
  it('withHourglassWidgetBackground is listed immediately before expo-widgets', () => {
    const names = pluginNames();
    const widgets = names.indexOf('expo-widgets');
    expect(widgets).toBeGreaterThan(0);
    expect(Array.isArray((expo.plugins ?? [])[widgets])).toBe(true); // the expo-widgets tuple
    expect(names[widgets - 1]).toBe('./plugins/withHourglassWidgetBackground');
    expect(names.filter((n) => n === './plugins/withHourglassWidgetBackground')).toHaveLength(1);
  });

  it('withHourglassWidgetPrivacyManifest is listed immediately before withHourglassWidgetBackground', () => {
    const names = pluginNames();
    const background = names.indexOf('./plugins/withHourglassWidgetBackground');
    expect(background).toBeGreaterThan(0);
    expect(names[background - 1]).toBe('./plugins/withHourglassWidgetPrivacyManifest');
    expect(names.filter((n) => n === './plugins/withHourglassWidgetPrivacyManifest')).toHaveLength(1);
  });
});
