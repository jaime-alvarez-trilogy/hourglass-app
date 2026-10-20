// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const NO_BUFFER = 'Hermes has no global Buffer. Use TextEncoder (see src/lib/log.ts).';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // @types/node makes Node globals type-check everywhere; Hermes has none of them.
    files: ['app/**/*.{ts,tsx,js,jsx}', 'src/**/*.{ts,tsx,js,jsx}', 'components/**/*.{ts,tsx,js,jsx}'],
    ignores: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'Buffer',
          message: NO_BUFFER,
        },
      ],
      // no-restricted-globals only sees the bare identifier; these catch global.Buffer / globalThis.Buffer.
      'no-restricted-properties': [
        'error',
        { object: 'global', property: 'Buffer', message: NO_BUFFER },
        { object: 'globalThis', property: 'Buffer', message: NO_BUFFER },
      ],
    },
  },
]);
