// WeekBreakdownCard.tsx — 1.2 WorkSmart dashboard parity: the pay week's hours breakdown
//
// Mirrors the WorkSmart dashboard's THIS WEEK panel as the detail card below the home hero.
// It shows the UTC pay week (Mon–Sun UTC, what payments count), while the hero and chart
// follow the local week, so the header names the pay week and says UTC:
//   Card
//   └─ Header: "PAY WEEK" + "Mon 19 – Sun 25 Oct · UTC" | left / over / reached status
//   └─ Stacked bar: tracked · manual approved · manual pending, weekly-limit marker
//   └─ Legend
//   └─ Rows: BILLABLE / NOT BILLABLE / LIMIT (zero rows muted)
//   └─ Footnote (only when manual time is pending approval)
//
// Collapsible (1.2): with onToggle the header becomes a hide / show toggle with a chevron
// (CollapsibleSection) and, collapsed, the card is the header alone — the status and caption
// stay, they are the overtime / limit summary. Without onToggle it renders as before.
//
// Design system: BRAND_GUIDELINES.md
//   - success = tracked hours, violet = manual time (pending: low-opacity fill + violet border)
//   - warning = limit marker, unapproved overtime, pending-approval footnote
//   - tabular-nums on every number; Space Mono for the row values
// Plain Views only: no Skia, no entry/focus animations (focus replay read as slowness);
// the toggle's press-only motion lives in CollapsibleSection.
// Every quantity is MINUTES (WeekBreakdown from src/lib/hours.ts).

import React from 'react';
import { Text, View, type TextStyle } from 'react-native';
import Card from './Card';
import SectionLabel from './SectionLabel';
import CollapsibleSection from './CollapsibleSection';
import { addDays, formatMinutes } from '@/src/lib/hoursOverview';
import type { WeekBreakdown } from '@/src/lib/hours';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WeekBreakdownCardProps {
  /** Current UTC pay week's minute buckets from the hours overview (HoursData.breakdown) */
  breakdown: WeekBreakdown;
  /** Header-only when true; read only with onToggle. Default false. */
  collapsed?: boolean;
  /** Makes the header a hide / show toggle. Without it the card is always expanded. */
  onToggle?: () => void;
  /** Pass-through testID on the Card */
  testID?: string;
}

// ─── Pure helpers (exported for tests) ────────────────────────────────────────

/** A display string plus the pieces it may wrap between on a narrow column. */
export interface BreakdownText {
  /** Full string (parts joined with a space) */
  label: string;
  parts: string[];
}

export type BreakdownStatusKind = 'left' | 'over' | 'reached' | 'none';

export interface BreakdownStatus extends BreakdownText {
  kind: BreakdownStatusKind;
  /** Minutes left (left) or over limit + approved OT (over); 0 otherwise */
  minutes: number;
}

export interface BreakdownBar {
  /** Segment widths as % of the bar */
  trackedPct: number;
  approvedPct: number;
  pendingPct: number;
  /** Weekly-limit marker position as % of the bar; null when no limit is known */
  limitPct: number | null;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: string;
  /** Zero-valued rows render muted */
  muted: boolean;
}

