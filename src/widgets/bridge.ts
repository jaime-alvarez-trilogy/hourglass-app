// FR1, FR2, FR3: Widget Data Bridge
// updateWidgetData — called by app after each data refresh
// buildTimelineEntries — generates iOS timeline entries with countdown accuracy
// readWidgetData — read by Android widget task handler
// clearWidgetData — sign-out: replaces the iOS timeline with an empty signed-out snapshot
// Extended in 08-widget-enhancements: buildDailyEntries, formatApprovalItems, formatMyRequests

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUrgencyLevel, getSundayMidnightGMT, computePacingSignal } from '../lib/hours';
import type { HoursData, DailyEntry } from '../lib/hours';
import type { AIWeekData } from '../lib/ai';
import type { CrossoverConfig } from '../types/config';
import type { ApprovalItem } from '../lib/approvals';
import type { ManualRequestEntry } from '../types/requests';
import type { WidgetData, WidgetUrgency, WidgetDailyEntry, WidgetApprovalItem, WidgetMyRequest } from './types';

const WIDGET_DATA_KEY = 'widget_data';
// Stale threshold: 2 hours in ms
export const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// ─── Formatters ───────────────────────────────────────────────────────────────

/**
 * Format a number as USD currency string: $1,300 or $800
 */
function formatEarnings(amount: number): string {
  const rounded = Math.round(amount);
  return '$' + rounded.toLocaleString('en-US');
}

/**
 * Compute hoursRemaining display string from HoursData.
 */
function formatHoursRemaining(hoursRemaining: number, overtimeHours: number): string {
  if (overtimeHours > 0) {
    return `${overtimeHours.toFixed(1)}h OT`;
  }
  return `${hoursRemaining.toFixed(1)}h left`;
}

/**
 * Compute AI% range string: "71%–75%" (en-dash) or "N/A"
 */
function formatAIPct(aiData: AIWeekData | null): string {
  if (!aiData) return 'N/A';
  return `${aiData.aiPctLow}%\u2013${aiData.aiPctHigh}%`;
}

// ─── 08-widget-enhancements: data transformation helpers ─────────────────────

// Day names in Mon[0]–Sun[6] order
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Maps a YYYY-MM-DD date string to a Mon–Sun day index (Mon=0, Sun=6).
 * Uses T12:00:00 to avoid UTC midnight shifting in local timezone.
 */
function dateToDayIndex(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const jsDay = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return jsDay === 0 ? 6 : jsDay - 1; // Mon=0, Sun=6
}

/**
 * Returns midnight (00:00:00.000) of the given date in local time.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Returns the Monday of the ISO week containing `d` (local time midnight).
 */
function getWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysFromMonday);
  return monday;
}

/**
 * Builds exactly 7 WidgetDailyEntry values in Mon[0]–Sun[6] order
 * from HoursData.daily. Missing days are filled with hours: 0, isToday: false.
 *
 * @param daily - Source daily entries from HoursData.
 * @param now   - Current date for isFuture computation (defaults to new Date()).
 *                Accepts an optional value for testability.
 *
 * Exported for unit testing.
 */
export function buildDailyEntries(daily: DailyEntry[], now: Date = new Date()): WidgetDailyEntry[] {
  const todayStart = startOfDay(now);
  const weekMonday = getWeekMonday(now);

  // Build a lookup: dayIndex → entry
  const byDayIndex: Record<number, DailyEntry> = {};
  for (const entry of daily) {
    const idx = dateToDayIndex(entry.date);
    byDayIndex[idx] = entry;
  }

  return DAY_LABELS.map((dayLabel, i) => {
    const entry = byDayIndex[i];
    if (!entry) {
      // Gap-filled: derive the reconstructed date from week Monday + day index
      const reconstructedDate = new Date(
        weekMonday.getFullYear(),
        weekMonday.getMonth(),
        weekMonday.getDate() + i,
      );
      return {
        day: dayLabel,
        hours: 0,
        isToday: false,
        isFuture: reconstructedDate > todayStart,
      };
    }
    return {
      day: dayLabel,
      hours: Math.round(entry.hours * 10) / 10,
      isToday: entry.isToday,
      isFuture: startOfDay(new Date(entry.date + 'T12:00:00')) > todayStart,
    };
  });
}

/**
 * Truncates a string to maxLen characters with an ellipsis if needed.
 * Uses a single Unicode ellipsis character (…) as the truncation marker.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Formats up to maxCount ApprovalItems into WidgetApprovalItem display records.
 * Names are truncated to 18 chars. Category is derived from item.category.
 *
 * Exported for unit testing.
 */
export function formatApprovalItems(
  items: ApprovalItem[],
  maxCount: number,
): WidgetApprovalItem[] {
  return items.slice(0, maxCount).map((item) => ({
    id: item.id,
    name: truncate(item.fullName, 18),
    hours: item.hours,
    category: item.category,
  }));
}

// Month abbreviations for date formatting
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/**
 * Formats a YYYY-MM-DD date string as "Ddd Mmm D" (e.g. "Tue Mar 18").
 */
function formatRequestDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAY_ABBR[d.getDay()]} ${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Formats up to maxCount ManualRequestEntries into WidgetMyRequest display records.
 * Date is formatted as "Ddd Mmm D". Memo is truncated to 18 chars.
 *
 * Exported for unit testing.
 */
export function formatMyRequests(
  entries: ManualRequestEntry[],
  maxCount: number,
): WidgetMyRequest[] {
  return entries
    .filter((entry) => entry.status === 'PENDING' || entry.status === 'REJECTED')
    .slice(0, maxCount).map((entry) => ({
    id: entry.id,
    date: formatRequestDate(entry.date),
    hours: (entry.durationMinutes / 60).toFixed(1) + 'h',
    memo: truncate(entry.memo, 18),
    status: entry.status,
  }));
}

/**
 * Derives the actionBg tint color from role and item states.
 * Returns "" in hours mode (no pending items) — never null, as null serializes
 * to NSNull which UserDefaults rejects as a non-plist type.
 */
function deriveActionBg(
  isManager: boolean,
  approvalItems: ApprovalItem[],
  myRequests: ManualRequestEntry[],
): string {
  if (isManager) {
    return approvalItems.length > 0 ? '#1C1400' : '';
  }
  // Contributor: check request statuses
  const hasRejected = myRequests.some((r) => r.status === 'REJECTED');
  if (hasRejected) return '#1C0A0E';
  const hasPending = myRequests.some((r) => r.status === 'PENDING');
  if (hasPending) return '#120E1A';
  return '';
}

// ─── 01-data-extensions: pace badge + week delta computation ─────────────────

/**
 * Computes the paceBadge value from hoursData and config.
 * Returns 'none' if hoursData is null or expectedHours is 0 (Monday).
 * Returns 'crushed_it' if in overtime.
 * Otherwise compares total vs expected using workdays elapsed Mon–Fri.
 */
function computePaceBadge(
  hoursData: HoursData | null,
  config: CrossoverConfig,
): 'crushed_it' | 'on_track' | 'behind' | 'critical' | 'none' {
  if (!hoursData) return 'none';
  if (hoursData.overtimeHours > 0) return 'crushed_it';

  const day = new Date().getDay(); // 0=Sun, 1=Mon..6=Sat
  // Elapsed workdays: Mon(1)→0, Tue(2)→1, Wed(3)→2, Thu(4)→3, Fri(5)→4, Sat(6)→5, Sun(0)→5
  const workdaysElapsed = (day === 0 || day === 6) ? 5 : Math.min(day - 1, 5);
  const weeklyLimit = config.weeklyLimit ?? 40;
  const expectedHours = weeklyLimit * (workdaysElapsed / 5);

  if (expectedHours === 0) return 'none';

  const ratio = hoursData.total / expectedHours;
  if (ratio >= 0.9) return 'on_track';
  if (ratio >= 0.7) return 'behind';
  return 'critical';
}

/**
 * Computes weekDeltaHours and weekDeltaEarnings formatted strings.
 * Returns empty strings when hoursData or prevWeekSnapshot is missing.
 */
function computeWeekDeltas(
  hoursData: HoursData | null,
  prevWeekSnapshot: { hours: number; earnings: number } | null | undefined,
): { weekDeltaHours: string; weekDeltaEarnings: string } {
  if (!hoursData || !prevWeekSnapshot) {
    return { weekDeltaHours: '', weekDeltaEarnings: '' };
  }
  const dh = hoursData.total - prevWeekSnapshot.hours;
  const de = hoursData.weeklyEarnings - prevWeekSnapshot.earnings;
  const weekDeltaHours = (dh >= 0 ? '+' : '') + dh.toFixed(1) + 'h';
  const weekDeltaEarnings = de >= 0
    ? '+$' + Math.round(de).toLocaleString()
    : '-$' + Math.abs(Math.round(de)).toLocaleString();
  return { weekDeltaHours, weekDeltaEarnings };
}

/**
 * Computes today's hours vs daily average as a signed delta string.
 * Returns "" when average === 0 (e.g. Monday, no baseline yet).
 * Exported for direct unit testing.
 *
 * @param today   - HoursData.today (hours worked today, raw number)
 * @param average - HoursData.average (average daily hours this week, raw number)
 * @returns "+1.2h" | "-0.5h" | "+0.0h" | ""
 */
export function computeTodayDelta(today: number, average: number): string {
  if (average === 0) return '';
  const delta = today - average;
  const abs = Math.abs(delta).toFixed(1);
  return delta >= 0 ? `+${abs}h` : `-${abs}h`;
}

// ─── buildWidgetData ──────────────────────────────────────────────────────────

/**
 * Builds a WidgetData snapshot from app data sources.
 * Called internally by updateWidgetData.
 *
 * Extended in 08-widget-enhancements to accept approvalItems + myRequests
 * and produce daily, approvalItems, myRequests, actionBg fields.
 *
 * Extended in 01-data-extensions: accepts HoursData | null and optional
 * prevWeekSnapshot; produces paceBadge, weekDeltaHours, weekDeltaEarnings,
 * brainliftTarget fields.
 */
function buildWidgetData(
  hoursData: HoursData | null,
  aiData: AIWeekData | null,
  _pendingCount: number,
  config: CrossoverConfig,
  approvalItems: ApprovalItem[] = [],
  myRequests: ManualRequestEntry[] = [],
  now: number = Date.now(),
  prevWeekSnapshot?: { hours: number; earnings: number } | null,
): WidgetData {
  // 01-data-extensions: compute new fields (work with null hoursData)
  const paceBadge = computePaceBadge(hoursData, config);
  const { weekDeltaHours, weekDeltaEarnings } = computeWeekDeltas(hoursData, prevWeekSnapshot);

  // Guard: hoursData required for deadline-dependent fields
  if (!hoursData) {
    return {
      hours: '0.0',
      hoursDisplay: '0.0h',
      earnings: '$0',
      earningsRaw: 0,
      today: '0.0h',
      hoursRemaining: '0.0h left',
      aiPct: formatAIPct(aiData),
      brainlift: aiData ? `${aiData.brainliftHours.toFixed(1)}h` : '0.0h',
      deadline: now,
      urgency: 'none',
      pendingCount: 0,
      isManager: config.isManager,
      cachedAt: now,
      useQA: config.useQA,
      daily: [],
      approvalItems: [],
      myRequests: [],
      actionBg: '',
      paceBadge,
      weekDeltaHours,
      weekDeltaEarnings,
      brainliftTarget: '5h',
      todayDelta: '',
    };
  }

  // pendingCount is derived from approvalItems, not the passed-in parameter
  // devManagerView acts as isManager for widget purposes (debug preview)
  const actingAsManager = config.isManager || (config.devManagerView ?? false);
  const derivedPendingCount = actingAsManager ? approvalItems.length : 0;

  // deadline may be a Date, an ISO string (JSON-deserialized from cache), or
  // undefined (old cache written before the deadline field was added). Handle all three.
  // Fallback is the hard deadline: Sunday 23:59:59 UTC (week close), not Thursday.
  const deadlineMs = hoursData.deadline instanceof Date
    ? hoursData.deadline.getTime()
    : typeof hoursData.deadline === 'string'
      ? new Date(hoursData.deadline).getTime()
      : getSundayMidnightGMT().getTime();
  const urgency: WidgetUrgency = getUrgencyLevel(deadlineMs - now);

  // Format items for widget display
  const widgetApprovalItems = actingAsManager ? formatApprovalItems(approvalItems, 3) : [];
  const widgetMyRequests = actingAsManager ? [] : formatMyRequests(myRequests, 3);

  return {
    hours: hoursData.total.toFixed(1),
    hoursDisplay: `${hoursData.total.toFixed(1)}h`,
    earnings: formatEarnings(hoursData.weeklyEarnings),
    earningsRaw: hoursData.weeklyEarnings,
    today: `${hoursData.today.toFixed(1)}h`,
    hoursRemaining: formatHoursRemaining(hoursData.hoursRemaining, hoursData.overtimeHours),
    aiPct: formatAIPct(aiData),
    brainlift: aiData ? `${aiData.brainliftHours.toFixed(1)}h` : '0.0h',
    deadline: deadlineMs,
    urgency,
    pendingCount: derivedPendingCount,
    isManager: actingAsManager,
    cachedAt: now,
    useQA: config.useQA,
    // 08-widget-enhancements fields
    daily: buildDailyEntries(hoursData.daily),
    approvalItems: widgetApprovalItems,
    myRequests: widgetMyRequests,
    actionBg: deriveActionBg(actingAsManager, approvalItems, myRequests),
    // 01-data-extensions fields
    paceBadge,
    weekDeltaHours,
    weekDeltaEarnings,
    brainliftTarget: '5h',
    // 01-widget-polish fields
    todayDelta: computeTodayDelta(hoursData.today, hoursData.average),
  };
}

// ─── FR2: buildTimelineEntries ────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
/** Hourly entries land 1 s after each hour boundary before the deadline; the last one 1 s after it. */
const TIMELINE_EXPIRY_OFFSET_MS = 1000;
/** 8 days: covers a full week from a Monday 00:00 open, with margin. */
const TIMELINE_MAX_HOURLY_ENTRIES = 8 * 24;

/**
 * Generates an array of timeline entries for iOS WidgetKit.
 * Each entry is {date, props} where props is a copy of baseData with
 * urgency recomputed for that entry's date vs deadline.
 *
 * With `extendToDeadline`, entries continue past the `count` fine-grained ones until the
 * deadline: one per hour at `deadline − k h + 1 s` (so each lands just after the widget's
 * hourly "Due in …" label changes), ending with an expired entry at `deadline + 1 s`. The
 * timeline policy is `.atEnd` (expo-widgets 58) and nothing reloads it between app opens,
 * so WidgetKit keeps showing the last entry once they run out: without this, a deadline more
 * than `count × intervalMinutes` away would freeze the countdown and the end-of-week urgency
 * on the last entry (final review 2026-10-21). The hourly run is capped at 8 days.
 *
 * @param baseData  - Current WidgetData snapshot
 * @param count     - Number of fine-grained entries (default 60)
 * @param intervalMinutes - Minutes between fine-grained entries (default 15)
 * @param options.extendToDeadline - Append the hourly run and the expiry entry (default false)
 */
export function buildTimelineEntries(
  baseData: WidgetData,
  count: number = 60,
  intervalMinutes: number = 15,
  options: { extendToDeadline?: boolean } = {}
): Array<{ date: Date; props: WidgetData }> {
  const intervalMs = intervalMinutes * 60 * 1000;
  const startTime = Date.now();
  const entries: Array<{ date: Date; props: WidgetData }> = [];

  const entryAt = (entryTimeMs: number): { date: Date; props: WidgetData } => {
    const urgency: WidgetUrgency = getUrgencyLevel(baseData.deadline - entryTimeMs);
    // Recompute hoursRemaining display for entries past deadline
    const hoursRemaining =
      urgency === 'expired' ? '0h left' : baseData.hoursRemaining;
    return {
      date: new Date(entryTimeMs),
      props: {
        ...baseData,
        urgency,
        hoursRemaining,
      },
    };
  };

  for (let i = 0; i < count; i++) {
    entries.push(entryAt(startTime + i * intervalMs));
  }

  if (options.extendToDeadline && baseData.deadline > 0) {
    const lastMs = entries.length > 0 ? entries[entries.length - 1].date.getTime() : startTime - 1;
    // Largest k with deadline − k h + 1 s still after the last fine entry, capped.
    const fitting = Math.ceil((baseData.deadline + TIMELINE_EXPIRY_OFFSET_MS - lastMs) / HOUR_MS) - 1;
    for (let k = Math.min(fitting, TIMELINE_MAX_HOURLY_ENTRIES); k >= 0; k--) {
      entries.push(entryAt(baseData.deadline - k * HOUR_MS + TIMELINE_EXPIRY_OFFSET_MS));
    }
  }

  return entries;
}

// ─── FR3: readWidgetData ──────────────────────────────────────────────────────

/**
 * Reads WidgetData from AsyncStorage.
 * Used by Android widget task handler.
 * Returns null if key absent, JSON malformed, or AsyncStorage throws.
 */
export async function readWidgetData(): Promise<WidgetData | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_DATA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WidgetData;
  } catch {
    return null;
  }
}

