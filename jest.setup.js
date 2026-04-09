// Jest global setup for hourglassws tests.
//
// react-native-reanimated worklet crash prevention:
// Without the Reanimated Babel plugin (excluded in test env to avoid worklet compilation
// overhead), `useAnimatedReaction` worklets cannot safely access SharedValues via
// Reanimated's internal binary interface. The background timer in react-native-worklets
// fires the worklet after the test completes, crashing the process and causing subsequent
// test suites in the same worker to fail with 0 tests.
//
// Fix: patch useAnimatedReaction to a no-op in the Jest environment so worklets
// never run on the background thread. This is safe because:
//   - Source-analysis tests don't need worklets to run
//   - Render tests only check that components don't crash (structural tests)
//   - The actual gesture behavior is tested via source-code analysis

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    useAnimatedReaction: jest.fn(), // no-op: prevents background worklet timer crashes
  };
});
