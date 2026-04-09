module.exports = {
  preset: 'jest-expo/node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // Exclude server/ — it has its own package.json and jest config (runs separately)
  testPathIgnorePatterns: ['/node_modules/', '/server/'],
  // Force Jest to exit after all tests complete — prevents react-native-reanimated/react-native-worklets
  // background timers from keeping the process alive and crashing subsequent test workers.
  forceExit: true,
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
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|victory-native)',
  ],
};