// ─── iOS widget layout ────────────────────────────────────────────────────────
//
// Self-contained JS function string evaluated in the widget extension's JSContext.
// The JSContext loads ExpoWidgets.bundle first, which exposes SwiftUI helpers as
// globals: VStack, HStack, Text, Spacer, ZStack, Circle, RoundedRectangle, Capsule,
// LinearGradient, ContainerBackground, and modifier functions:
// foregroundStyle(color), font({size,weight}), frame({width?,height?}),
// padding({all}), background(color), opacity(val).
//
// Rules for this string:
//   - No imports, no require() — use only globals
//   - No closed-over variables from the outer bundle scope
//   - Must be a function expression (wrapped in parens by createWidgetContext)
//   - ES5 only: var, function declarations, no arrow functions, no const/let
//
// The native WidgetObject stores this string in UserDefaults (App Group shared
// storage). The widget extension reads it, evaluates it, and calls the function
// with (props: WidgetData, env: { widgetFamily: string, date: Date }) each render cycle.
//
// 10-sdk-58-ios-27 FR6 (expo-widgets 58 / @expo/ui 58):
//   - props may be undefined: placeholder() and a timeline-less gallery snapshot pass the
//     initial props, and there are none until createWidget has stored them (#46492).
//   - No native background since expo-widgets 56: each system root sets
//     containerBackground('#0D0D1A', 'widget'), the build-18 native color. Lock-screen
//     accessories don't (the system draws their background).
//   - Stacks without `spacing` now get the system default, so every HStack/VStack sets it.
//   - env.date is the timeline entry's date. The countdown reads the later of env.date and
//     Date.now(): WidgetKit renders entries ahead of their date (so env.date, not the render
//     time), and after the last entry it keeps showing that one (.atEnd), so real time past
//     env.date wins. The timeline itself runs to just past the deadline: 96 fifteen-minute
//     entries, then hourly ones (buildTimelineEntries extendToDeadline, final review 2026-10-21).
//
// 02-ios-visual: Full brand redesign — mesh bg simulation, glass panels,
// pace badge, week delta text, brainliftTarget-driven progress bars.
//
const WIDGET_LAYOUT_JS = `(function(props, env) {
  props = props || {};
  var fillFrame = frame({ maxWidth: 9999, maxHeight: 9999 });

  // ── Palette ──────────────────────────────────────────────────────────────────
  var bg     = '#0D0C14';
  var text1  = '#E0E0E0';
  var text2  = '#A0A0A0';
  var muted  = '#757575';
  var gold   = '#E8C97A';
  var cyan   = '#00C2FF';
  var violet = '#A78BFA';
  var future = '#2F2E41';

  // ── Props ────────────────────────────────────────────────────────────────────
  var hoursDisplay   = props.hoursDisplay   || '0.0h';
  var earnings       = props.earnings       || '$0';
  var aiPct          = props.aiPct          || 'N/A';
  var brainlift      = props.brainlift      || '0.0h';
  var brainliftTarget= props.brainliftTarget|| '5h';
  var todayDelta     = props.todayDelta     || props.today || '';
  var hoursRemaining = props.hoursRemaining || '';
  var paceBadge      = props.paceBadge      || 'on_track';
  var pendingCount   = props.pendingCount   || 0;
  var isManager      = props.isManager      || false;
  var deadline       = props.deadline       || 0;
  var approvalItems  = props.approvalItems  || [];
  var daily          = props.daily          || [];

  var paceLabels = { crushed_it: 'CRUSHED IT', on_track: 'ON TRACK', behind: 'BEHIND PACE', critical: 'CRITICAL' };
  var paceLabel  = paceLabels[paceBadge] || 'ON TRACK';

  var statusColor = '#10B981';
  if (paceBadge === 'behind')     statusColor = '#F59E0B';
  if (paceBadge === 'critical')   statusColor = '#F43F5E';
  if (paceBadge === 'crushed_it') statusColor = '#E8C97A';

  var maxHours = 0.1;
  for (var i = 0; i < daily.length; i++) {
    if (daily[i].hours > maxHours) maxHours = daily[i].hours;
  }

  // ── Deadline countdown ───────────────────────────────────────────────────────
  var deadlineLabel = '';
  var msLeft = 0;
  var isEOWUrgent = false;
  // The later of the entry's date and real time: WidgetKit renders entries ahead of their date
  // (env.date wins), and keeps re-rendering the last one after the timeline runs out (.atEnd),
  // when real time must win or the countdown freezes past the deadline.
  var entryMs = (env && env.date) ? env.date.getTime() : 0;
  var nowMs = Math.max(entryMs, Date.now());
  if (deadline) {
    msLeft = deadline - nowMs;
    if (msLeft > 0) {
      var totalH = Math.floor(msLeft / 3600000);
      deadlineLabel = totalH >= 24
        ? 'Due in ' + Math.floor(totalH / 24) + 'd ' + (totalH % 24) + 'h'
        : 'Due in ' + totalH + 'h';
      isEOWUrgent = msLeft <= 86400000; // last 24h before EOW
    }
  }

  // ── EOW urgency: red gradient overlay (top → transparent) ────────────────────
  // Activates when manager has pending approvals AND < 24h to EOW
  var eowUrgencyOverlay = (isEOWUrgent && pendingCount > 0)
    ? Rectangle({ modifiers: [
        foregroundStyle({ type: 'linearGradient',
          colors: ['#F43F5E', '#F43F5E00'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 } }),
        opacity(0.18), fillFrame
      ]})
    : null;

  // ── Pill: swap to red PENDING alert in EOW urgency window ────────────────────
  function buildPill() {
    if (isEOWUrgent && pendingCount > 0) {
      return ZStack({ alignment: 'center', children: [
        RoundedRectangle({ cornerRadius: 12, modifiers: [foregroundStyle('#F43F5E'), opacity(0.20), frame({ height: 24 })] }),
        Text({ modifiers: [foregroundStyle('#F43F5E'), font({ size: 10, weight: 'bold' }),
          padding({ leading: 12, trailing: 12 })],
          children: '\u26A0  ' + pendingCount + ' PENDING' })
      ]});
    }
    return buildStatusPill();
  }

  // ── Glass card ───────────────────────────────────────────────────────────────
  // gradient fill (light hits top surface) + chamfered specular edge
  function buildGlassCard(children) {
    return ZStack({ alignment: 'leading', children: [
      RoundedRectangle({ cornerRadius: 16, modifiers: [
        foregroundStyle({ type: 'linearGradient', colors: ['#1E1D2A', '#13121C'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 } }),
        fillFrame
      ]}),
      RoundedRectangle({ cornerRadius: 16, modifiers: [
        foregroundStyle({ type: 'linearGradient', colors: ['#FFFFFF', '#FFFFFF00'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0.5 } }),
        opacity(0.10), fillFrame
      ]}),
      VStack({ alignment: 'leading', spacing: 4, modifiers: [padding({ all: 12 })], children: children })
    ]});
  }

  // ── Status pill ───────────────────────────────────────────────────────────────
  function buildStatusPill() {
    return ZStack({ alignment: 'center', children: [
      RoundedRectangle({ cornerRadius: 12, modifiers: [foregroundStyle(statusColor), opacity(0.18), frame({ height: 24 })] }),
      Text({ modifiers: [foregroundStyle(statusColor), font({ size: 10, weight: 'semibold' }),
        padding({ leading: 12, trailing: 12 })], children: paceLabel })
    ]});
  }

  // ── Bar chart — neon-peak gradient bars ──────────────────────────────────────
  function buildBarChart(maxBarH) {
    if (!daily || daily.length === 0) return Spacer({});
    var bars = daily.map(function(day) {
      var barH = Math.max(4, (day.hours / maxHours) * maxBarH);
      var empty = day.isFuture || day.hours === 0;
      var peak  = day.isToday ? statusColor : '#10B981';
      var fill  = empty
        ? foregroundStyle(future)
        : foregroundStyle({ type: 'linearGradient', colors: [peak, peak + '00'],
            startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 } });
      return VStack({ spacing: 3, children: [
        Spacer({}),
        RoundedRectangle({ cornerRadius: 4, modifiers: [fill, frame({ height: barH })] }),
        Text({ modifiers: [foregroundStyle(muted), font({ size: 9 })], children: day.day })
      ]});
    });
    return HStack({ alignment: 'bottom', spacing: 5, children: bars });
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  function buildFooter(showBrainlift) {
    var items = [
      Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })],
        children: 'Today: ' + todayDelta + ' \u2022 AI: ' }),
      Text({ modifiers: [foregroundStyle(cyan), font({ size: 11, weight: 'bold' })], children: aiPct })
    ];
    if (showBrainlift) {
      items.push(Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: ' \u2022 ' }));
      items.push(Text({ modifiers: [foregroundStyle(violet), font({ size: 11, weight: 'bold' })], children: brainlift + ' BL' }));
    }
    items.push(Spacer({}));
    return HStack({ spacing: 0, children: items });
  }

  // ── Approval row (manager large) ──────────────────────────────────────────────
  function buildApprovalRow(item) {
    var badgeColor = item.category === 'OVERTIME' ? violet : cyan;
    return ZStack({ alignment: 'leading', children: [
      RoundedRectangle({ cornerRadius: 12, modifiers: [
        foregroundStyle({ type: 'linearGradient', colors: ['#1E1D2A', '#13121C'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 } }),
        fillFrame
      ]}),
      RoundedRectangle({ cornerRadius: 12, modifiers: [
        foregroundStyle({ type: 'linearGradient', colors: ['#FFFFFF', '#FFFFFF00'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0.5 } }),
        opacity(0.07), fillFrame
      ]}),
      HStack({ spacing: 0, modifiers: [padding({ top: 10, bottom: 10, leading: 12, trailing: 12 })], children: [
        Text({ modifiers: [foregroundStyle(text1), font({ size: 13, weight: 'medium' })],
          children: item.name || '' }),
        Spacer({}),
        Text({ modifiers: [foregroundStyle(gold), font({ size: 13, weight: 'semibold' })],
          children: item.hours || '' }),
        Text({ modifiers: [foregroundStyle(badgeColor), font({ size: 10 }),
          padding({ leading: 8 })], children: item.category || '' })
      ]})
    ]});
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SMALL — hours hero + status pill + BrainLift (or pending count for managers)
  // ══════════════════════════════════════════════════════════════════════════════
  // Small: AI% + deadline in one row; pending badge OR BrainLift in bottom row
  var smallAIRow = [
    Text({ modifiers: [foregroundStyle(muted), font({ size: 10 })], children: 'AI ' }),
    Text({ modifiers: [foregroundStyle(cyan), font({ size: 10, weight: 'bold' })], children: aiPct })
  ];
  if (deadlineLabel) {
    smallAIRow.push(Text({ modifiers: [foregroundStyle(muted), font({ size: 10 })],
      children: '  \u2022  ' + deadlineLabel }));
  }
  var smallBottom = pendingCount > 0
    ? HStack({ spacing: 3, children: [
        Text({ modifiers: [foregroundStyle('#F43F5E'), font({ size: 10, weight: 'bold' })],
          children: '\u26A0 ' + pendingCount + ' pending' })
      ]})
    : HStack({ spacing: 4, children: [
        Text({ modifiers: [foregroundStyle(violet), font({ size: 10 })], children: '\u25CF' }),
        Text({ modifiers: [foregroundStyle(violet), font({ size: 10, weight: 'medium' })],
          children: brainlift + ' BL' })
      ]});

  var smallBgChildren = [Rectangle({ modifiers: [foregroundStyle(bg), fillFrame] })];
  if (eowUrgencyOverlay) smallBgChildren.push(eowUrgencyOverlay);
  smallBgChildren.push(VStack({ alignment: 'leading', spacing: 8, modifiers: [padding({ all: 16 })], children: [
    VStack({ alignment: 'leading', spacing: 2, children: [
      Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'THIS WEEK' }),
      Text({ modifiers: [foregroundStyle(text1), font({ size: 28, weight: 'bold', design: 'rounded' })],
        children: hoursDisplay }),
    ]}),
    Spacer({}),
    buildPill(),
    HStack({ spacing: 0, children: smallAIRow }),
    smallBottom
  ]}));

  var small = ZStack({ alignment: 'leading', modifiers: [containerBackground('#0D0D1A', 'widget')], children: smallBgChildren });

  // ══════════════════════════════════════════════════════════════════════════════
  // MEDIUM — two cards + status row (pill + pending OR hours left) + footer w/ BrainLift
  // ══════════════════════════════════════════════════════════════════════════════
  // Medium right: deadline + pending badge (both visible when present)
  var medRightParts = [];
  if (deadlineLabel) {
    medRightParts.push(Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: deadlineLabel }));
  }
  if (pendingCount > 0) {
    if (medRightParts.length > 0) {
      medRightParts.push(Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: '  ' }));
    }
    medRightParts.push(Text({ modifiers: [foregroundStyle('#F43F5E'), font({ size: 11, weight: 'bold' })],
      children: '\u26A0 ' + pendingCount }));
  }
  if (medRightParts.length === 0) {
    medRightParts.push(Text({ modifiers: [foregroundStyle(text2), font({ size: 11 })], children: hoursRemaining }));
  }
  var mediumStatusRight = HStack({ spacing: 0, children: medRightParts });

  var medBgChildren = [Rectangle({ modifiers: [foregroundStyle(bg), fillFrame] })];
  if (eowUrgencyOverlay) medBgChildren.push(eowUrgencyOverlay);
  medBgChildren.push(VStack({ alignment: 'leading', spacing: 10, modifiers: [padding({ all: 14 })], children: [
    HStack({ spacing: 10, children: [
      buildGlassCard([
        Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'THIS WEEK' }),
        Text({ modifiers: [foregroundStyle(text1), font({ size: 26, weight: 'bold', design: 'rounded' })],
          children: hoursDisplay }),
      ]),
      buildGlassCard([
        Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'EARNED' }),
        Text({ modifiers: [foregroundStyle(gold), font({ size: 22, weight: 'bold' })], children: earnings }),
      ])
    ]}),
    HStack({ alignment: 'center', spacing: 0, children: [
      buildPill(),
      Spacer({}),
      mediumStatusRight
    ]}),
    Spacer({}),
    buildFooter(true)
  ]}));

  var medium = ZStack({ alignment: 'leading', modifiers: [containerBackground('#0D0D1A', 'widget')], children: medBgChildren });

  // ══════════════════════════════════════════════════════════════════════════════
  // LARGE — two modes:
  //   manager (pendingCount > 0): cards + approval list + footer
  //   default: cards + status + AI/BrainLift row + bar chart + footer
  // ══════════════════════════════════════════════════════════════════════════════
  var largeRows;

  if (isManager && pendingCount > 0) {
    // Manager mode: approval list
    var appRows = approvalItems.slice(0, 3).map(function(item) { return buildApprovalRow(item); });
    largeRows = [
      HStack({ spacing: 12, modifiers: [frame({ height: 78 })], children: [
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'THIS WEEK' }),
          Text({ modifiers: [foregroundStyle(text1), font({ size: 26, weight: 'bold', design: 'rounded' })],
            children: hoursDisplay }),
        ]),
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'EARNED' }),
          Text({ modifiers: [foregroundStyle(gold), font({ size: 22, weight: 'bold' })], children: earnings }),
        ])
      ]}),
      HStack({ spacing: 0, children: [
        Text({ modifiers: [foregroundStyle('#F43F5E'), font({ size: 12, weight: 'bold' })],
          children: '\u26A0  PENDING APPROVALS' }),
        Spacer({}),
        ZStack({ alignment: 'center', children: [
          Circle({ modifiers: [foregroundStyle('#F43F5E'), frame({ width: 22, height: 22 })] }),
          Text({ modifiers: [foregroundStyle('#FFFFFF'), font({ size: 11, weight: 'bold' })],
            children: String(pendingCount) })
        ]})
      ]}),
    ].concat(appRows).concat([
      Spacer({}),
      buildFooter(false)
    ]);
  } else {
    // Default mode: metrics + chart
    // Large default status row: pill + deadline + optional pending badge
    var largeStatusChildren = [buildPill(), Spacer({})];
    if (deadlineLabel) {
      largeStatusChildren.push(Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: deadlineLabel }));
    } else {
      largeStatusChildren.push(Text({ modifiers: [foregroundStyle(text2), font({ size: 11 })], children: hoursRemaining }));
    }
    if (pendingCount > 0) {
      largeStatusChildren.push(Spacer({ minLength: 8 }));
      largeStatusChildren.push(ZStack({ alignment: 'center', children: [
        Circle({ modifiers: [foregroundStyle('#F43F5E'), frame({ width: 18, height: 18 })] }),
        Text({ modifiers: [foregroundStyle('#FFFFFF'), font({ size: 10, weight: 'bold' })],
          children: String(pendingCount) })
      ]}));
    }

    largeRows = [
      HStack({ spacing: 12, modifiers: [frame({ height: 78 })], children: [
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'THIS WEEK' }),
          Text({ modifiers: [foregroundStyle(text1), font({ size: 26, weight: 'bold', design: 'rounded' })],
            children: hoursDisplay }),
        ]),
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 11, weight: 'medium' })], children: 'EARNED' }),
          Text({ modifiers: [foregroundStyle(gold), font({ size: 22, weight: 'bold' })], children: earnings }),
        ])
      ]}),
      HStack({ alignment: 'center', spacing: 0, children: largeStatusChildren }),
      // Second metrics row: AI% + BrainLift
      HStack({ spacing: 12, modifiers: [frame({ height: 58 })], children: [
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 10, weight: 'medium' })], children: 'AI USAGE' }),
          Text({ modifiers: [foregroundStyle(cyan), font({ size: 18, weight: 'bold' })], children: aiPct }),
        ]),
        buildGlassCard([
          Text({ modifiers: [foregroundStyle(text2), font({ size: 10, weight: 'medium' })], children: 'BRAINLIFT' }),
          HStack({ spacing: 4, children: [
            Text({ modifiers: [foregroundStyle(violet), font({ size: 18, weight: 'bold' })], children: brainlift }),
            Text({ modifiers: [foregroundStyle(muted), font({ size: 11 }), padding({ bottom: 2 })],
              children: '/ ' + brainliftTarget })
          ]})
        ])
      ]}),
      Text({ modifiers: [foregroundStyle(text2), font({ size: 10, weight: 'bold' })], children: 'ACTIVITY' }),
      buildBarChart(48),
      Spacer({}),
      buildFooter(false)
    ];
  }

  var largeBgChildren = [Rectangle({ modifiers: [foregroundStyle(bg), fillFrame] })];
  if (eowUrgencyOverlay) largeBgChildren.push(eowUrgencyOverlay);
  largeBgChildren.push(VStack({ alignment: 'leading', spacing: 10,
    modifiers: [padding({ top: 16, leading: 16, trailing: 16, bottom: 20 })],
    children: largeRows }));

  var large = ZStack({ alignment: 'leading', modifiers: [containerBackground('#0D0D1A', 'widget')], children: largeBgChildren });

  // ── Lock screen accessories ──────────────────────────────────────────────────
  var family = (env && env.widgetFamily) || 'systemMedium';
  if (family === 'accessoryCircular') {
    return VStack({ alignment: 'center', spacing: 0, children: [
      Text({ modifiers: [foregroundStyle(text1), font({ size: 18, weight: 'bold' })], children: hoursDisplay }),
      Text({ modifiers: [foregroundStyle(muted), font({ size: 9 })], children: 'THIS WK' })
    ]});
  }
  if (family === 'accessoryInline') {
    return Text({ modifiers: [foregroundStyle(text1)],
      children: hoursDisplay + ' \u00B7 ' + earnings + ' \u00B7 AI ' + aiPct });
  }
  if (family === 'accessoryRectangular') {
    return HStack({ spacing: 4, children: [
      Text({ modifiers: [foregroundStyle(text1), font({ size: 13, weight: 'bold' })], children: hoursDisplay }),
      Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: '\u00B7' }),
      Text({ modifiers: [foregroundStyle(gold), font({ size: 13, weight: 'semibold' })], children: earnings }),
      Text({ modifiers: [foregroundStyle(muted), font({ size: 11 })], children: '\u00B7' }),
      Text({ modifiers: [foregroundStyle(cyan), font({ size: 11 })], children: 'AI ' + aiPct })
    ]});
  }

  if (family === 'systemSmall') return small;
  if (family === 'systemLarge') return large;
  return medium;
})`;

