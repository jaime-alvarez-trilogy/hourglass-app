// FR3 (02-approvals-tab-redesign): Role-aware Requests screen
// FR4: Empty states — "All caught up" (team), "No requests this week" (own)
// FR5: Loading skeletons — independent per section
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
import { useConfig } from '@/src/hooks/useConfig'
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
import type { ApprovalItem } from '@/src/lib/approvals'
import type { PanelState } from '@/src/lib/panelState'

export default function ApprovalsScreen() {
  const { config } = useConfig()
  const isManager = config?.isManager === true || config?.devManagerView === true

  // My requests — all users
  const { entries, isLoading: myLoading, error: myError, refetch: myRefetch } = useMyRequests()

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

  const { getEntryStyle } = useStaggeredEntry({ count: 2 })
  const { getItemStyle } = useListCascade({ count: items.length }, [items.length])

  // ─── Pull-to-refresh ────────────────────────────────────────────────────────

  const isRefreshing = myLoading || (isManager && teamLoading)

  function handleRefresh() {
    myRefetch()
    if (isManager) {
      teamRefetch()
    }
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

  function renderApprovalItem({ item, index }: { item: ApprovalItem; index: number }) {
    return (
      <Animated.View style={getItemStyle(index)}>
        <ApprovalCard
          item={item}
          onApprove={() => handleApproveItem(item)}
          onReject={() => setRejectTarget(item)}
        />
      </Animated.View>
    )
  }

  // ─── Skeleton helpers ───────────────────────────────────────────────────────

  const showTeamSkeletons = isManager && teamLoading && items.length === 0
  const showMySkeletons = myLoading && entries.length === 0

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
              refreshing={isRefreshing}
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
                  data={items}
                  keyExtractor={(item) => item.id}
                  renderItem={renderApprovalItem}
                  scrollEnabled={false}
                  contentContainerStyle={{ paddingBottom: 8 }}
                />
              )}
            </Animated.View>
          )}

          {/* ── MY REQUESTS section (all users) ────────────────────────────── */}
          <Animated.View style={getEntryStyle(isManager ? 1 : 0)} className="pt-4">
            <SectionLabel className="px-4 mb-2">My Requests</SectionLabel>

            {/* My requests error banner */}
            {myError && (
              <View className="flex-row items-center bg-critical/10 mx-4 mb-3 px-4 py-2.5 rounded-xl gap-3">
                <Text className="text-critical text-sm flex-1">
                  {myError === 'auth'
                    ? 'Authentication error. Please re-open the app.'
                    : 'Could not load requests.'}
                </Text>
                <AnimatedPressable onPress={myRefetch}>
                  <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
                </AnimatedPressable>
              </View>
            )}

            {showMySkeletons ? (
              <View className="px-4 gap-3">
                <SkeletonLoader className="h-16 rounded-2xl" />
                <SkeletonLoader className="h-16 rounded-2xl" />
              </View>
            ) : entries.length === 0 ? (
              /* FR4: Empty own requests */
              <View className="px-4">
                <Card>
                  <Text className="text-textSecondary text-sm text-center">
                    No requests this week
                  </Text>
                </Card>
              </View>
            ) : (
              entries.map((entry) => (
                <MyRequestCard key={entry.id} entry={entry} />
              ))
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
