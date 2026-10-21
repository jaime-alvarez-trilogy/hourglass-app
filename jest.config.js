// Options both projects share. Each project gets its own copy (jest resolves <rootDir> per
// project, and a preset's moduleNameMapper is merged under these entries).
const shared = {
  // Global setup file — patches useAnimatedReaction to a no-op so Reanimated worklet
  // timers never crash the process when multiple test suites run in the same worker.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Stub binary image assets — prevents Jest module resolution errors for PNG/JPG
    '\\.(png|jpg|jpeg|gif|webp)$': '<rootDir>/__mocks__/fileMock.js',
    // expo-linear-gradient — no native module available in Jest/node environment
    '^expo-linear-gradient$': '<rootDir>/__mocks__/expo-linear-gradient.ts',
    // CSS/global styles — Jest/node cannot parse CSS; stub as empty module
    '\\.css$': '<rootDir>/__mocks__/fileMock.js',
    // react-native-svg's web resolver imports @react-native/assets-registry, which RN 0.87+
    // no longer ships; jest-expo/node resolves .web files (10-sdk-58-ios-27 FR4).
    '^@react-native/assets-registry/registry$':
      '<rootDir>/__mocks__/@react-native/assets-registry/registry.ts',
  },
  // This key replaces jest-expo's own list, so it carries jest-expo 58's additions
  // (10-sdk-58-ios-27 FR4): standard-navigation (a new expo-router 58 dependency) is
  // transformed, and the reanimated plugin and @react-native/babel-preset are never
  // transformed ("Reentrant plugin detected"; jest-expo/jest-preset.js).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|victory-native|standard-navigation)',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};

// Exclude server/ — it has its own package.json and jest config (runs separately)
const IGNORED = ['/node_modules/', '/server/'];

// 10-sdk-58-ios-27 FR4: RNTL 14 renders through test-renderer and accepts only React Native's
// own host text names (Text/RCTText). jest-expo/node maps react-native to react-native-web,
// whose Text is a <div>, so RNTL `render` suites run in the native jest-expo/ios project.
// (RNTL renderHook-only suites, which render no host text, stay on the node project.)
const RNTL_RENDER_TESTS = ['<rootDir>/__tests__/auth-screens.test.tsx'];

module.exports = {
  // Force Jest to exit after all tests complete — prevents react-native-reanimated/react-native-worklets
  // background timers from keeping the process alive and crashing subsequent test workers.
  forceExit: true,
  projects: [
    {
      ...shared,
      preset: 'jest-expo/node',
      testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
      testPathIgnorePatterns: [...IGNORED, ...RNTL_RENDER_TESTS],
    },
    {
      ...shared,
      preset: 'jest-expo/ios',
      // Reanimated 4.7 / worklets 0.13's jest resolver: drops the `.native` files so the JS
      // implementation loads instead of the native worklets module. It replaces
      // @react-native/jest-preset's resolver, whose only hook (packageFilter) Jest 30 ignores.
      resolver: require.resolve('react-native-reanimated/jest/resolver'),
      testMatch: RNTL_RENDER_TESTS,
      testPathIgnorePatterns: IGNORED,
    },
  ],
};
