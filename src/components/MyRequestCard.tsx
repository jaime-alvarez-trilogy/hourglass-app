// FR2 (02-approvals-tab-redesign): MyRequestCard — read-only status card for a
// single ManualRequestEntry (contributor manual time request visibility).
//
// Design system rule: NativeWind className only — no StyleSheet.create, no hex.
// Status badge colors: PENDING=gold, APPROVED=success, REJECTED=critical.
// Rejection reason shown only for REJECTED entries; fallback: "No reason provided".

import React from 'react';
import { View, Text } from 'react-native';
import type { ManualRequestEntry, ManualRequestStatus } from '@/src/types/requests';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format duration in minutes:
 *   < 60 min → "N min"
 *   ≥ 60 min → "Xh" (1 decimal if needed)
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  // Remove trailing .0 — show "1h" not "1.0h"
  const formatted = parseFloat(hours.toFixed(1));
  return `${formatted}h`;
}

/**
 * Format YYYY-MM-DD date string as "Mon, Mar 17".
 * Uses T12:00:00 to avoid UTC midnight shift to wrong calendar date.
 */
function formatEntryDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Badge style maps ─────────────────────────────────────────────────────────

const BADGE_BG: Record<ManualRequestStatus, string> = {
  PENDING:  'bg-gold/20',
  APPROVED: 'bg-success/20',
  REJECTED: 'bg-critical/20',
};

const BADGE_TEXT: Record<ManualRequestStatus, string> = {
  PENDING:  'text-gold',
  APPROVED: 'text-success',
  REJECTED: 'text-critical',
};

const BADGE_LABEL: Record<ManualRequestStatus, string> = {
  PENDING:  'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface MyRequestCardProps {
  entry: ManualRequestEntry;
}

export default function MyRequestCard({ entry }: MyRequestCardProps): JSX.Element {
  const { date, durationMinutes, memo, status, rejectionReason } = entry;

  const badgeBg = BADGE_BG[status];
  const badgeText = BADGE_TEXT[status];
  const badgeLabel = BADGE_LABEL[status];

  return (
    <View className="bg-surface rounded-2xl border border-border mx-4 my-1.5 p-3.5">
      {/* Main row: date+duration | memo | badge */}
      <View className="flex-row items-center gap-3">
        {/* Left: date and duration */}
        <View className="items-start min-w-[64px]">
          <Text className="text-textSecondary text-xs font-sans-medium">
            {formatEntryDate(date)}
          </Text>
          <Text className="text-textPrimary text-sm font-sans-semibold mt-0.5" style={{ fontVariant: ['tabular-nums'] }}>
            {formatDuration(durationMinutes)}
          </Text>
        </View>

        {/* Center: memo (fills remaining space) */}
        <Text
          className="flex-1 text-textSecondary text-sm"
          numberOfLines={2}
        >
          {memo}
        </Text>

        {/* Right: status badge pill */}
        <View className={`${badgeBg} rounded-full px-2.5 py-1`}>
          <Text className={`${badgeText} text-xs font-sans-semibold`}>
            {badgeLabel}
          </Text>
        </View>
      </View>

      {/* Rejection reason row — REJECTED entries only */}
      {status === 'REJECTED' && (
        <View className="mt-2 pt-2 border-t border-border">
          <Text className="text-textSecondary text-xs" numberOfLines={3}>
            {rejectionReason ?? 'No reason provided'}
          </Text>
        </View>
      )}
    </View>
  );
}
