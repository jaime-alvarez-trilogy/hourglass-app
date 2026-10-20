// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

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
          message: 'Hermes has no global Buffer. Use TextEncoder (see src/lib/log.ts).',
        },
      ],
    },
  },
]);
