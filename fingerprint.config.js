// Scopes the iOS fingerprint (runtimeVersion policy "fingerprint") to inputs that change the
// native binary. Loaded by @expo/fingerprint (0.21.x on SDK 58) through expo-updates on every
// runtime resolution (local `runtimeversion:resolve`, EAS Build, `eas update`), so it must stay
// committed. Changing this file forks the runtime for every later publish: change it only
// together with a native build (docs/RELEASING.md). Unknown names are silently dropped by
// @expo/fingerprint, so __tests__/config/fingerprint-config.test.ts checks each one against the
// SourceSkips enum.
//
// 0.21.x defaults to the `balanced` preset, and a sourceSkips array here REPLACES the preset's
// skips instead of merging with them (spec 10 Decision 11). So the list is our own three plus
// every balanced skip. The preset's PackageJsonAndroidAndIosScriptsIfNotContainRun is covered by
// PackageJsonScriptsAll, its superset. The preset's nativeModuleSourceType and
// configPluginSourceType ('package') still apply, since this file doesn't set them; patches/ and
// the in-repo plugins/ are still content-hashed.

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: [
    // version, ios.buildNumber and android.versionCode: version bumps must not sever OTA.
    'ExpoConfigVersions',
    // All package.json scripts (e.g. a new `typecheck`, an edited `postinstall`); patch
    // contents are still hashed through patches/.
    'PackageJsonScriptsAll',
    // .gitignore is edited for non-native reasons (e.g. 09359d8 after launch).
    'GitIgnore',
    // The rest come from the balanced preset.
    // runtimeVersion in app.json when it's a string (ours is a policy object, so this is inert).
    'ExpoConfigRuntimeVersionIfString',
    // eas.json: build profiles and the submit block. Also in .fingerprintignore (spec 04).
    'EasJson',
    // .easignore only controls the EAS upload (there's none today).
    'Easignore',
    // Filesystem paths in the resolved autolinking config; module names stay hashed.
    'AutolinkingConfigPaths',
  ],
};
