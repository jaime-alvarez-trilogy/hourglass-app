// app/direct-reports.tsx
// 1.2 manager auto-approve: the per-report settings screen. Pushed from the Requests tab's
// AutoApproveEntryRow; registered in app/_layout.tsx with the title "Direct reports".
//
// One row per direct report (useDirectReports): avatar, name, team (only when the reports
// span more than one team), how many of their requests are pending now (the approvals queue
// matched with memberForItem against the reports and the roster, as the runner matches:
// overtime by assignment, manual time by its work-diary proof from useManualOwners, which
// can land after the roster; until then a row with nothing known says "Checking…", and the
// switches never wait for it) and two switches bound to useAutoApproveSettings().rules[userId]:
// "Manual time" and "Overtime".
//   - Turning a switch on asks first: once the rule is saved the runner approves everything
//     of that kind pending for the report, older weeks included. The manual copy gives a
//     count only once every manual request's owner is known (useManualOwners' settled).
//   - Turning one off saves straight away.
//   - A report without a userId cannot hold a rule (the engine keys rules by userId and never
//     plans for a report without one), so both its switches stay off and disabled, with a note.
//   - A failed save keeps the stored state and says so.
//
// Below the list, "Recently auto-approved": the store's log, newest first, with the outcome
// when an item was not approved and "(preview)" on simulated entries. In the manager preview
// (devManagerView on a non-manager account) a note says nothing is sent to Crossover.
//
// Manager-only: anyone else sees a one-line message, and the content's hooks never mount.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Switch, Image, Alert } from 'react-native';
import type { TextStyle } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useIsManager } from '@/src/hooks/useIsManager';
import { useConfig } from '@/src/hooks/useConfig';
import { useApprovalItems } from '@/src/hooks/useApprovalItems';
import { useAutoApproveSettings, useDirectReports, useManualOwners } from '@/src/hooks/useAutoApprove';
import type { AutoApproveLogEntry, AutoApproveRule, AutoApproveRules } from '@/src/lib/autoApprove';
import {
  categoryLabel,
  enableConfirmCopy,
  initialsOf,
  outcomeLabel,
  pendingCountsByMember,
} from '@/src/lib/autoApproveView';
import type { AutoApproveKind, PendingCounts } from '@/src/lib/autoApproveView';
import { formatMinutes } from '@/src/lib/hoursOverview';
import { formatUpdatedAgo } from '@/src/lib/requestRows';
import Card from '@/src/components/Card';
import SectionLabel from '@/src/components/SectionLabel';
import SkeletonLoader from '@/src/components/SkeletonLoader';
import { AnimatedPressable } from '@/src/components/AnimatedPressable';
import { colors } from '@/src/lib/colors';
import type { TeamMember } from '@/src/types/api';

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const NO_PENDING: PendingCounts = { manual: 0, overtime: 0 };
const RULE_OFF: AutoApproveRule = { manual: false, overtime: false };

// useTeamRoster's query key (src/hooks/useTeamRoster.ts); useDirectReports shares the entry.
const TEAM_ROSTER_KEY = ['teamRoster'] as const;

const INTRO_TEXT =
  "Hourglass approves these requests for you whenever you open the app. It can't run in the background.";
const PREVIEW_NOTE = 'Preview data — nothing is sent to Crossover';
const NO_USER_ID_NOTE = "Can't be matched safely yet, so their requests stay with you.";

const OUTCOME_CLASS: Record<Exclude<AutoApproveLogEntry['outcome'], 'approved'>, string> = {
  over_limit: 'text-warning',
  retrying: 'text-textSecondary',
  failed: 'text-warning',
  deadline_passed: 'text-critical',
};

function ruleFor(rules: AutoApproveRules, userId: string | null): AutoApproveRule {
  if (userId == null || !Object.prototype.hasOwnProperty.call(rules, userId)) return RULE_OFF;
  return rules[userId] ?? RULE_OFF;
}

