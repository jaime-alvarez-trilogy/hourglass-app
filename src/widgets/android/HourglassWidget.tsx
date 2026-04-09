// FR1–FR7: Android Widget Component (react-native-android-widget) — 03-android-visual
// Brand redesign: SVG mesh background, glass panel cards, pace badge,
// trend deltas, BrainLift progress bar, manager urgency mode.
//
// Data is read from AsyncStorage 'widget_data' by the task handler
// and passed here as props for rendering.

import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import type { WidgetData, WidgetUrgency } from '../types';

// ─── FR1: Helper functions (exported for unit testing) ────────────────────────

/**
 * Builds the SVG mesh background string (360×200).
 * Three radial gradient ellipses simulate the orbital mesh.
 * Node C color is driven by urgency/paceBadge state.
 */
export function buildMeshSvg(urgency: WidgetUrgency, paceBadge: string): string {
  const stateColor = meshStateColor(urgency, paceBadge);
  return (
    `<svg width="360" height="200" xmlns="http://www.w3.org/2000/svg">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#0D0C14" stop-opacity="1"/>` +
    `<stop offset="50%" stop-color="${stateColor}" stop-opacity="0.15"/>` +
    `<stop offset="100%" stop-color="#0D0C14" stop-opacity="1"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect width="100%" height="100%" fill="url(#bg)"/>` +
    `</svg>`
  );
}

function meshStateColor(urgency: WidgetUrgency, paceBadge: string): string {
  if (urgency === 'critical' || paceBadge === 'critical') return '#F43F5E';
  if (urgency === 'high' || paceBadge === 'behind') return '#F59E0B';
  if (paceBadge === 'crushed_it') return '#FFDF89';
  if (paceBadge === 'on_track') return '#10B981';
  return '#A78BFA'; // idle/none — default violet
}

/**
 * Returns the background hex color for a pace badge capsule.
 * Returns '' for 'none' (no badge should render).
 */
// 02-android-widget-redesign: brand semantic palette (gold, success, warning, critical)
export function badgeColor(paceBadge: string): string {
  switch (paceBadge) {
    case 'crushed_it': return '#F5C842';
    case 'on_track':   return '#10B981';
    case 'behind':     return '#F59E0B';
    case 'critical':   return '#F43F5E';
    default:           return '';
  }
}

/**
 * Returns the display label for a pace badge.
 * Returns '' for 'none' (no badge should render).
 */
export function badgeLabel(paceBadge: string): string {
  switch (paceBadge) {
    case 'crushed_it': return 'CRUSHED IT';
    case 'on_track':   return 'ON TRACK';
    case 'behind':     return 'BEHIND PACE';
    case 'critical':   return 'CRITICAL';
    default:           return '';
  }
}

/**
 * Returns the text color for a delta string.
 * '+...' → success green, '-...' → warning amber, empty/missing → transparent.
 */
export function deltaColor(delta: string | undefined): string {
  if (!delta) return 'transparent';
  if (delta.startsWith('+')) return '#10B981';
  if (delta.startsWith('-')) return '#F59E0B';
  return 'transparent';
}

/**
 * Generates an inline SVG string for the BrainLift progress bar.
 * Track: #2F2E41, fill: #A78BFA (violet), height 6px, rx 3.
 * Fill width is capped at 100%. NaN brainliftHours treated as 0.
 */
export function blProgressBar(brainliftHours: number, targetHours: number, width: number): string {
  const safeHours = isNaN(brainliftHours) ? 0 : brainliftHours;
  const fillWidth = Math.round(Math.min(safeHours / targetHours, 1) * width);
  return (
    `<svg width="${width}" height="8" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${width}" height="8" rx="4" fill="#2F2E41"/>` +
    `<rect width="${fillWidth}" height="8" rx="4" fill="#A78BFA"/>` +
    `</svg>`
  );
}

/**
 * Generates an inline SVG string for the 7-bar weekly hours sparkline.
 * 7 bars (Mon[0]–Sun[6]) + 3-char day labels below.
 * Bar colours: accentColor (isToday), '#4A4A6A' (past with hours), '#2F2E41' (zero/future).
 * Minimum bar height: 2px (shows floor reference even for empty/future bars).
 * Total SVG height: barAreaHeight + 12 (bar area + label area).
 */
