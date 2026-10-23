// durable-data 03-keep-last-good FR5: the HOURGLASS_QUERY_CACHE persist predicate.
// Failures now throw, so a failed refetch leaves a query in 'error' with its last good
// data. TanStack's default predicate keeps only 'success' queries, which would drop that
// data from the next snapshot. This one also keeps errored queries that still hold data,
// so the last good values survive a restart.
//
// Cross-spec contract (02-requests-store): the manager-preview My Requests view, stamped
// ownerKey 'dev-mock' by buildMyRequestsQueryFn, is never persisted. The check is on the
// data's stamp, not the query key. The literal is shared, not imported, so this module has
// no app imports; a static test pins both files to it. Nothing runs at module load.

import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

/** ownerKey of spec 02's manager-preview My Requests view. Must equal useMyRequests.ts's stamp. */
export const DEV_MOCK_OWNER_KEY = 'dev-mock';

/** True for object data stamped with the dev-mock owner. Arrays, numbers and null are not. */
function isDevMockData(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { ownerKey?: unknown }).ownerKey === DEV_MOCK_OWNER_KEY
  );
}

/** Persist predicate: success, or error that still holds data; never the dev-mock view. */
export function shouldDehydrateQuery(query: Query): boolean {
  if (isDevMockData(query.state.data)) return false;
  return (
    defaultShouldDehydrateQuery(query) ||
    (query.state.status === 'error' && query.state.data !== undefined)
  );
}
