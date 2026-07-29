// FR1 (04-team-view-content): useIsManager — shared manager-detection hook

import { useConfig } from './useConfig';

/**
 * Returns whether the current user should see manager-only UI (team queue,
 * team scope toggle, etc). True when `config.isManager` or the QA-only
 * `config.devManagerView` override is explicitly `true`; false for all other
 * config states, including absent or still-loading config.
 */
export function useIsManager(): boolean {
  const { config } = useConfig();
  return config?.isManager === true || config?.devManagerView === true;
}
