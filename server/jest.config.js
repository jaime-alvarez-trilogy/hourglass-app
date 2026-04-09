module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', {
      presets: [
        ['babel-preset-expo', { jsxRuntime: 'automatic' }],
      ],
    }],
  },
  // Resolve modules from server/node_modules first, then root node_modules
  moduleDirectories: ['node_modules', '../node_modules'],
};
