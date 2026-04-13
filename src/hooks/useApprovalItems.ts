// FR3: useApprovalItems — React Query hook for manager approval queue

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { loadConfig, loadCredentials } from '../store/config'
import { getAuthToken } from '../api/client'
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

// Query key for the approval items list
const APPROVALS_KEY = ['approvals'] as const

// ---------------------------------------------------------------------------
// Fetcher — loads config + credentials, fires parallel requests, merges
// ---------------------------------------------------------------------------

export async function fetchAllApprovalItems(): Promise<ApprovalItem[]> {
  const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])

  // Dev: manager preview — return fake team items without API calls
  if (config?.devManagerView && !config?.isManager) return [...MOCK_TEAM_ITEMS]

  // Guard: contributor or no config — return empty
  if (!config || !config.isManager || !credentials) return []

  const token = await getAuthToken(credentials.username, credentials.password, config.useQA)

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
    fetchPendingManual(token, config.useQA, currentMonday),
    fetchPendingOvertime(token, config.useQA, currentMonday),
    fetchPendingManual(token, config.useQA, prevMonday1),
    fetchPendingOvertime(token, config.useQA, prevMonday1),
    fetchPendingManual(token, config.useQA, prevMonday2),
    fetchPendingOvertime(token, config.useQA, prevMonday2),
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

  return allItems
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

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
  const [optimisticItems, setOptimisticItems] = useState<ApprovalItem[] | null>(null)

  const { data, isLoading, error, refetch: queryRefetch } = useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: fetchAllApprovalItems,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false, // prevent focus events from triggering refetch loop
  })

  // Effective items: use optimistic state if active, otherwise query data
  const items = optimisticItems ?? data ?? []

  const refetch = useCallback(() => {
    setOptimisticItems(null)
    queryRefetch()
  }, [queryRefetch])

  // ---------------------------------------------------------------------------
  // approveItem — optimistic remove + API call + re-fetch
  // ---------------------------------------------------------------------------
  const approveItem = useCallback(async (item: ApprovalItem): Promise<void> => {
    const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])
    if (!config || !credentials) throw new Error('Not configured')

    // Dev mock: optimistic remove only — no API call, no refetch (refetch would restore mock items)
    if (config.devManagerView && !config.isManager) {
      const current = optimisticItems ?? data ?? []
      setOptimisticItems(current.filter((i) => i.id !== item.id))
      return
    }

    // Optimistic remove
    const current = optimisticItems ?? data ?? []
    const previousItems = current
    setOptimisticItems(current.filter((i) => i.id !== item.id))

    try {
      const token = await getAuthToken(credentials.username, credentials.password, config.useQA)

      if (item.category === 'MANUAL') {
        const manualItem = item as ManualApprovalItem
        if (manualItem.timecardIds.length === 0) {
          console.warn('[useApprovalItems] approveItem: empty timecardIds, skipping')
          setOptimisticItems(null)
          return
        }
        await approveManual(token, config.useQA, config.userId, manualItem.timecardIds)
      } else {
        const overtimeItem = item as OvertimeApprovalItem
        await approveOvertime(token, config.useQA, overtimeItem.overtimeId)
      }
    } catch (err) {
      // Restore on failure
      setOptimisticItems(previousItems)
      throw err
    } finally {
      // Re-fetch in background
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
    }
  }, [optimisticItems, data, queryClient])

  // ---------------------------------------------------------------------------
  // rejectItem — optimistic remove + API call + re-fetch
  // ---------------------------------------------------------------------------
  const rejectItem = useCallback(async (item: ApprovalItem, reason: string): Promise<void> => {
    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason cannot be empty')
    }

    const [config, credentials] = await Promise.all([loadConfig(), loadCredentials()])
    if (!config || !credentials) throw new Error('Not configured')

    // Dev mock: optimistic remove only — no API call, no refetch
    if (config.devManagerView && !config.isManager) {
      const current = optimisticItems ?? data ?? []
      setOptimisticItems(current.filter((i) => i.id !== item.id))
      return
    }

    // Optimistic remove
    const current = optimisticItems ?? data ?? []
    const previousItems = current
    setOptimisticItems(current.filter((i) => i.id !== item.id))

    try {
      const token = await getAuthToken(credentials.username, credentials.password, config.useQA)

      if (item.category === 'MANUAL') {
        const manualItem = item as ManualApprovalItem
        await rejectManual(token, config.useQA, config.userId, manualItem.timecardIds, reason)
      } else {
        const overtimeItem = item as OvertimeApprovalItem
        await rejectOvertime(token, config.useQA, overtimeItem.overtimeId, reason)
      }
    } catch (err) {
      // Restore on failure
      setOptimisticItems(previousItems)
      throw err
    } finally {
      queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
    }
  }, [optimisticItems, data, queryClient])

  // ---------------------------------------------------------------------------
  // approveAll — Promise.allSettled: continues on individual failures
  // ---------------------------------------------------------------------------
  const approveAll = useCallback(async (): Promise<void> => {
    const config = await loadConfig()
    const current = optimisticItems ?? data ?? []
    await Promise.allSettled(current.map((item) => approveItem(item)))
    // Dev mock: items already cleared optimistically; don't refetch (would restore mock items)
    if (config?.devManagerView && !config?.isManager) return
    // Re-fetch after all settle to sync truth
    setOptimisticItems(null)
    queryClient.invalidateQueries({ queryKey: APPROVALS_KEY })
  }, [optimisticItems, data, approveItem, queryClient])

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
