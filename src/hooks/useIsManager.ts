import { useConfig } from './useConfig';

/**
 * Returns whether the current user should see manager-only UI (team queue,
 * team scope toggle, etc). True when `config.isManager` or the dev-account-only
 * `config.devManagerView` override (settings toggle gated by `isMe`, see
 * app/modal.tsx) is explicitly `true`; false for all other config states,
 * including absent or still-loading config.
 */
export function useIsManager(): boolean {
  const { config } = useConfig();
  return config?.isManager === true || config?.devManagerView === true;
}
