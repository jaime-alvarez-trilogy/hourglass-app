// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'server/dist/*'],
  },
  {
    // eslint-plugin-react-hooks 7 (eslint-config-expo 57) enables React Compiler
    // rules as errors. The app runs without the compiler and mutates Reanimated
    // shared values via `.value`, so keep these visible as warnings for now.
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
]);
