// Tests: useIsManager hook — FR1 (04-team-view-content)
// Spec: features/app/team-org-view/specs/04-team-view-content/spec.md
//
// FR1: useIsManager() centralizes the manager-detection expression currently
// duplicated in overview.tsx, approvals.tsx, and index.tsx.
//   SC1.1 — returns true when config.isManager === true
//   SC1.2 — returns true when config.devManagerView === true
//   SC1.3 — returns false for all other config states, including absent config
//
// Strategy: static source analysis (hook file does not exist yet — red phase)
// plus logic unit tests mirroring the hook's boolean expression. renderHook is
// not used per project convention (jest-expo/node null-dispatcher issue); this
// follows the useInsightChips.test.ts pattern of testing the composed logic
// directly against fixtures.

import * as path from 'path';
import * as fs from 'fs';

const SRC_ROOT = path.resolve(__dirname, '../..');
const HOOK_FILE = path.resolve(SRC_ROOT, 'hooks', 'useIsManager.ts');

// ─── Static analysis: file contract ──────────────────────────────────────────

describe('useIsManager — file contract (FR1)', () => {
  it('hook file exists at src/hooks/useIsManager.ts', () => {
    expect(fs.existsSync(HOOK_FILE)).toBe(true);
  });

  it('imports useConfig', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useConfig/);
  });

  it('exports a function named useIsManager', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/export\s+function\s+useIsManager/);
  });

  it('declares an explicit boolean return type', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(/useIsManager\s*\(\s*\)\s*:\s*boolean/);
  });

  it('has a JSDoc comment preceding the exported function', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    const jsdocBeforeFunc = /\/\*\*[\s\S]*?\*\/\s*export\s+function\s+useIsManager/;
    expect(src).toMatch(jsdocBeforeFunc);
  });

  it('body contains the exact manager-detection expression (isManager || devManagerView)', () => {
    const src = fs.readFileSync(HOOK_FILE, 'utf8');
    expect(src).toMatch(
      /config\?\.isManager\s*===\s*true\s*\|\|\s*config\?\.devManagerView\s*===\s*true/,
    );
  });
});

// ─── Logic tests (mirrors the hook's exact expression) ───────────────────────

describe('useIsManager — logic (SC1.1–SC1.3)', () => {
  type PartialConfig = { isManager?: unknown; devManagerView?: unknown } | null | undefined;

  function isManagerLogic(config: PartialConfig): boolean {
    return config?.isManager === true || config?.devManagerView === true;
  }

  it('SC1.1 — returns true when config.isManager === true', () => {
    expect(isManagerLogic({ isManager: true })).toBe(true);
  });

  it('SC1.2 — returns true when config.devManagerView === true', () => {
    expect(isManagerLogic({ devManagerView: true })).toBe(true);
  });

  it('returns true when both isManager and devManagerView are true', () => {
    expect(isManagerLogic({ isManager: true, devManagerView: true })).toBe(true);
  });

  it('SC1.3 — returns false when isManager === false and devManagerView is absent', () => {
    expect(isManagerLogic({ isManager: false })).toBe(false);
  });

  it('SC1.3 — returns false when both isManager and devManagerView are false', () => {
    expect(isManagerLogic({ isManager: false, devManagerView: false })).toBe(false);
  });

  it('SC1.3 — returns false for an empty config object', () => {
    expect(isManagerLogic({})).toBe(false);
  });

  it('SC1.3 — returns false when config is null (matches useConfig()\'s absent-config shape)', () => {
    expect(isManagerLogic(null)).toBe(false);
  });

  it('SC1.3 — returns false when config is undefined (config still loading)', () => {
    expect(isManagerLogic(undefined)).toBe(false);
  });

  it('SC1.3 — returns false when isManager is truthy but not strictly true', () => {
    expect(isManagerLogic({ isManager: 'true' })).toBe(false);
  });

  it('SC1.3 — returns false when devManagerView is truthy but not strictly true', () => {
    expect(isManagerLogic({ devManagerView: 1 })).toBe(false);
  });
});