/** Row key and testID suffix: the userId, else the assignment (which is never null). */
function memberKey(member: TeamMember): string {
  return member.userId ?? `a${member.assignmentId}`;
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function DirectReportsScreen(): React.JSX.Element {
  const isManager = useIsManager();
  if (!isManager) {
    return (
      <View className="flex-1 bg-background px-4 pt-6">
        <Text className="text-textSecondary text-sm">Auto-approve is only available to managers.</Text>
      </View>
    );
  }
  return <DirectReportsContent />;
}

function DirectReportsContent(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { config } = useConfig();
  const { reports, roster, isLoading: reportsLoading, error } = useDirectReports();
  const { rules, log, isLoading: settingsLoading, setRule } = useAutoApproveSettings();
  const { items } = useApprovalItems();
  const {
    owners: manualOwners,
    isLoading: ownersLoading,
    settled: ownersSettled,
  } = useManualOwners(items, reports, roster);

  // `${personId}:${kind}` → the value being saved; that switch shows it and is locked meanwhile
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const preview = config?.devManagerView === true && config?.isManager !== true;
  const pending = useMemo(
    () => pendingCountsByMember(items, reports, roster, manualOwners),
    [items, reports, roster, manualOwners],
  );
  const showTeam = useMemo(() => new Set(reports.map((r) => r.teamId)).size > 1, [reports]);

  const showSkeleton = (reportsLoading && reports.length === 0) || settingsLoading;
  // This render's clock read, like the Requests screen (no timer; it refreshes on re-render)
  const nowMs = new Date().getTime();

  async function save(personId: string, kind: AutoApproveKind, value: boolean) {
    const key = `${personId}:${kind}`;
    setSaving((s) => ({ ...s, [key]: value }));
    try {
      await setRule(personId, { [kind]: value });
    } catch {
      Alert.alert("Couldn't save", "Your change wasn't saved. Try again.");
    } finally {
      setSaving((s) => {
        const { [key]: _done, ...rest } = s;
        return rest;
      });
    }
  }

  function handleToggle(member: TeamMember, kind: AutoApproveKind, value: boolean) {
    const personId = member.userId;
    if (personId == null) return;
    if (!value) {
      void save(personId, kind, false);
      return;
    }
    const counts = pending.get(member) ?? NO_PENDING;
    // A manual count is final only once every request's owner is known: until then the
    // runner may approve more than it says, so the copy gives no number.
    const waiting = kind === 'manual' && !ownersSettled ? null : counts[kind];
    const rule = ruleFor(rules, personId);
    const otherOn = kind === 'manual' ? rule.overtime : rule.manual;
    const { title, message } = enableConfirmCopy(kind, member.name, waiting, otherOn);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn on', onPress: () => void save(personId, kind, true) },
    ]);
  }

  function handleRetry() {
    void queryClient.refetchQueries({ queryKey: TEAM_ROSTER_KEY });
  }

  function renderReports() {
    if (showSkeleton) {
      return (
        <View className="gap-3">
          <SkeletonLoader className="h-28 rounded-2xl" />
          <SkeletonLoader className="h-28 rounded-2xl" />
          <SkeletonLoader className="h-28 rounded-2xl" />
        </View>
      );
    }
    if (reports.length === 0) {
      return error ? (
        <View
          testID="direct-reports-error"
          className="flex-row items-center bg-critical/10 px-4 py-2.5 rounded-xl gap-3"
        >
          <Text className="text-critical text-sm flex-1">{"Couldn't load your direct reports."}</Text>
          <AnimatedPressable onPress={handleRetry} accessibilityRole="button">
            <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <Card>
          <Text className="text-textPrimary text-base font-sans-semibold text-center mb-1">
            No direct reports
          </Text>
          <Text className="text-textSecondary text-sm text-center">
            People on the teams you manage show up here.
          </Text>
        </Card>
      );
    }
    return (
      <>
        {/* The last good roster stays on screen when a refresh fails: one quiet note */}
        {error && (
          <View testID="direct-reports-stale" className="flex-row items-center mb-2 gap-3">
            <Text className="text-textSecondary text-xs flex-1">
              {"Couldn't refresh your team. Showing the last list."}
            </Text>
            <AnimatedPressable onPress={handleRetry} accessibilityRole="button">
              <Text className="text-violet font-sans-semibold text-sm">Retry</Text>
            </AnimatedPressable>
          </View>
        )}
        <Card>
          {reports.map((member, index) => {
            const key = memberKey(member);
            const personId = member.userId;
            const rule = ruleFor(rules, personId);
            const savingManual = personId != null ? saving[`${personId}:manual`] : undefined;
            const savingOvertime = personId != null ? saving[`${personId}:overtime`] : undefined;
            return (
              <ReportRow
                key={key}
                member={member}
                testKey={key}
                first={index === 0}
                showTeam={showTeam}
                pending={pending.get(member) ?? NO_PENDING}
                pendingLoading={ownersLoading}
                manual={savingManual ?? rule.manual}
                overtime={savingOvertime ?? rule.overtime}
                manualLocked={savingManual !== undefined}
                overtimeLocked={savingOvertime !== undefined}
                onToggle={(kind, value) => handleToggle(member, kind, value)}
              />
            );
          })}
        </Card>
      </>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-4 pt-4">
          {preview && (
            <View
              testID="direct-reports-preview"
              className="bg-warning/10 border border-warning/25 rounded-xl px-3 py-2 mb-3"
            >
              <Text className="text-warning text-xs font-sans-semibold">{PREVIEW_NOTE}</Text>
            </View>
          )}

          <Text className="text-textSecondary text-sm leading-5 mb-4">{INTRO_TEXT}</Text>

          <SectionLabel className="mb-2">Auto-approve</SectionLabel>
          {renderReports()}

          <SectionLabel className="mt-6 mb-2">Recently auto-approved</SectionLabel>
          {showSkeleton ? (
            <SkeletonLoader className="h-16 rounded-2xl" />
          ) : log.length === 0 ? (
            <Text testID="auto-approve-log-empty" className="text-textMuted text-sm">
              Nothing yet. Requests Hourglass approves for you show up here.
            </Text>
          ) : (
            <Card>
              {log.map((entry, index) => (
                <LogRow
                  key={`${entry.id}|${entry.at}`}
                  entry={entry}
                  first={index === 0}
                  nowMs={nowMs}
                />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

function Avatar({ member }: { member: TeamMember }): React.JSX.Element {
  // The URL that failed, not a boolean, so a refetch with a new photoUrl gets another try
  const [failedUrl, setFailedUrl] = useState<string | undefined>(undefined);
  const showPhoto = !!member.photoUrl && member.photoUrl !== failedUrl;
  if (showPhoto) {
    return (
      <Image
        source={{ uri: member.photoUrl }}
        style={{ width: 36, height: 36, borderRadius: 18 }}
        onError={() => setFailedUrl(member.photoUrl)}
      />
    );
  }
  return (
    <View className="w-9 h-9 rounded-full bg-border items-center justify-center">
      <Text className="text-textSecondary text-[13px] font-sans-semibold">
        {initialsOf(member.name)}
      </Text>
    </View>
  );
}

interface ReportRowProps {
  member: TeamMember;
  testKey: string;
  first: boolean;
  showTeam: boolean;
  pending: PendingCounts;
  /** Manual requests are still being matched (useManualOwners): a zero count is not final. */
  pendingLoading: boolean;
  manual: boolean;
  overtime: boolean;
  manualLocked: boolean;
  overtimeLocked: boolean;
  onToggle: (kind: AutoApproveKind, value: boolean) => void;
}

function ReportRow({
  member,
  testKey,
  first,
  showTeam,
  pending,
  pendingLoading,
  manual,
  overtime,
  manualLocked,
  overtimeLocked,
  onToggle,
}: ReportRowProps): React.JSX.Element {
  const matchable = member.userId != null;
  const waiting = pending.manual + pending.overtime;

  return (
    <View testID={`report-row-${testKey}`} className={first ? '' : 'border-t border-border mt-4 pt-4'}>
      <View className="flex-row items-center gap-3">
        <Avatar member={member} />
        <View className="flex-1">
          <Text className="text-textPrimary text-sm font-sans-semibold" numberOfLines={1}>
            {member.name}
          </Text>
          {showTeam && (
            <Text className="text-textMuted text-xs" numberOfLines={1}>
              {member.teamName}
            </Text>
          )}
        </View>
        {waiting > 0 ? (
          <Text testID={`report-pending-${testKey}`} className="text-textSecondary text-xs">
            <Text className="font-mono text-textPrimary" style={TABULAR}>{waiting}</Text>
            {' pending'}
          </Text>
        ) : (
          <Text testID={`report-pending-${testKey}`} className="text-textMuted text-xs">
            {pendingLoading ? 'Checking…' : 'Nothing pending'}
          </Text>
        )}
      </View>

      <ToggleRow
        label="Manual time"
        testID={`switch-manual-${testKey}`}
        accessibilityLabel={`Auto-approve ${member.name}'s manual time`}
        value={matchable && manual}
        disabled={!matchable || manualLocked}
        onValueChange={(value) => onToggle('manual', value)}
      />
      <ToggleRow
        label="Overtime"
        testID={`switch-overtime-${testKey}`}
        accessibilityLabel={`Auto-approve ${member.name}'s overtime`}
        value={matchable && overtime}
        disabled={!matchable || overtimeLocked}
        onValueChange={(value) => onToggle('overtime', value)}
      />
      {!matchable && (
        <Text testID={`report-note-${testKey}`} className="text-textMuted text-xs mt-2">
          {NO_USER_ID_NOTE}
        </Text>
      )}
    </View>
  );
}

function ToggleRow({
  label,
  testID,
  accessibilityLabel,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  testID: string;
  accessibilityLabel: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between mt-3">
      <Text className={`text-sm ${disabled ? 'text-textMuted' : 'text-textPrimary'}`}>{label}</Text>
      <Switch
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.violet }}
        thumbColor={colors.textPrimary}
      />
    </View>
  );
}

function LogRow({
  entry,
  first,
  nowMs,
}: {
  entry: AutoApproveLogEntry;
  first: boolean;
  nowMs: number;
}): React.JSX.Element {
  const outcome = outcomeLabel(entry.outcome);
  const outcomeClass = entry.outcome === 'approved' ? '' : OUTCOME_CLASS[entry.outcome];
  return (
    <View testID="auto-approve-log-row" className={first ? '' : 'border-t border-border mt-3 pt-3'}>
      <View className="flex-row items-baseline gap-3">
        <Text className="text-textPrimary text-sm font-sans-semibold flex-1" numberOfLines={1}>
          {entry.name}
        </Text>
        <Text className="text-textMuted font-mono text-xs" style={TABULAR}>
          {formatUpdatedAgo(entry.at, nowMs)}
        </Text>
      </View>
      <Text className="text-textSecondary text-xs mt-0.5">
        {`${categoryLabel(entry.category)} · `}
        <Text className="font-mono" style={TABULAR}>{formatMinutes(entry.durationMinutes)}</Text>
        {entry.simulated === true && <Text className="text-textMuted"> (preview)</Text>}
      </Text>
      {outcome !== null && (
        <Text className={`${outcomeClass} text-xs font-sans-semibold mt-0.5`}>{outcome}</Text>
      )}
    </View>
  );
}