export interface BreakdownGroup {
  key: 'billable' | 'notBillable' | 'limit';
  title: string;
  /** Group total shown on the heading line, or null */
  total: string | null;
  rows: BreakdownRow[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Bar scale headroom so the limit marker never sits on the right edge. */
const BAR_HEADROOM = 1.08;

function mins(m: number): number {
  return Math.max(0, Math.round(Number.isFinite(m) ? m : 0));
}

function text(parts: string[]): BreakdownText {
  return { label: parts.join(' '), parts };
}

function parseUtcDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  // Rejects dates that roll over, e.g. 2026-02-30
  return parsed.toISOString().slice(0, 10) === date ? parsed : null;
}

/**
 * "Mon 19 – Sun 25 Oct" for the Mon–Sun UTC week starting at `weekStart` (YYYY-MM-DD);
 * "Mon 26 Oct – Sun 1 Nov" when the week spans two months; "" for an invalid date.
 */
export function formatWeekRange(weekStart: string): string {
  const start = parseUtcDate(weekStart);
  if (!start) return '';
  const end = parseUtcDate(addDays(weekStart, 6));
  if (!end) return '';
  const day = (d: Date) => `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  const head = start.getUTCMonth() === end.getUTCMonth() ? day(start) : `${day(start)} ${month(start)}`;
  return `${head} – ${day(end)} ${month(end)}`;
}

/**
 * Status against the weekly limit + approved overtime: "1h 10m left", "2h 30m over ·
 * not approved" (hourly contracts only — unapproved overtime is not paid) or "Limit
 * reached". Kind 'none' (empty label) when no limit is known.
 */
export function breakdownStatus(b: WeekBreakdown): BreakdownStatus {
  const limit = mins(b.limitMinutes);
  if (limit === 0) return { kind: 'none', minutes: 0, ...text([]) };
  const cap = limit + mins(b.approvedOvertime);
  const billable = mins(b.billable);
  if (billable < cap) {
    const left = cap - billable;
    return { kind: 'left', minutes: left, ...text([`${formatMinutes(left)} left`]) };
  }
  if (b.isHourly && billable > cap) {
    const over = billable - cap;
    return { kind: 'over', minutes: over, ...text([`${formatMinutes(over)} over`, '· not approved']) };
  }
  return { kind: 'reached', minutes: 0, ...text(['Limit reached']) };
}

/** "of your 40h weekly limit" (+ "+ 2h approved OT" when overtime is approved); "" with no limit. */
export function limitCaption(b: WeekBreakdown): BreakdownText {
  const limit = mins(b.limitMinutes);
  if (limit === 0) return text([]);
  const ot = mins(b.approvedOvertime);
  const parts = [`of your ${formatMinutes(limit)} weekly limit`];
  if (ot > 0) parts.push(`+ ${formatMinutes(ot)} approved OT`);
  return text(parts);
}

/**
 * Stacked-bar geometry. Scale = max(limit + approved OT, billable + pending) × 1.08, so
 * the limit marker always sits inside the bar and pending time is drawn past billable.
 */
export function breakdownBar(b: WeekBreakdown): BreakdownBar {
  const tracked = mins(b.tracked);
  const approved = mins(b.manualApproved);
  const pending = mins(b.manualPending);
  const limit = mins(b.limitMinutes);
  const cap = limit + mins(b.approvedOvertime);
  const drawn = Math.max(mins(b.billable), tracked + approved) + pending;
  const scale = Math.max(cap, drawn) * BAR_HEADROOM;
  if (scale <= 0) return { trackedPct: 0, approvedPct: 0, pendingPct: 0, limitPct: null };
  const pct = (m: number) => (m / scale) * 100;
  return {
    trackedPct: pct(tracked),
    approvedPct: pct(approved),
    pendingPct: pct(pending),
    limitPct: limit > 0 ? pct(limit) : null,
  };
}

/**
 * Spoken label of the hide / show toggle: "Pay week, 1h 10m left, of your 40h weekly
 * limit. Hide details"; "Pay week. Show details" with no known limit.
 */
export function breakdownToggleLabel(b: WeekBreakdown, collapsed: boolean): string {
  const summary = [breakdownStatus(b).label, limitCaption(b).label].filter((s) => s !== '').join(', ');
  const head = summary === '' ? 'Pay week' : `Pay week, ${summary}`;
  return `${head}. ${collapsed ? 'Show details' : 'Hide details'}`;
}

/** The three row groups, mirroring the dashboard: BILLABLE, NOT BILLABLE, LIMIT. */
export function breakdownGroups(b: WeekBreakdown): BreakdownGroup[] {
  const row = (key: string, label: string, minutes: number): BreakdownRow => ({
    key,
    label,
    value: formatMinutes(minutes),
    muted: mins(minutes) === 0,
  });
  const orNone = (key: string, label: string, minutes: number): BreakdownRow => {
    const m = mins(minutes);
    return { key, label, value: m > 0 ? formatMinutes(m) : 'None', muted: m === 0 };
  };
  return [
    {
      key: 'billable',
      title: 'BILLABLE',
      total: formatMinutes(b.billable),
      rows: [
        row('tracked', 'Tracked', b.tracked),
        row('manualApproved', 'Manual, approved', b.manualApproved),
      ],
    },
    {
      key: 'notBillable',
      title: 'NOT BILLABLE',
      total: null,
      rows: [
        row('manualPending', 'Manual, pending', b.manualPending),
        row('manualRejected', 'Manual, rejected', b.manualRejected),
        row('idle', 'Idle time', b.idle),
        row('disputed', 'Disputed', b.disputed),
      ],
    },
    {
      key: 'limit',
      title: 'LIMIT',
      total: null,
      rows: [
        orNone('weeklyLimit', 'Weekly limit', b.limitMinutes),
        orNone('approvedOvertime', 'Approved overtime', b.approvedOvertime),
      ],
    },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
const GROUP_HEADING: TextStyle = { fontSize: 10, letterSpacing: 0.8 };
const BAR_H = 10;

const STATUS_COLOR: Record<BreakdownStatusKind, string> = {
  left: 'text-textPrimary',
  over: 'text-warning',
  reached: 'text-success',
  none: 'text-textMuted',
};

/** Right-aligned pieces that wrap between parts, never mid-phrase. */
function Parts({ parts, className, testID }: { parts: string[]; className: string; testID: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: 4 }}>
      {parts.map((p) => (
        <Text key={p} className={className} style={TABULAR}>
          {p}
        </Text>
      ))}
    </View>
  );
}

function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`w-2 h-2 rounded-full ${swatch}`} />
      <Text className="text-textMuted font-sans text-xs">{label}</Text>
    </View>
  );
}

function StackedBar({ b, bar }: { b: WeekBreakdown; bar: BreakdownBar }) {
  const fillPct = bar.trackedPct + bar.approvedPct + bar.pendingPct;
  const limitPct = bar.limitPct;
  const a11y = [
    `Tracked ${formatMinutes(b.tracked)}`,
    `manual approved ${formatMinutes(b.manualApproved)}`,
    `manual pending ${formatMinutes(b.manualPending)}`,
    limitPct !== null ? `${formatMinutes(b.limitMinutes)} limit` : null,
  ].filter(Boolean).join(', ');

  return (
    <View className="mt-4">
      {/* Limit label anchored to the marker on whichever side has room */}
      {limitPct !== null && (
        <View style={{ height: 14 }}>
          <Text
            testID="week-breakdown-limit-label"
            className="text-warning font-sans-medium"
            style={[
              { position: 'absolute', fontSize: 10, lineHeight: 14 },
              TABULAR,
              limitPct >= 50
                ? { right: `${100 - limitPct}%`, paddingRight: 4 }
                : { left: `${limitPct}%`, paddingLeft: 4 },
            ]}
          >
            {`${formatMinutes(b.limitMinutes)} limit`}
          </Text>
        </View>
      )}

      <View
        testID="week-breakdown-bar"
        accessible
        accessibilityLabel={a11y}
        style={{ height: BAR_H, marginTop: 4 }}
      >
        <View
          className="bg-border"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: BAR_H / 2, overflow: 'hidden' }}
        >
          {fillPct > 0 && (
            <View
              style={{ flexDirection: 'row', width: `${fillPct}%`, height: '100%', borderRadius: BAR_H / 2, overflow: 'hidden' }}
            >
              {bar.trackedPct > 0 && (
                <View testID="week-breakdown-bar-tracked" className="bg-success" style={{ flex: bar.trackedPct }} />
              )}
              {bar.approvedPct > 0 && (
                <View testID="week-breakdown-bar-approved" className="bg-violet" style={{ flex: bar.approvedPct }} />
              )}
              {bar.pendingPct > 0 && (
                <View
                  testID="week-breakdown-bar-pending"
                  className="bg-violet/25 border border-violet"
                  style={{ flex: bar.pendingPct }}
                />
              )}
            </View>
          )}
        </View>

        {limitPct !== null && (
          <View
            testID="week-breakdown-limit-marker"
            className="bg-warning rounded-full"
            style={{ position: 'absolute', left: `${limitPct}%`, top: -4, bottom: -4, width: 2, marginLeft: -1 }}
          />
        )}
      </View>
    </View>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeekBreakdownCard({
  breakdown: b,
  collapsed = false,
  onToggle,
  testID,
}: WeekBreakdownCardProps): React.JSX.Element {
  const range = formatWeekRange(b.weekStart);
  const status = breakdownStatus(b);
  const caption = limitCaption(b);
  const bar = breakdownBar(b);
  const groups = breakdownGroups(b);
  const pending = mins(b.manualPending);

  /* Header: label + UTC pay-week range | status vs limit */
  const header = (
    <View className="flex-row items-start justify-between gap-3">
      <View style={{ flexShrink: 0 }}>
        <SectionLabel>PAY WEEK</SectionLabel>
        {range !== '' && (
          <Text testID="week-breakdown-range" className="text-textMuted font-sans text-xs mt-1">
            {`${range} · UTC`}
          </Text>
        )}
      </View>
      {status.kind !== 'none' && (
        <View
          style={{ flex: 1, alignItems: 'flex-end' }}
          // Inside the toggle, the toggle's label speaks the status
          accessible={onToggle === undefined}
          accessibilityLabel={`${status.label}, ${caption.label}`}
        >
          <Parts
            parts={status.parts}
            className={`font-sans-semibold text-sm ${STATUS_COLOR[status.kind]}`}
            testID="week-breakdown-status"
          />
          <Parts parts={caption.parts} className="text-textMuted font-sans text-xs" testID="week-breakdown-caption" />
        </View>
      )}
    </View>
  );

  const body = (
    <>
      <StackedBar b={b} bar={bar} />

      <View className="flex-row flex-wrap mt-3" style={{ columnGap: 16, rowGap: 4 }}>
        <LegendItem swatch="bg-success" label="Tracked" />
        <LegendItem swatch="bg-violet" label="Manual, approved" />
        <LegendItem swatch="bg-violet/25 border border-violet" label="Manual, pending" />
      </View>

      {/* Rows: BILLABLE / NOT BILLABLE / LIMIT */}
      <View className="mt-4 pt-4 border-t border-border gap-4">
        {groups.map((g) => (
          <View key={g.key} testID={`week-breakdown-group-${g.key}`}>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-textMuted font-sans-semibold uppercase" style={GROUP_HEADING}>
                {g.title}
              </Text>
              {g.total !== null && (
                <Text className="text-textSecondary font-mono text-xs" style={TABULAR}>
                  {g.total}
                </Text>
              )}
            </View>
            {g.rows.map((r) => (
              <View
                key={r.key}
                testID={`week-breakdown-row-${r.key}`}
                className="flex-row items-center justify-between py-1"
              >
                <Text className={`font-sans text-sm ${r.muted ? 'text-textMuted' : 'text-textSecondary'}`}>
                  {r.label}
                </Text>
                <Text
                  className={`font-mono text-sm ${r.muted ? 'text-textMuted' : 'text-textPrimary'}`}
                  style={TABULAR}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {pending > 0 && (
        <View testID="week-breakdown-footnote" className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/25">
          <Text className="text-textSecondary font-sans text-xs" style={{ lineHeight: 18 }}>
            <Text className="text-warning font-sans-semibold" style={TABULAR}>
              {formatMinutes(pending)}
            </Text>
            {' of manual time becomes billable when your manager approves it.'}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <Card testID={testID}>
      {onToggle !== undefined ? (
        <CollapsibleSection
          collapsed={collapsed}
          onToggle={onToggle}
          accessibilityLabel={breakdownToggleLabel(b, collapsed)}
          toggleTestID="week-breakdown-toggle"
          header={header}
        >
          {body}
        </CollapsibleSection>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </Card>
  );
}