// ─── iOS widget handle ────────────────────────────────────────────────────────

// expo-widgets' shipped types want a 'widget'-directive component; this app hands the native
// module the layout source itself (WIDGET_LAYOUT_JS), which WidgetObject stores as a string.
// The third argument is stored as the widget's initial props (expo-widgets 58).
type CreateWidget = (
  name: string,
  layout: string,
  initialProps?: WidgetData,
) => { updateTimeline: (entries: { date: Date; props: WidgetData }[]) => void };

/**
 * expo-widgets' createWidget, or null when the native module isn't compiled in
 * (Expo Go, simulator dev builds without the widget target, tests).
 */
function loadCreateWidget(): CreateWidget | null {
  // Guard: check if the native module is available before requiring expo-widgets.
  // requireOptionalNativeModule returns null if the module isn't compiled in
  // (New Architecture / TurboModules safe — NativeModules registry is old-arch only).
  if (!requireOptionalNativeModule('ExpoWidgets')) {
    console.log('[bridge] iOS widget skipped (native module unavailable)');
    return null;
  }
  let createWidget: CreateWidget | undefined;
  try {
    // expo-widgets is iOS-only and only available in native dev/prod builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-widgets') as { createWidget?: CreateWidget } | undefined;
    createWidget = mod?.createWidget;
  } catch {
    // Module not compiled in (Expo Go / simulator) — skip silently
    console.log('[bridge] iOS widget skipped (expo-widgets unavailable in dev)');
    return null;
  }
  if (!createWidget) {
    console.log('[bridge] iOS widget skipped (expo-widgets unavailable in dev)');
    return null;
  }
  return createWidget;
}

