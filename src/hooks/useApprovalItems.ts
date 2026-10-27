// FR3: useApprovalItems — React Query hook for manager approval queue

import { useState, useCallback, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadConfig, loadCredentials } from '../store/config'
import { getAuthToken } from '../api/client'
import { toAuthCreds } from '../api/authCreds'
import {
  fetchPendingManual,
  fetchPendingOvertime,
  approveManual,
  rejectManual,
  approveOvertime,
  rejectOvertime,
} from '../api/approvals'
import {
  parseManualItems,
  parseOvertimeItems,
  getWeekStartDate,
} from '../lib/approvals'
import type { ApprovalItem, ManualApprovalItem, OvertimeApprovalItem } from '../lib/approvals'
import { MOCK_TEAM_ITEMS } from '../lib/devMock'
import { autoApproveOwnerKey } from '../lib/autoApproveStore'
import { claimForHand } from '../lib/autoApproveClaims'
import type { CrossoverConfig } from '../types/config'

// Query key for the approval items list (also read by the auto-approve runner)
export const APPROVALS_KEY = ['approvals'] as const

const NO_IDS: ReadonlySet<string> = new Set()

/**
 * Records a hand approve / reject, so auto-approve never acts on the item afterwards this
 * session (src/lib/autoApproveClaims.ts). Throws, before anything is hidden or sent, while
 * an auto-approve run has claimed it.
 */
function claimHandAction(config: CrossoverConfig, item: ApprovalItem): void {
  const ownerKey = autoApproveOwnerKey(config)
  if (ownerKey && !claimForHand(ownerKey, item.id)) {
    throw new Error('Auto-approve is already approving this request')
  }
}

// ---------------------------------------------------------------------------
// Fetcher — loads config + credentials, fires parallel requests, merges
// ---------------------------------------------------------------------------

/**
 * Loads config + credentials, then fires 6 parallel calls (pending manual + overtime
 * for the current Monday and the two prior Mondays) and merges into a sorted list.
 * Returns [] for contributors or when not configured; returns MOCK_TEAM_ITEMS when
 * devManagerView is set on a non-manager config. See ARCHITECTURE.md §4.1.
 */
