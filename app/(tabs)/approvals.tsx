// FR3 (02-approvals-tab-redesign): Role-aware Requests screen
// FR4: Empty states — "All caught up" (team), "No requests this week" (own)
// FR5: Loading skeletons — independent per section
// durable-data 04 FR1: My Requests rows come from src/lib/requestRows — bounded
//   week buckets, then a collapsed "Show older requests (N)" toggle (month-grouped)
// durable-data 04 FR4: honest freshness — a quiet note over visible entries, the red
//   banner only when nothing is visible (neutral auth copy, no Retry for NO_CREDENTIALS),
//   an "incomplete" empty state, and a pull spinner that waits for the forced refetch
//
// Layout:
//   Manager: TEAM REQUESTS section (swipeable ApprovalCards) + MY REQUESTS section
//   Contributor: MY REQUESTS section only
//
// Both hooks called unconditionally (React rules of hooks).
// useApprovalItems returns [] for non-managers internally.

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useIsManager } from '@/src/hooks/useIsManager'
import { useApprovalItems } from '@/src/hooks/useApprovalItems'
import { useMyRequests } from '@/src/hooks/useMyRequests'
import { ApprovalCard } from '@/src/components/ApprovalCard'
import MyRequestCard from '@/src/components/MyRequestCard'
import { RejectionSheet } from '@/src/components/RejectionSheet'
import Card from '@/src/components/Card'
import SectionLabel from '@/src/components/SectionLabel'
import SkeletonLoader from '@/src/components/SkeletonLoader'
import FadeInScreen from '@/src/components/FadeInScreen'
import { useStaggeredEntry } from '@/src/hooks/useStaggeredEntry'
import { useListCascade } from '@/src/hooks/useListCascade'
import { AnimatedPressable } from '@/src/components/AnimatedPressable'
import AnimatedMeshBackground from '@/src/components/AnimatedMeshBackground'
import { colors } from '@/src/lib/colors'
import { getWeekStartDate } from '@/src/lib/approvals'
import type { ApprovalItem } from '@/src/lib/approvals'
import {
  buildMyRequestRows,
  freshnessNote,
  INCOMPLETE_EMPTY_TEXT,
  myRequestsEmptyState,
  requestsBannerText,
  requestsErrorRetryable,
} from '@/src/lib/requestRows'
import type { MyRequestRow } from '@/src/lib/requestRows'
import type { PanelState } from '@/src/lib/panelState'

// ─── Team Queue row type (FR1: 01-manager-history) ───────────────────────────
// Injected into the Team Requests FlatList to group items by week without
// migrating to SectionList.

export type TeamQueueRow =
  | { type: 'header'; label: 'This Week' | 'Last Week' | '2 Weeks Ago' }
  | { type: 'item'; item: ApprovalItem; showUrgency: boolean }

// buildTeamQueueRows: accepts items pre-sorted descending by startDateTime.
// isUrgencyWindow: true when it's Monday before 15:00 UTC — caller computes this
// so the function stays pure and easily testable.
export function buildTeamQueueRows(
  items: ApprovalItem[],
  currentMonday: string,
  prevMonday1: string,
  prevMonday2: string,
  isUrgencyWindow: boolean,
): TeamQueueRow[] {
  const rows: TeamQueueRow[] = []

  const weekGroups: Array<{ key: string; label: 'This Week' | 'Last Week' | '2 Weeks Ago' }> = [
    { key: currentMonday, label: 'This Week' },
    { key: prevMonday1, label: 'Last Week' },
    { key: prevMonday2, label: '2 Weeks Ago' },
  ]

  for (const { key, label } of weekGroups) {
    const weekItems = items.filter((i) => i.weekStartDate === key)
    if (weekItems.length === 0) continue
    rows.push({ type: 'header', label })
    for (const item of weekItems) {
      rows.push({
        type: 'item',
        item,
        showUrgency: isUrgencyWindow && item.weekStartDate === prevMonday2,
      })
    }
  }

  return rows
}

