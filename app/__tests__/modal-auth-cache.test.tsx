/**
 * Spec 04 — FR7
 *
 * Verifies that `app/modal.tsx` calls `invalidateAuthToken()` in the
 * two code paths that change "which credentials the cache should represent":
 *
 * - handleSignOut: AFTER clearAll() — wipe cache so the token does not survive sign-out.
 * - handleSwitchEnvironment: BEFORE fetchAndBuildConfig(... newEnv) — wipe cache so
 *   the next mint targets the new environment.
 *
 * Source-file checks are intentionally used because (a) handleSignOut /
 * handleSwitchEnvironment are local function expressions inside the component
 * (no direct export to spy on), and (b) the existing modal.test.tsx already
 * uses the same source-file-inspection pattern (FR3.7-FR3.9).
 */

import * as fs from 'fs';
import * as path from 'path';

const MODAL_FILE = path.resolve(__dirname, '../modal.tsx');

describe('FR7: app/modal.tsx invalidates the auth-token cache', () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(MODAL_FILE, 'utf8');
  });

  it('FR7.a: source imports invalidateAuthToken from @/src/api/client', () => {
    expect(source).toMatch(
      /import\s*{[^}]*invalidateAuthToken[^}]*}\s*from\s*['"]@\/src\/api\/client['"]/
    );
  });

  it('FR7.b: handleSignOut calls invalidateAuthToken after clearAll', () => {
    // The handleSignOut body must contain both clearAll and invalidateAuthToken,
    // in that order. We extract the function body and assert clearAll's
    // position precedes invalidateAuthToken's.
    const signOutMatch = source.match(/handleSignOut[\s\S]*?\n {2}}\n/);
    expect(signOutMatch).not.toBeNull();
    const body = signOutMatch![0];
    const clearAllIdx = body.indexOf('clearAll(');
    const invalidateIdx = body.indexOf('invalidateAuthToken(');
    expect(clearAllIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeGreaterThan(clearAllIdx);
  });

  it('FR7.c: handleSwitchEnvironment calls invalidateAuthToken BEFORE fetchAndBuildConfig', () => {
    // The handleSwitchEnvironment body must contain both calls, with
    // invalidateAuthToken positioned before fetchAndBuildConfig so the
    // next mint targets the new environment.
    const switchMatch = source.match(/handleSwitchEnvironment[\s\S]*?\n {2}}\n/);
    expect(switchMatch).not.toBeNull();
    const body = switchMatch![0];
    const invalidateIdx = body.indexOf('invalidateAuthToken(');
    const fetchIdx = body.indexOf('fetchAndBuildConfig(');
    expect(invalidateIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(invalidateIdx).toBeLessThan(fetchIdx);
  });
});