// Bumped by clearWidgetData. updateWidgetData awaits AsyncStorage before its iOS write, so a
// call already in flight when the user signs out would otherwise put their data back.
let widgetWriteEpoch = 0;

// ─── FR1: updateWidgetData ────────────────────────────────────────────────────

/**
 * Primary update function — called by app after each data refresh.
 * - Builds WidgetData from app data sources
 * - Android: writes to AsyncStorage 'widget_data'
 * - iOS: stores layout + timeline entries in shared UserDefaults (App Group),
 *   then tells WidgetKit to reload the 'HourglassWidget' timeline.
 *
 * @param hoursData         - Weekly hours/earnings data from useHoursData hook (null if still loading)
 * @param aiData            - AI% and BrainLift data from useAIData hook (null if unavailable)
 * @param pendingCount      - Pending approval count (0 for contributors) — legacy param, derived internally now
 * @param config            - App configuration including isManager and useQA
 * @param approvalItems     - Manager's pending approval items (default [])
 * @param myRequests        - Contributor's manual time requests (default [])
 * @param prevWeekSnapshot  - Previous week's hours+earnings for delta computation (omitted on background path)
 */
export async function updateWidgetData(
  hoursData: HoursData | null,
  aiData: AIWeekData | null,
  pendingCount: number,
  config: CrossoverConfig,
  approvalItems?: ApprovalItem[],
  myRequests?: ManualRequestEntry[],
  prevWeekSnapshot?: { hours: number; earnings: number } | null,
): Promise<void> {
  const epoch = widgetWriteEpoch;
  const data = buildWidgetData(hoursData, aiData, pendingCount, config, approvalItems ?? [], myRequests ?? [], Date.now(), prevWeekSnapshot);

  // Android: write snapshot to AsyncStorage for task handler to read
  await AsyncStorage.setItem(WIDGET_DATA_KEY, JSON.stringify(data));

  // Signed out while the write above was pending: undo it and skip the iOS write.
  if (epoch !== widgetWriteEpoch) {
    try { await AsyncStorage.removeItem(WIDGET_DATA_KEY); } catch { /* best effort */ }
    return;
  }

  // iOS: store layout string + timeline entries in App Group UserDefaults,
  // then signal WidgetKit to reload.
  if (Platform.OS === 'ios') {
    const createWidget = loadCreateWidget();
    if (!createWidget) return;
    try {
      const widget = createWidget('HourglassWidget', WIDGET_LAYOUT_JS, buildSignedOutWidgetData(Date.now()));
      const entries = buildTimelineEntries(data, 96, 15, { extendToDeadline: true });
      widget.updateTimeline(entries);
      console.log('[bridge] widget timeline updated,', entries.length, 'entries, urgency:', data.urgency);
    } catch (err) {
      console.error('[bridge] iOS widget update failed:', err);
    }
  }
}

