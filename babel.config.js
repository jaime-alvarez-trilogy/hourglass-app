module.exports = function (api) {
  // Cache based on environment so test/non-test get different configs.
  // nativewind/babel is excluded in test env.
  const isTest = api.env('test') || process.env.JEST_WORKER_ID !== undefined;
  api.cache.using(() => String(isTest));

  return {
    // jsxImportSource: "nativewind" — CRITICAL for NativeWind v4 + Expo SDK 55+.
    // babel-preset-expo controls the JSX transform (via @babel/plugin-transform-react-jsx).
    // Without passing jsxImportSource here, babel-preset-expo uses React's default
    // runtime and its JSX transform runs last (presets run last-to-first), overriding
    // nativewind/babel's importSource: "react-native-css-interop" with React's default.
    // Result: className props never reach css-interop → flex-row, layout classes ignored.
    presets: isTest
      ? ['babel-preset-expo']
      : [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // No explicit worklets/reanimated plugin: babel-preset-expo adds
    // react-native-worklets/plugin automatically (and nativewind/babel adds it too).
  };
};
