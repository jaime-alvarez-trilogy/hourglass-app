// legalLinks.ts
// Spec store-compliance/02-in-app-legal-links FR1 + FR2: public legal URLs
// (published by spec 01) and the Settings → About version/update formatter.
// Pure module: no imports, so it is unit-testable without native modules.

export const PRIVACY_POLICY_URL =
  'https://jaime-alvarez-trilogy.github.io/hourglass-app/privacy-policy.html';
export const SUPPORT_URL =
  'https://jaime-alvarez-trilogy.github.io/hourglass-app/support.html';

export interface BuildInfoInput {
  version: string | null | undefined;
  buildNumber: string | null | undefined;
  updateId: string | null | undefined;
  isEmbeddedLaunch: boolean;
}

export interface BuildInfo {
  versionLine: string;
  updateLine: string;
}

/**
 * Formats binary version/build and OTA update id into the two About-row lines.
 * Empty values (null, undefined, '') count as absent; an embedded launch always
 * reads "Update: embedded" because store builds report the embedded bundle's id.
 */
export function formatBuildInfo(input: BuildInfoInput): BuildInfo {
  const { version, buildNumber, updateId, isEmbeddedLaunch } = input;
  const base = version ? `Version ${version}` : 'Version unknown';
  const versionLine = buildNumber ? `${base} (${buildNumber})` : base;
  const updateLine =
    isEmbeddedLaunch || !updateId ? 'Update: embedded' : `Update: ${updateId.slice(0, 8)}`;
  return { versionLine, updateLine };
}