// ─── Sign-out: clearWidgetData ────────────────────────────────────────────────

/**
 * The empty snapshot the widget shows after sign-out: zero hours and earnings, no
 * deadline countdown, no daily bars, no approval items or request memos.
 * Same shape as buildWidgetData's no-hoursData branch, with no config input.
 */
export function buildSignedOutWidgetData(now: number = Date.now()): WidgetData {
  return {
    hours: '0.0',
    hoursDisplay: '0.0h',
    earnings: '$0',
    earningsRaw: 0,
    today: '0.0h',
    hoursRemaining: '',
    aiPct: 'N/A',
    brainlift: '0.0h',
    deadline: 0,
    urgency: 'none',
    pendingCount: 0,
    isManager: false,
    cachedAt: now,
    useQA: false,
    daily: [],
    approvalItems: [],
    myRequests: [],
    actionBg: '',
    paceBadge: 'none',
    weekDeltaHours: '',
    weekDeltaEarnings: '',
    brainliftTarget: '5h',
    todayDelta: '',
  };
}

/**
 * Called on sign-out. clearAll() removes the Android 'widget_data' key, but the iOS
 * timeline lives in App Group UserDefaults, outside AsyncStorage. Left alone it keeps
 * showing the signed-out user's hours and earnings, their request memos and, for
 * managers, direct reports' names and hours. This overwrites it with a single
 * signed-out entry. Never throws.
 */
export async function clearWidgetData(): Promise<void> {
  widgetWriteEpoch++;
  try { await AsyncStorage.removeItem(WIDGET_DATA_KEY); } catch { /* clearAll removes it too */ }

  if (Platform.OS !== 'ios') return;
  const createWidget = loadCreateWidget();
  if (!createWidget) return;
  try {
    const widget = createWidget('HourglassWidget', WIDGET_LAYOUT_JS, buildSignedOutWidgetData(Date.now()));
    const now = Date.now();
    widget.updateTimeline([{ date: new Date(now), props: buildSignedOutWidgetData(now) }]);
    console.log('[bridge] widget timeline cleared');
  } catch (err) {
    console.error('[bridge] iOS widget clear failed:', err);
  }
}
