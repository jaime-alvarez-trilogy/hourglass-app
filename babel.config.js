module.exports = function (api) {
  // Cache based on environment so test/non-test get different configs.
  // nativewind/babel is excluded in test env (see below).
  const isTest = api.env('test') || process.env.JEST_WORKER_ID !== undefined;
  api.cache.using(() => String(isTest));

  return {
    // jsxImportSource: "nativewind" — CRITICAL for NativeWind v4 + Expo SDK 55.
    // babel-preset-expo controls the JSX transform (via @babel/plugin-transform-react-jsx).
    // Without passing jsxImportSource here, babel-preset-expo uses React's default
    // runtime and its JSX transform runs last (presets run last-to-first), overriding
    // nativewind/babel's importSource: "react-native-css-interop" with React's default.
    // Result: className props never reach css-interop → flex-row, layout classes ignored.
    presets: isTest
      ? ['babel-preset-expo']
      : [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // react-native-reanimated/plugin MUST be last. It transforms worklet functions
    // and shared value refs at compile time. Without it, Reanimated's animated style
    // proxy objects are opaque to React DevTools → _requiresAnimatedComponent getter
    // throws when DevTools tries to inspect props → crashes React's commit phase.
    plugins: !isTest ? ['react-native-reanimated/plugin'] : [],
  };
};
