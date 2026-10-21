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
    // 10-sdk-58-ios-27 FR4 (Decision 12): eslint-config-expo 58 brings eslint-plugin-react-hooks 7,
    // whose `recommended` preset adds the React Compiler rules at `error`. This app doesn't run the
    // compiler (app.json experiments.reactCompiler: false). Only these three rules fire (18 errors
    // after the one local fix in WeeklyBarChart), and fixing them would change runtime behavior or
    // reach far beyond the call site. rules-of-hooks and exhaustive-deps stay on.
    rules: {
      // TODO(2026-12-31, spec-10 follow-up): 9 Reanimated shared-value writes (`sv.value = …` in
      // press handlers and effects: AnimatedPressable, FloatingPillTabBar, GlassCard, TrendSparkline,
      // useListCascade, useStaggeredEntry). The compiler-safe form is `sv.set(…)`, but ~20 test files
      // mock useSharedValue as a plain `{ value }` object, so the fix isn't local.
      'react-hooks/immutability': 'off',
      // TODO(2026-12-31, spec-10 follow-up): 6 setState calls inside effects (app/modal.tsx toggle
      // init, AIConeChart reduced-motion, RejectionSheet prefill, useAIData no-config, useFocusKey
      // remount key, useHoursData cache write). Moving them to render-time derivation changes when
      // state updates land.
      'react-hooks/set-state-in-effect': 'off',
      // TODO(2026-12-31, spec-10 follow-up): 3 ref reads/writes during render in useAIData
      // (fetchDataRef sync, previousWeekPercent from a ref). Changing them alters re-render timing.
      'react-hooks/refs': 'off',
    },
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
