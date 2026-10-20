// Scopes the iOS fingerprint (runtimeVersion policy "fingerprint") to inputs that change the
// native binary. Loaded by @expo/fingerprint through expo-updates on every runtime resolution
// (local `runtimeversion:resolve`, EAS Build, `eas update`), so it must stay committed.
// Changing this file forks the runtime for every later publish: change it only together with a
// native build (docs/RELEASING.md). Unknown names are silently dropped by @expo/fingerprint, so
// __tests__/config/fingerprint-config.test.ts checks each one against the SourceSkips enum.
// This replaces DEFAULT_SOURCE_SKIPS (PackageJsonAndroidAndIosScriptsIfNotContainRun), which
// PackageJsonScriptsAll is a superset of.

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
  ],
};
