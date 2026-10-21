// Expo's ambient types (the `*.css` module for `import '../global.css'` in app/_layout.tsx,
// among others), referenced from a tracked file. The root expo-env.d.ts carries the same
// reference, but it's gitignored and only written by `expo start`, so a fresh CI checkout
// doesn't have it. TypeScript 6 checks side-effect imports by default
// (noUncheckedSideEffectImports), so without this file `npm run typecheck` fails in CI only,
// with TS2882 (spec 10 FR8; guarded in __tests__/ci-gates.test.ts).
/// <reference types="expo/types" />