export async function fetchAllApprovalItems(): Promise<ApprovalItem[]> {
  const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])

  // Owner the items are fetched for, read with the config this fetch uses: a fetch that
  // started before a sign-in or QA/prod switch lands stamped for the old owner, so
  // auto-approve never acts on it (useAutoApprove's itemsForOwner)
  const fetchedFor = autoApproveOwnerKey(config) ?? undefined

  // Dev: manager preview — return fake team items without API calls
  if (config?.devManagerView && !config?.isManager) {
    return MOCK_TEAM_ITEMS.map((item) => ({ ...item, fetchedFor }))
  }

  // Guard: contributor or no config — return empty
  if (!config || !config.isManager || !credentials) return []

  const token = await getAuthToken(credentials.username, credentials.password, config.useQA)
  // One renewal creds object for all 6 fetches, built once like the token
  const creds = toAuthCreds(credentials, config.useQA)

  const currentMonday = getWeekStartDate()
  const d1 = new Date(currentMonday + 'T12:00:00')
  d1.setDate(d1.getDate() - 7)
  const prevMonday1 = getWeekStartDate(d1)
  const d2 = new Date(currentMonday + 'T12:00:00')
  d2.setDate(d2.getDate() - 14)
  const prevMonday2 = getWeekStartDate(d2)

  const [
    rawManualCur, rawOvertimeCur,
    rawManualPrev1, rawOvertimePrev1,
    rawManualPrev2, rawOvertimePrev2,
  ] = await Promise.all([
    fetchPendingManual(token, config.useQA, currentMonday, creds),
    fetchPendingOvertime(token, config.useQA, currentMonday, creds),
    fetchPendingManual(token, config.useQA, prevMonday1, creds),
    fetchPendingOvertime(token, config.useQA, prevMonday1, creds),
    fetchPendingManual(token, config.useQA, prevMonday2, creds),
    fetchPendingOvertime(token, config.useQA, prevMonday2, creds),
  ])

  const allItems: ApprovalItem[] = [
    ...parseManualItems(rawManualCur, currentMonday),
    ...parseOvertimeItems(rawOvertimeCur),
    ...parseManualItems(rawManualPrev1, prevMonday1),
    ...parseOvertimeItems(rawOvertimePrev1),
    ...parseManualItems(rawManualPrev2, prevMonday2),
    ...parseOvertimeItems(rawOvertimePrev2),
  ]

  // Sort by startDateTime descending (most recent first)
  allItems.sort((a, b) => (a.startDateTime < b.startDateTime ? 1 : -1))

  return allItems.map((item) => ({ ...item, fetchedFor }))
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React Query hook for the manager approval queue, wrapping fetchAllApprovalItems.
 * Returns items plus approve/reject/approveAll mutations with optimistic removal
 * and rollback on failure. Mutations always invalidate APPROVALS_KEY on settle
 * (success or failure) so the queue reflects server truth. The optimistic removal is a
 * filter over the current query data, not a copy of it, so every later data change
 * (that refetch, the auto-approve runner's approvals, new arrivals) still shows. A hand
 * approve / reject is refused while auto-approve is approving that item, and stops it
 * from ever auto-approving it this session. See ARCHITECTURE.md §4.1.
 */
export function useApprovalItems(): {
  items: ApprovalItem[]
  isLoading: boolean
  error: string | null
  refetch: () => void
  approveItem: (item: ApprovalItem) => Promise<void>
  rejectItem: (item: ApprovalItem, reason: string) => Promise<void>
  approveAll: () => Promise<void>
} {
  const queryClient = useQueryClient()
  // Ids removed optimistically: approved / rejected here (or in flight), hidden from the
  // query data until a pull-to-refresh lands; a failed call shows its item again
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(NO_IDS)
  // Ids whose approve / reject call has not settled (still hidden when a refresh lands)
  const inFlight = useRef(new Set<string>())

  const { data, isLoading, error, refetch: queryRefetch } = useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: fetchAllApprovalItems,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false, // prevent focus events from triggering refetch loop
  })

  // Effective items: the query data without the optimistically removed ones
  const items = useMemo(() => {
    const all = data ?? []
    return removedIds.size === 0 ? all : all.filter((i) => !removedIds.has(i.id))
  }, [data, removedIds])

  const hide = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id))
  }, [])
  const unhide = useCallback((id: string) => {
    setRemovedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // Pull-to-refresh shows the server list again, but only once the refetch has landed:
  // cleared before, every hidden item would read as pending meanwhile (and stay so if the
  // refetch failed, the last good data still listing it). Calls in flight stay hidden.
  const refetch = useCallback(() => {
    const updates = () => queryClient.getQueryState(APPROVALS_KEY)?.dataUpdateCount ?? 0
    const before = updates()
    const reveal = () => {
      if (updates() <= before) return
      setRemovedIds((prev) => {
        const next = new Set([...prev].filter((id) => inFlight.current.has(id)))
        return next.size === 0 ? NO_IDS : next
      })
    }
    queryRefetch().then(reveal, reveal)
  }, [queryRefetch, queryClient])

  // ---------------------------------------------------------------------------
  // approveItem — optimistic remove + API call + re-fetch
  // ---------------------------------------------------------------------------
  const approveItem = useCallback(async (item: ApprovalItem): Promise<void> => {
    const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])
    if (!config || !credentials) throw new Error('Not configured')
    claimHandAction(config, item)

    // Dev mock: optimistic remove only — no API call, no refetch (refetch would restore mock items)
    if (config.devManagerView && !config.isManager) {
      hide(item.id)
      return
    }

    // Optimistic remove
    hide(item.id)
    inFlight.current.add(item.id)

    try {
      const token = await getAuthToken(credentials.username, credentials.password, config.useQA)
      const creds = toAuthCreds(credentials, config.useQA)

      if (item.category === 'MANUAL') {
        const manualItem = item as ManualApprovalItem
        if (manualItem.timecardIds.length === 0) {
          console.warn('[useApprovalItems] approveItem: empty timecardIds, skipping')
          unhide(item.id)
          return
        }
        await approveManual(token, config.useQA, config.userId, manualItem.timecardIds, false, creds)
      } else {
        const overtimeItem = item as OvertimeApprovalItem
        await approveOvertime(token, config.useQA, overtimeItem.overtimeId, creds)
      }
    } catch (err) {
      // Restore on failure
      unhide(item.id)
      throw err
    } finally {
      inFlight.current.delete(item.id)
      // Re-fetch in background
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
    }
  }, [hide, unhide, queryClient])

  // ---------------------------------------------------------------------------
  // rejectItem — optimistic remove + API call + re-fetch
  // ---------------------------------------------------------------------------
  const rejectItem = useCallback(async (item: ApprovalItem, reason: string): Promise<void> => {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason cannot be empty')
    }

    const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])
    if (!config || !credentials) throw new Error('Not configured')
    claimHandAction(config, item)

    // Dev mock: optimistic remove only — no API call, no refetch
    if (config.devManagerView && !config.isManager) {
      hide(item.id)
      return
    }

    // Optimistic remove
    hide(item.id)
    inFlight.current.add(item.id)

    try {
      const token = await getAuthToken(credentials.username, credentials.password, config.useQA)
      const creds = toAuthCreds(credentials, config.useQA)

      if (item.category === 'MANUAL') {
        const manualItem = item as ManualApprovalItem
        await rejectManual(token, config.useQA, config.userId, manualItem.timecardIds, reason, creds)
      } else {
        const overtimeItem = item as OvertimeApprovalItem
        await rejectOvertime(token, config.useQA, overtimeItem.overtimeId, reason, creds)
      }
    } catch (err) {
      // Restore on failure
      unhide(item.id)
      throw err
    } finally {
      inFlight.current.delete(item.id)
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
    }
  }, [hide, unhide, queryClient])

  // ---------------------------------------------------------------------------
  // approveAll — Promise.allSettled: continues on individual failures
  // ---------------------------------------------------------------------------
  const approveAll = useCallback(async (): Promise<void> => {
    const config = await loadConfig()
    await Promise.allSettled(items.map((item) => approveItem(item)))
    // Dev mock: items already cleared optimistically; don't refetch (would restore mock items)
    if (config?.devManagerView && !config?.isManager) return
    // Re-fetch after all settle to sync truth. The approved items stay hidden, as after
    // approveItem: shown again now, they would read as pending until the refetch landed.
    queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
  }, [items, approveItem, queryClient])

  return {
    items,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    approveItem,
    rejectItem,
    approveAll,
  }
}