export function buildBarChartSvg(
  daily: import('../types').WidgetDailyEntry[],
  width: number,
  barAreaHeight: number,
  accentColor: string,
): string {
  const colW = width / 7;
  const barW = Math.round(colW * 0.6);
  const maxHours = Math.max(...daily.map(d => d.hours), 0.01);
  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const bars = daily.map((d, i) => {
    const x = Math.round(i * colW + colW * 0.2);
    const barH = Math.max(Math.round(d.hours / maxHours * barAreaHeight), 2);
    const y = barAreaHeight - barH;
    const color = d.isToday
      ? accentColor
      : (d.isFuture || d.hours === 0)
        ? '#2F2E41'
        : '#4A4A6A';
    const labelX = Math.round(i * colW + colW / 2);
    return (
      `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="${color}"/>` +
      `<text x="${labelX}" y="${barAreaHeight + 10}" text-anchor="middle" font-size="9" fill="#777777">${DAY_LABELS[i]}</text>`
    );
  }).join('');

  return `<svg width="${width}" height="${barAreaHeight + 12}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

// ─── Urgency color mapping (for text accents) ─────────────────────────────────

const URGENCY_ACCENT: Record<string, string> = {
  none:     '#00FF88',
  low:      '#F5C842',
  high:     '#F59E0B',
  critical: '#F43F5E',
  expired:  '#6B6B6B',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > 2 * 60 * 60 * 1000;
}

function formatCachedTime(cachedAt: number): string {
  const d = new Date(cachedAt);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatCountdown(deadline: number): string {
  const hoursLeft = Math.max(0, Math.floor((deadline - Date.now()) / 3600000));
  return hoursLeft > 0 ? `${hoursLeft}h left` : 'Due now';
}

function formatDelta(delta: string | undefined): string {
  if (!delta) return '';
  if (delta.startsWith('+')) return `↑ ${delta.slice(1)}`;
  if (delta.startsWith('-')) return `↓ ${delta.slice(1)}`;
  return '';
}

// ─── FR3: Glass panel border trick ────────────────────────────────────────────

interface GlassPanelProps {
  flex?: number;
  children: React.ReactNode;
}

function GlassPanel({ flex, children }: GlassPanelProps) {
  return (
    <FlexWidget
      style={{
        backgroundColor: '#1C1E26',
        borderRadius: 16,
        padding: 1,
        ...(flex !== undefined ? { flex } : {}),
      }}
    >
      <FlexWidget
        style={{
          backgroundColor: '#16151F',
          borderRadius: 15,
          padding: 12,
        }}
      >
        {children}
      </FlexWidget>
    </FlexWidget>
  );
}

// ─── FR4: Pace badge ──────────────────────────────────────────────────────────

interface PaceBadgeProps {
  paceBadge: string | undefined;
}

function PaceBadge({ paceBadge }: PaceBadgeProps) {
  if (!paceBadge || paceBadge === 'none') return null;
  const bg = badgeColor(paceBadge);
  const label = badgeLabel(paceBadge);
  if (!bg || !label) return null;

  return (
    <FlexWidget
      style={{
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <TextWidget
        text={label}
        style={{ color: '#0D0C14', fontSize: 11, fontWeight: 'bold' }}
      />
    </FlexWidget>
  );
}

// ─── Fallback widget ───────────────────────────────────────────────────────────

export function FallbackWidget() {
  return (
    <FlexWidget
      style={{
        backgroundColor: '#0D0C14',
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <TextWidget
        text="Hourglass"
        style={{ color: '#E0E0E0', fontSize: 16, fontWeight: 'bold' }}
      />
      <TextWidget
        text="Tap to refresh"
        style={{ color: '#A0A0A0', fontSize: 12 }}
      />
    </FlexWidget>
  );
}

// ─── FR2 + FR3 + FR4 + FR5: Small widget ──────────────────────────────────────

function SmallWidget({ data }: { data: WidgetData }) {
  const accent = URGENCY_ACCENT[data.urgency] ?? URGENCY_ACCENT.none;
  const stale = isStale(data.cachedAt);
  const meshSvg = buildMeshSvg(data.urgency, data.paceBadge ?? 'none');

  return (
    <FlexWidget
      style={{
        backgroundColor: '#0B0D13',
        flex: 1,
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* FR2: SVG mesh background */}
      <SvgWidget
        svg={meshSvg}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* FR3: Glass panel wrapping all content */}
      <GlassPanel flex={1}>
        {/* Hours total */}
        <TextWidget
          text={data.hoursDisplay}
          style={{ color: accent, fontSize: 28, fontWeight: 'bold' }}
        />

        {/* FR4: Pace badge */}
        <PaceBadge paceBadge={data.paceBadge} />

        {/* Stale indicator */}
        {stale && (
          <TextWidget
            text={`Cached: ${formatCachedTime(data.cachedAt)}`}
            style={{ color: '#FF9500', fontSize: 10 }}
          />
        )}

        {/* Manager pending badge */}
        {data.isManager && data.pendingCount > 0 && (
          <TextWidget
            text={`${data.pendingCount} pending`}
            style={{ color: '#FF3B30', fontSize: 11 }}
          />
        )}
      </GlassPanel>
    </FlexWidget>
  );
}

// ─── FR1 (02-android-hud-layout): getPriority helper ─────────────────────────

/**
 * Returns the priority mode for MediumWidget rendering.
 * P1 (approvals): manager with any pending items to act on.
 * P2 (deficit):   behind or critical pace (no pending items).
 * P3 (default):   everything else — full hours mode.
 */
export function getPriority(data: Pick<WidgetData, 'isManager' | 'pendingCount' | 'paceBadge'>): 'approvals' | 'deficit' | 'default' {
  if (data.isManager && data.pendingCount > 0) return 'approvals';
  if (data.paceBadge === 'behind' || data.paceBadge === 'critical') return 'deficit';
  return 'default';
}

// ─── Action mode badge colors ──────────────────────────────────────────────────

const BADGE_COLORS: Record<string, string> = {
  MANUAL:   '#00C2FF',
  OVERTIME: '#A78BFA',
  PENDING:  '#F59E0B',
  APPROVED: '#10B981',
  REJECTED: '#F43F5E',
};

// ─── FR2 + FR3 + FR4 + FR5 + FR6 + FR7: Medium widget ────────────────────────

function MediumWidget({ data }: { data: WidgetData }) {
  const accent = URGENCY_ACCENT[data.urgency] ?? URGENCY_ACCENT.none;
  const stale = isStale(data.cachedAt);
  const meshSvg = buildMeshSvg(data.urgency, data.paceBadge ?? 'none');

  // 02-android-hud-layout: unified three-priority model
  const priority = getPriority(data);

  // FR6: BrainLift progress bar data
  const brainliftHours = parseFloat(data.brainlift) || 0;
  const targetHours = parseFloat(data.brainliftTarget ?? '5h') || 5;

  // FR5: Delta display helpers
  const hoursDelta = data.weekDeltaHours ?? '';
  const earningsDelta = data.weekDeltaEarnings ?? '';
  const hoursDeltaText = formatDelta(hoursDelta);
  const earningsDeltaText = formatDelta(earningsDelta);

  // ─── P1: Approvals layout (manager with pending items) ──────────────────────
  if (priority === 'approvals') {
    const approvalItems = (data.approvalItems ?? []).slice(0, 2);
    const actionBg = data.actionBg || '#1C1400';

    return (
      <FlexWidget
        style={{
          backgroundColor: actionBg,
          flex: 1,
          flexDirection: 'column',
          position: 'relative',
          padding: 12,
        }}
      >
        {/* SVG mesh background */}
        <SvgWidget
          svg={meshSvg}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />

        {/* Header: pending count */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <TextWidget
            text={`⚠ ${data.pendingCount} PENDING`}
            style={{ color: accent, fontSize: 15, fontWeight: '700', flex: 1 }}
          />
        </FlexWidget>

        <TextWidget text="" style={{ height: 4 }} />

        {/* Approval item rows (up to 2) */}
        {approvalItems.map((item) => {
          const badgeKey = item.category ?? '';
          const badgeClr = BADGE_COLORS[badgeKey] ?? '#A0A0A0';
          return (
            <FlexWidget
              key={item.id}
              style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}
            >
              <TextWidget
                text={item.name}
                style={{ color: '#E0E0E0', fontSize: 12, flex: 1 }}
              />
              <TextWidget
                text={item.hours}
                style={{ color: accent, fontSize: 12, fontWeight: '600' }}
              />
              <TextWidget text=" " style={{ fontSize: 12 }} />
              <TextWidget
                text={badgeKey}
                style={{ color: badgeClr, fontSize: 11 }}
              />
            </FlexWidget>
          );
        })}

        {/* Footer: today hours + deadline */}
        <FlexWidget style={{ flex: 1 }} />
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <TextWidget
            text={`Today: ${data.todayDelta || data.today}`}
            style={{ color: '#A0A0A0', fontSize: 12 }}
          />
          <TextWidget
            text={formatCountdown(data.deadline)}
            style={{ color: accent, fontSize: 12, fontWeight: '600' }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  // ─── P2: Deficit layout (behind/critical pace, no pending approvals) ─────────
  if (priority === 'deficit') {
    const hoursColor = accent;
    return (
      <FlexWidget
        style={{
          backgroundColor: '#0B0D13',
          flex: 1,
          flexDirection: 'column',
          position: 'relative',
          padding: 12,
        }}
      >
        <SvgWidget
          svg={meshSvg}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        {/* Warning badge row */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <TextWidget
            text={`⚠ ${badgeLabel(data.paceBadge ?? '')}`}
            style={{ color: badgeColor(data.paceBadge ?? ''), fontSize: 11, fontWeight: '600' }}
          />
        </FlexWidget>
        {/* Hero hours */}
        <TextWidget
          text={data.hoursDisplay}
          style={{ color: hoursColor, fontSize: 32, fontWeight: '700' }}
        />
        {/* Hours remaining */}
        <TextWidget
          text={data.hoursRemaining}
          style={{ color: '#A0A0A0', fontSize: 13 }}
        />
        {/* Flex spacer */}
        <FlexWidget style={{ flex: 1 }} />
        {/* Footer */}
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <TextWidget
            text={data.weekDeltaEarnings || ''}
            style={{ color: deltaColor(data.weekDeltaEarnings), fontSize: 12 }}
          />
          <TextWidget
            text={`today ${data.todayDelta || data.today}`}
            style={{ color: '#A0A0A0', fontSize: 12 }}
          />
        </FlexWidget>
      </FlexWidget>
    );
  }

  // ─── P3: Hours mode (default — full display) ─────────────────────────────────
  return (
    <FlexWidget
      style={{
        backgroundColor: '#0B0D13',
        flex: 1,
        flexDirection: 'column',
        position: 'relative',
        padding: 12,
      }}
    >
      {/* FR2: SVG mesh background */}
      <SvgWidget
        svg={meshSvg}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Top row: FR3 glass hero panels */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {/* Hours glass panel */}
        <GlassPanel flex={1}>
          <TextWidget
            text={data.hoursDisplay}
            style={{ color: accent, fontSize: 32, fontWeight: '700' }}
          />
          <TextWidget
            text="this week"
            style={{ color: '#A0A0A0', fontSize: 12 }}
          />
          {/* FR5: hours delta */}
          {hoursDeltaText.length > 0 && (
            <TextWidget
              text={hoursDeltaText}
              style={{ color: deltaColor(hoursDelta), fontSize: 11 }}
            />
          )}
        </GlassPanel>

        <TextWidget text="" style={{ width: 8 }} />

        {/* Earnings glass panel */}
        <GlassPanel flex={1}>
          <TextWidget
            text={data.earnings}
            style={{ color: '#E8C97A', fontSize: 22, fontWeight: '700' }}
          />
          <TextWidget
            text="earned"
            style={{ color: '#A0A0A0', fontSize: 12 }}
          />
          {/* FR5: earnings delta */}
          {earningsDeltaText.length > 0 && (
            <TextWidget
              text={earningsDeltaText}
              style={{ color: deltaColor(earningsDelta), fontSize: 11 }}
            />
          )}
        </GlassPanel>
      </FlexWidget>

      <TextWidget text="" style={{ height: 8 }} />

      {/* FR4: Pace badge */}
      <PaceBadge paceBadge={data.paceBadge} />

      <TextWidget text="" style={{ height: 6 }} />

      {/* Stats row: Today + AI Usage% */}
      <FlexWidget style={{ flexDirection: 'row' }}>
        <TextWidget
          text={`Today: ${data.todayDelta || data.today}`}
          style={{ color: '#E0E0E0', fontSize: 13 }}
        />
        <TextWidget text="" style={{ flex: 1 }} />
        <TextWidget
          text={`AI Usage: ${data.aiPct}`}
          style={{ color: '#00C2FF', fontSize: 13 }}
        />
      </FlexWidget>

      {/* Hours remaining */}
      <TextWidget
        text={data.hoursRemaining}
        style={{ color: '#A0A0A0', fontSize: 12 }}
      />

      {/* FR6: BrainLift progress bar */}
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget
          text="BrainLift"
          style={{ color: '#A78BFA', fontSize: 11 }}
        />
        <SvgWidget
          svg={blProgressBar(brainliftHours, targetHours, 120)}
          style={{ width: 120, height: 8 }}
        />
        <TextWidget
          text={` ${data.brainlift} / ${data.brainliftTarget ?? '5h'}`}
          style={{ color: '#A78BFA', fontSize: 11 }}
        />
      </FlexWidget>

      {/* FR3 (02-widget-visual-android): Daily bar chart */}
      <SvgWidget
        svg={buildBarChartSvg(data.daily, 280, 28, accent)}
        style={{ width: 280, height: 40 }}
      />

      {/* Stale indicator */}
      {stale && (
        <TextWidget
          text={`Cached: ${formatCachedTime(data.cachedAt)}`}
          style={{ color: '#FF9500', fontSize: 10 }}
        />
      )}
    </FlexWidget>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────

interface HourglassWidgetProps {
  data: WidgetData | null;
  widgetFamily?: 'small' | 'medium';
}

export function HourglassWidget({ data, widgetFamily = 'medium' }: HourglassWidgetProps) {
  if (!data) {
    return <FallbackWidget />;
  }

  if (widgetFamily === 'small') {
    return <SmallWidget data={data} />;
  }

  return <MediumWidget data={data} />;
}

export default HourglassWidget;