export default function ApprovalsScreen() {
  const isManager = useIsManager()

  // My requests — all users. errorCode / staleDates / updatedAt are optional on the
  // result (hand-built hook mocks lack them), so they are defaulted here.
  const myRequests = useMyRequests()
  const { entries, isLoading: myLoading, error: myError, refetch: myRefetch } = myRequests
  const myErrorCode = myRequests.errorCode ?? null
  const staleDates = myRequests.staleDates ?? []
  const updatedAt = myRequests.updatedAt ?? null

  // Team queue — called unconditionally; returns [] for non-managers
  const {
    items,
    isLoading: teamLoading,
    error: teamError,
    refetch: teamRefetch,
    approveItem,
    rejectItem,
    approveAll,
  } = useApprovalItems()

  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null)
  const [isApprovingAll, setIsApprovingAll] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // My Requests "Older" section: collapsed on every mount, never persisted
  const [olderExpanded, setOlderExpanded] = useState(false)
  // True only for a user pull, so background focus refetches never show the spinner
  const [pulling, setPulling] = useState(false)

  const { getEntryStyle } = useStaggeredEntry({ count: 2 })
  const { getItemStyle } = useListCascade({ count: items.length }, [items.length])

  // ─── Pull-to-refresh ────────────────────────────────────────────────────────
  // Both refetches start now. The spinner holds until the My Requests forced refetch
  // settles (resolved or rejected); the team refetch returns void, so its slot settles
  // at once.

  function handleRefresh() {
    setPulling(true)
    Promise.allSettled([
      Promise.resolve(myRefetch()),
      isManager ? Promise.resolve(teamRefetch()) : null,
    ]).finally(() => setPulling(false))
  }

  // ─── Manager actions ────────────────────────────────────────────────────────

  async function handleApproveAll() {
    setIsApprovingAll(true)
    setActionError(null)
    try {
      await approveAll()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve items')
    } finally {
      setIsApprovingAll(false)
    }
  }

  async function handleConfirmReject(reason: string) {
    if (!rejectTarget) return
    const target = rejectTarget
    setRejectTarget(null)
    setActionError(null)
    try {
      await rejectItem(target, reason)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject item')
    }
  }

  async function handleApproveItem(item: ApprovalItem) {
    setActionError(null)
    try {
      await approveItem(item)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve item')
    }
  }

  function renderTeamQueueRow({ item: row, index }: { item: TeamQueueRow; index: number }) {
    if (row.type === 'header') {
      return (
        <SectionLabel className="px-4 mt-3 mb-1">{row.label}</SectionLabel>
      )
    }
    return (
      <Animated.View style={getItemStyle(index)}>
        <ApprovalCard
          item={row.item}
          onApprove={() => handleApproveItem(row.item)}
          onReject={() => setRejectTarget(row.item)}
        />
        {row.showUrgency && (
          <View className="px-4 -mt-1 mb-2">
            <Text className="text-warning text-xs font-sans-semibold text-center">
              Expires today 3pm UTC
            </Text>
          </View>
        )}
      </Animated.View>
    )
  }

  function renderMyRequestRow(row: MyRequestRow, index: number) {
    if (row.type === 'header') {
      return (
        <SectionLabel key={`header-${row.label}-${index}`} className="px-4 mt-3 mb-1">
          {row.label}
        </SectionLabel>
      )
    }
    if (row.type === 'older-toggle') {
      const label = row.expanded ? 'Hide older requests' : `Show older requests (${row.count})`
      return (
        <AnimatedPressable
          key="older-toggle"
          testID="older-toggle"
          className="mx-4 my-2 py-2"
          onPress={() => setOlderExpanded((expanded) => !expanded)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text className="text-textSecondary text-sm font-sans-semibold text-center">{label}</Text>
        </AnimatedPressable>
      )
    }
    return <MyRequestCard key={row.entry.id} entry={row.entry} />
  }

  // ─── Skeleton helpers ───────────────────────────────────────────────────────

  const showTeamSkeletons = isManager && teamLoading && items.length === 0
  const showMySkeletons = myLoading && entries.length === 0

  // ─── Week boundaries (shared by Team Requests and My Requests) ──────────────

  const currentMonday = getWeekStartDate()
  const d1 = new Date(currentMonday + 'T12:00:00')
  d1.setDate(d1.getDate() - 7)
  const prevMonday1 = getWeekStartDate(d1)
  const d2 = new Date(currentMonday + 'T12:00:00')
  d2.setDate(d2.getDate() - 14)
  const prevMonday2 = getWeekStartDate(d2)

  // Urgency window: Monday before 15:00 UTC — items from prevMonday2 expire then
  const _now = new Date()
  const isUrgencyWindow = _now.getUTCDay() === 1 && _now.getUTCHours() < 15

  const teamQueueRows = buildTeamQueueRows(items, currentMonday, prevMonday1, prevMonday2, isUrgencyWindow)
  const myRequestRows = buildMyRequestRows(
    entries,
    { currentMonday, prevMonday1, prevMonday2 },
    olderExpanded,
  )

  // ─── My Requests freshness ──────────────────────────────────────────────────
  // With entries on screen, a failed or partial refresh is one quiet note (stored data is
  // the truth). With none, the empty state picks the red banner, the honest "incomplete"
  // card or "No requests yet". Retry is offered only where it can help. The "updated … ago"
  // text uses this render's clock read (_now); there is no timer, so it refreshes on the
  // next render or refetch.

  const myNote = freshnessNote({
    hasEntries: entries.length > 0,
    error: myError,
    errorCode: myErrorCode,
    staleDates,
    updatedAt,
    nowMs: _now.getTime(),
  })
  const myRetryable = requestsErrorRetryable(myError, myErrorCode)
  const myEmptyState = myRequestsEmptyState(myError, staleDates)

  // ─── Mesh background signal ─────────────────────────────────────────────────
  // critical (coral glow) when manager has pending approvals; null (idle) otherwise.

  const meshPanelState: PanelState | null =
    isManager && items.length > 0 ? 'critical' : null

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FadeInScreen>
      <View className="flex-1 bg-background">
        <AnimatedMeshBackground panelState={meshPanelState} />
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-14 pb-3 bg-surface border-b border-border">
          <View className="flex-row items-center gap-2">
            <Text className="text-textPrimary text-xl font-display-bold">Requests</Text>
            {isManager && items.length > 0 && (
              <View className="bg-violet/20 rounded-full px-2 py-0.5">
                <Text className="text-violet text-xs font-sans-bold">{items.length}</Text>
              </View>
            )}
          </View>

          {/* Approve All — manager only, when team items present */}
          {isManager && items.length > 0 && (
            <AnimatedPressable
              className={`rounded-xl px-4 py-2 ${isApprovingAll ? 'bg-success/50' : 'bg-success'}`}
              onPress={handleApproveAll}
              disabled={isApprovingAll}
              accessibilityLabel="Approve all pending items"
            >
              {isApprovingAll ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-white font-sans-semibold text-sm">Approve All</Text>
              )}
            </AnimatedPressable>
          )}
        </View>

        {/* Team error banner */}
        {teamError && isManager && (
          <View className="flex-row items-center bg-critical/10 px-4 py-2.5 gap-3">
            <Text className="text-critical text-sm flex-1">{teamError}</Text>
            <AnimatedPressable onPress={teamRefetch}>
              <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Action error banner — approve/reject failures */}
        {actionError && (
          <View className="flex-row items-center bg-critical/10 px-4 py-2.5 gap-3">
            <Text className="text-critical text-sm flex-1">{actionError}</Text>
            <AnimatedPressable onPress={() => setActionError(null)}>
              <Text className="text-violet font-sans-semibold text-sm">Dismiss</Text>
            </AnimatedPressable>
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={handleRefresh}
              tintColor={colors.success}
            />
          }
        >
          {/* ── TEAM REQUESTS section (manager only) ───────────────────────── */}
          {isManager && (
            <Animated.View style={getEntryStyle(0)} className="pt-4">
              <SectionLabel className="px-4 mb-2">Team Requests</SectionLabel>

              {showTeamSkeletons ? (
                <View className="px-4 gap-3">
                  <SkeletonLoader className="h-24 rounded-2xl" />
                  <SkeletonLoader className="h-24 rounded-2xl" />
                </View>
              ) : items.length === 0 ? (
                /* FR4: Manager empty state — team queue */
                <View className="px-4">
                  <Card className="items-center">
                    <Text className="text-5xl text-success mb-3">✓</Text>
                    <Text className="text-textPrimary text-xl font-sans-semibold mb-1.5">
                      All caught up
                    </Text>
                    <Text className="text-textSecondary text-sm text-center">
                      No pending approvals
                    </Text>
                  </Card>
                </View>
              ) : (
                <FlatList
                  data={teamQueueRows}
                  keyExtractor={(row) =>
                    row.type === 'header' ? `header-${row.label}` : row.item.id
                  }
                  renderItem={renderTeamQueueRow}
                  scrollEnabled={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                />
              )}
            </Animated.View>
          )}

          {/* ── MY REQUESTS section (all users) ────────────────────────────── */}
          <Animated.View style={getEntryStyle(isManager ? 1 : 0)} className="pt-4">
            <SectionLabel className="px-4 mb-2">My Requests</SectionLabel>

            {/* Quiet freshness note — only while entries are visible */}
            {myNote !== null && (
              <View testID="my-requests-note" className="flex-row items-center mx-4 mb-2 gap-3">
                <Text className="text-textSecondary text-xs flex-1">{myNote}</Text>
                {myRetryable && (
                  <AnimatedPressable onPress={myRefetch}>
                    <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
                  </AnimatedPressable>
                )}
              </View>
            )}

            {showMySkeletons ? (
              <View className="px-4 gap-3">
                <SkeletonLoader className="h-16 rounded-2xl" />
                <SkeletonLoader className="h-16 rounded-2xl" />
              </View>
            ) : entries.length === 0 ? (
              myEmptyState === 'error' && myError ? (
                /* Nothing visible and the refresh failed: the banner alone, no empty card */
                <View
                  testID="my-requests-banner"
                  className="flex-row items-center bg-critical/10 mx-4 mb-3 px-4 py-2.5 rounded-xl gap-3"
                >
                  <Text className="text-critical text-sm flex-1">
                    {requestsBannerText(myError, myErrorCode)}
                  </Text>
                  {myRetryable && (
                    <AnimatedPressable onPress={myRefetch}>
                      <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
                    </AnimatedPressable>
                  )}
                </View>
              ) : myEmptyState === 'incomplete' ? (
                /* Some days never refreshed: not a confirmed empty window, so offer Retry */
                <View className="px-4">
                  <Card>
                    <Text className="text-textSecondary text-sm text-center">
                      {INCOMPLETE_EMPTY_TEXT}
                    </Text>
                    <AnimatedPressable onPress={myRefetch} className="self-center mt-2">
                      <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
                    </AnimatedPressable>
                  </Card>
                </View>
              ) : (
                /* FR4: Empty own requests — the whole window refreshed with none */
                <View className="px-4">
                  <Card>
                    <Text className="text-textSecondary text-sm text-center">
                      No requests yet
                    </Text>
                  </Card>
                </View>
              )
            ) : (
              myRequestRows.map(renderMyRequestRow)
            )}
          </Animated.View>
        </ScrollView>

        {/* Rejection bottom sheet */}
        <RejectionSheet
          visible={rejectTarget !== null}
          onConfirm={handleConfirmReject}
          onCancel={() => setRejectTarget(null)}
        />
      </View>
    </FadeInScreen>
  )
}
