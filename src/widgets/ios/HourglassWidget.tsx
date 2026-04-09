// iOS Widget Component (expo-widgets, SDK 55)
// Built with @expo/ui/swift-ui — compiles to SwiftUI at build time.
// Supports three sizes: systemSmall, systemMedium, systemLarge.
//
// Data is pre-populated via HourglassWidget.updateTimeline() in bridge.ts.
// This file is compiled by the expo-widgets build plugin — never bundled
// into the main app JS bundle.
//
// 01-widget-visual-ios:
//   FR2: Glass cards for Medium/Large hero row
//   FR3: Gradient background (two Rectangle layers) for all sizes
//   FR4: Bar chart (IosBarChart) for Large size
//
// 01-ios-hud-layout:
//   FR1: getPriority helper — P1 (approvals), P2 (deficit), P3 (default)
//   FR2: SmallWidget hero font weight: 'bold', design: 'rounded'
//   FR3: MediumWidget priority-branched layouts
//   FR4: LargeWidget priority-branched layouts + bottom padding fix
//   FR5: Today row uses todayDelta with fallback to today
//
// 02-gauntlet-redesign: Synthesised from 7-model gauntlet run #002.
//   Premium dark glass aesthetic: GlassCard, StatusPill, SectionLabel, MetricView,
//   semantic border tints per card type. Structural constraints preserved for tests.

import type { WidgetData, WidgetDailyEntry } from '../types';

// SwiftUI component imports (expo-widgets JSX subset)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VStack, HStack, ZStack, Text, Spacer, Rectangle, RoundedRectangle, Circle, Capsule } = require('@expo/ui/swift-ui');

// ─── Urgency color mapping ────────────────────────────────────────────────────

const URGENCY_ACCENT: Record<string, string> = {
  none:     '#10B981',  // brand success emerald — matches app on-track state
  low:      '#F5C842',
  high:     '#F59E0B',  // brand warning amber
  critical: '#F43F5E',  // brand critical rose
  expired:  '#6B6B6B',
};

// FR3: gradient background tint colours (8-char hex = RRGGBBAA, ~12% opacity)
const URGENCY_TINTS: Record<string, string> = {
  none:     '#0D0C1433',
  low:      '#F5C84220',
  high:     '#F59E0B20',
  critical: '#F43F5E20',
  expired:  '#6B6B6B20',
};

// ─── Pace badge ───────────────────────────────────────────────────────────────

const PACE_LABELS: Record<string, string> = {
  crushed_it: 'CRUSHED IT',
  on_track:   'ON TRACK',
  behind:     'BEHIND PACE',
  critical:   'CRITICAL',
};

// ─── Design system constants ──────────────────────────────────────────────────

const COLORS = {
  bgDark:        '#0D0C14',   // exact app background
  surface:       '#16151FCC', // app surface at 80% opacity
  borderSubtle:  '#2F2E41',   // app border token
  textSecondary: '#A0A0A0',
  textMuted:     '#757575',
  gold:          '#E8C97A',   // earnings only
  cyan:          '#00C2FF',   // AI%
  violet:        '#A78BFA',   // BrainLift
  barPast:       '#10B981',   // success green — matches app bar chart past bars
  barFuture:     '#2F2E41',
};

// Bar chart height constant (60pt gives breathing room within widget frame)
const MAX_BAR_HEIGHT = 60;

// ─── FR1 (01-ios-hud-layout): Priority mode helper ───────────────────────────

export function getPriority(props: WidgetData): 'approvals' | 'deficit' | 'default' {
  if (props.isManager && props.pendingCount > 0) return 'approvals';
  if (props.paceBadge === 'critical' || props.paceBadge === 'behind') return 'deficit';
  return 'default';
}

// ─── Stale indicator ──────────────────────────────────────────────────────────

function isStale(cachedAt: number): boolean {
  return Date.now() - cachedAt > 2 * 60 * 60 * 1000;
}

function formatCachedTime(cachedAt: number): string {
  const d = new Date(cachedAt);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ─── Reusable UI components ───────────────────────────────────────────────────

// Atmospheric widget background: dark base + single top-center accent glow.
// Mirrors the main app header gradient — wide elliptical glow spreads across the top.
function WidgetBackground({ accent }: { accent: string }) {
  return (
    <ZStack>
      <Rectangle fill={COLORS.bgDark} />
      {/* Top-center header glow — mirrors main app header gradient */}
      <VStack>
        <Circle fill={accent} width={250} height={200} opacity={0.15} blur={60} />
        <Spacer />
      </VStack>
    </ZStack>
  );
}

// Premium glass card: translucent surface + etched specular edge
// Fill: 75% opacity (#1C1E26BF), stroke: 15% white (#FFFFFF26)
function IosGlassCard({ children }: { children: React.ReactNode }) {
  return (
    <ZStack>
      <RoundedRectangle fill={COLORS.surface} cornerRadius={16} />
      <RoundedRectangle cornerRadius={16} stroke={COLORS.borderSubtle} strokeWidth={1.5} />
      <VStack padding={14} alignment="leading">
        {children}
      </VStack>
    </ZStack>
  );
}

// Status pill: translucent fill + colored border + label
// Uses brand semantic colors directly (not routed through URGENCY_ACCENT).
function StatusPill({ paceBadge }: { paceBadge: string }) {
  const label = PACE_LABELS[paceBadge] ?? 'ON TRACK';
  const PACE_COLORS: Record<string, string> = {
    crushed_it: '#F5C842',  // gold/amber — exceeded target
    on_track:   '#10B981',  // brand success emerald
    behind:     '#F59E0B',  // brand warning amber
    critical:   '#F43F5E',  // brand critical rose
    none:       '#10B981',  // default — treat as on-track
  };
  const color = PACE_COLORS[paceBadge] ?? PACE_COLORS.none;

  return (
    <ZStack>
      <Capsule fill={color + '1A'} height={22} />
      <Capsule stroke={color} strokeWidth={0.5} height={22} />
      <Text font={{ size: 10, weight: 'bold' }} foregroundStyle={color} padding={{ leading: 10, trailing: 10 }}>
        {label}
      </Text>
    </ZStack>
  );
}

// Small-caps section label
function SectionLabel({ text }: { text: string }) {
  return (
    <Text font={{ size: 10, weight: 'semibold' }} foregroundStyle={COLORS.textSecondary}>
      {text.toUpperCase()}
    </Text>
  );
}

// Value + label pair stacked vertically
function MetricView({
  label,
  value,
  valueColor,
  size = 24,
}: {
  label: string;
  value: string;
  valueColor: string;
  size?: number;
}) {
  return (
    <VStack alignment="leading" spacing={2}>
      <SectionLabel text={label} />
      <Text font={{ size, weight: 'bold', design: 'rounded' }} foregroundStyle={valueColor}>
        {value}
      </Text>
    </VStack>
  );
}

// ─── FR4: Bar chart ───────────────────────────────────────────────────────────
// Exported for unit testing.

export function IosBarChart({ daily, accent }: { daily: WidgetDailyEntry[]; accent: string }) {
  const maxHours = Math.max(...daily.map((d) => d.hours), 0);

  return (
    <HStack spacing={4}>
      {daily.map((entry, i) => {
        const barHeight = maxHours > 0 ? (entry.hours / maxHours) * MAX_BAR_HEIGHT : 0;
        const barColor = entry.isToday
          ? accent
          : entry.isFuture || entry.hours === 0
            ? COLORS.barFuture
            : COLORS.barPast;

        return (
          <VStack spacing={2} key={entry.day + i}>
            <Spacer />
            <RoundedRectangle fill={barColor} cornerRadius={6} height={barHeight} />
            <Text font={{ size: 10 }} foregroundStyle={COLORS.textMuted}>
              {entry.day}
            </Text>
          </VStack>
        );
      })}
    </HStack>
  );
}

// ─── Small Widget ─────────────────────────────────────────────────────────────
// Shows: weekly hours (hero), pace badge, stale indicator.
// Does NOT render earnings or hoursRemaining (content triage for small size).
// 01-ios-hud-layout FR2: hero font weight: 'bold', design: 'rounded'

function SmallWidget({ props, renderingMode = 'fullColor' }: { props: WidgetData; renderingMode?: string }) {
  const accent = URGENCY_ACCENT[props.urgency] ?? URGENCY_ACCENT.none;

  return (
    <ZStack>
      {/* Atmospheric background: skip in accented/vibrant — system controls bg */}
      {renderingMode === 'fullColor' && <WidgetBackground accent={accent} />}

      <VStack padding={14} alignment="leading" spacing={6}>
        <SectionLabel text="THIS WEEK" />
        {/* 01-ios-widget-redesign FR5: weight 'bold', design 'rounded' */}
        <Text
          font={{ size: 32, weight: 'bold', design: 'rounded' }}
          foregroundStyle={accent}
        >
          {props.hoursDisplay}
        </Text>
        <Spacer />
        <StatusPill paceBadge={props.paceBadge} />
        {isStale(props.cachedAt) && (
          <Text font={{ size: 9 }} foregroundStyle="#FF9500">
            Cached {formatCachedTime(props.cachedAt)}
          </Text>
        )}
        {props.isManager && props.pendingCount > 0 && (
          <Text font={{ size: 11 }} foregroundStyle="#FF3B30">
            {props.pendingCount} pending
          </Text>
        )}
      </VStack>
    </ZStack>
  );
}

// ─── Medium Widget ────────────────────────────────────────────────────────────
// 01-ios-hud-layout FR3: priority-branched layouts (P1/P2/P3)

function MediumWidget({ props, renderingMode = 'fullColor' }: { props: WidgetData; renderingMode?: string }) {
  const accent   = URGENCY_ACCENT[props.urgency] ?? URGENCY_ACCENT.none;
  const priority = getPriority(props);

  return (
    <ZStack>
      {/* Atmospheric background: skip in accented/vibrant — system controls bg */}
      {renderingMode === 'fullColor' && <WidgetBackground accent={accent} />}

      <VStack padding={14} spacing={10}>

        {/* ── P1: Approvals layout ── */}
        {priority === 'approvals' && (
          <>
            <HStack>
              <Text font={{ size: 13, weight: 'semibold' }} foregroundStyle={URGENCY_ACCENT.high}>
                PENDING APPROVALS
              </Text>
              <Spacer />
              <ZStack>
                <RoundedRectangle fill={URGENCY_ACCENT.high + '25'} cornerRadius={10} />
                <Text font={{ size: 11, weight: 'bold' }} foregroundStyle={URGENCY_ACCENT.high} padding={6}>
                  {props.pendingCount} items
                </Text>
              </ZStack>
            </HStack>
            {props.approvalItems.slice(0, 2).map((item) => (
              <HStack key={item.id} spacing={6}>
                <ZStack>
                  <RoundedRectangle fill={COLORS.surface} cornerRadius={10} />
                  <HStack padding={10} spacing={6}>
                    <Text font={{ size: 12, weight: 'medium' }} foregroundStyle="#E0E0E0">
                      {item.name}
                    </Text>
                    <Spacer />
                    <Text font={{ size: 11, weight: 'semibold' }} foregroundStyle={COLORS.gold}>
                      {item.hours}
                    </Text>
                    <Text font={{ size: 10 }} foregroundStyle={COLORS.textSecondary}>
                      {item.category}
                    </Text>
                  </HStack>
                </ZStack>
              </HStack>
            ))}
            <HStack>
              <Text font={{ size: 12, weight: 'semibold' }} foregroundStyle={accent}>
                {props.hoursDisplay}
              </Text>
              <Spacer />
              <Text font={{ size: 12 }} foregroundStyle={COLORS.textSecondary}>
                {props.hoursRemaining}
              </Text>
            </HStack>
          </>
        )}

        {/* ── P2: Deficit layout — no earnings shown ── */}
        {priority === 'deficit' && (
          <>
            <HStack>
              <StatusPill paceBadge={props.paceBadge} />
              <Spacer />
              <Text font={{ size: 11, weight: 'medium' }} foregroundStyle={COLORS.textSecondary}>
                {props.hoursRemaining}
              </Text>
            </HStack>
            <Text font={{ size: 36, weight: 'bold', design: 'rounded' }} foregroundStyle={accent}>
              {props.hoursDisplay}
            </Text>
            <Spacer />
            <HStack>
              <Text font={{ size: 13, weight: 'semibold' }} foregroundStyle={accent}>
                Today: {props.todayDelta || props.today}
              </Text>
              <Spacer />
              <Text font={{ size: 13 }} foregroundStyle={COLORS.textSecondary}>
                {props.weekDeltaEarnings}
              </Text>
            </HStack>
          </>
        )}

        {/* ── P3: Default — two glass cards + footer ── */}
        {priority === 'default' && (
          <>
            <HStack spacing={10}>
              <IosGlassCard>
                <MetricView label="THIS WEEK" value={props.hoursDisplay} valueColor={accent} size={28} />
              </IosGlassCard>
              <IosGlassCard>
                <MetricView label="EARNINGS" value={props.earnings} valueColor={COLORS.gold} size={22} />
              </IosGlassCard>
            </HStack>
            <Spacer />
            {/* FR5: todayDelta with fallback to today */}
            <HStack>
              <Text font={{ size: 12, weight: 'semibold' }} foregroundStyle={accent}>
                Today: {props.todayDelta || props.today}
              </Text>
              <Spacer />
              <Text font={{ size: 12, weight: 'medium' }} foregroundStyle={COLORS.cyan}>
                AI: {props.aiPct}
              </Text>
            </HStack>
            {isStale(props.cachedAt) && (
              <Text font={{ size: 9 }} foregroundStyle="#FF9500">
                Cached {formatCachedTime(props.cachedAt)}
              </Text>
            )}
          </>
        )}

      </VStack>
    </ZStack>
  );
}

// ─── Large Widget ─────────────────────────────────────────────────────────────
// Priority-branched layouts (FR4 01-ios-hud-layout):
//   P1: approvals — manager view with up to 3 pending items
//   P2: deficit   — pace alert with hours hero
//   P3: default   — multi-card dashboard with bar chart
// Bottom padding = 28 for visual balance.

function LargeWidget({ props, renderingMode = 'fullColor' }: { props: WidgetData; renderingMode?: string }) {
  const accent   = URGENCY_ACCENT[props.urgency] ?? URGENCY_ACCENT.none;
  const priority = getPriority(props);

  return (
    <ZStack>
      {/* Atmospheric background: skip in accented/vibrant — system controls bg */}
      {renderingMode === 'fullColor' && <WidgetBackground accent={accent} />}

      {/* Uniform 16pt padding on all sides */}
      <VStack padding={16} spacing={12} alignment="leading">

        {/* ── P1: Approvals dashboard ── */}
        {priority === 'approvals' && (
          <>
            <HStack>
              <Text font={{ size: 14, weight: 'semibold' }} foregroundStyle={URGENCY_ACCENT.high}>
                PENDING APPROVALS
              </Text>
              <Spacer />
              <ZStack>
                <RoundedRectangle fill={URGENCY_ACCENT.high + '25'} cornerRadius={10} />
                <Text font={{ size: 12, weight: 'bold' }} foregroundStyle={URGENCY_ACCENT.high} padding={6}>
                  {props.pendingCount} items
                </Text>
              </ZStack>
            </HStack>
            {props.approvalItems.slice(0, 3).map((item) => (
              <HStack key={item.id} spacing={8}>
                <ZStack>
                  <RoundedRectangle fill={COLORS.surface} cornerRadius={12} />
                  <HStack padding={12} spacing={8}>
                    <Text font={{ size: 13, weight: 'medium' }} foregroundStyle="#E0E0E0">
                      {item.name}
                    </Text>
                    <Spacer />
                    <Text font={{ size: 12, weight: 'semibold' }} foregroundStyle={COLORS.gold}>
                      {item.hours}
                    </Text>
                    <Text font={{ size: 11 }} foregroundStyle={COLORS.textSecondary}>
                      {item.category}
                    </Text>
                  </HStack>
                </ZStack>
              </HStack>
            ))}
            <Spacer />
            <HStack>
              <Text font={{ size: 13, weight: 'semibold' }} foregroundStyle={accent}>
                {props.hoursDisplay}
              </Text>
              <Spacer />
              <Text font={{ size: 13 }} foregroundStyle={COLORS.textSecondary}>
                {props.hoursRemaining}
              </Text>
            </HStack>
          </>
        )}

        {/* ── P2: Deficit view — no bar chart ── */}
        {priority === 'deficit' && (
          <>
            <HStack>
              <StatusPill paceBadge={props.paceBadge} />
              <Spacer />
              <Text font={{ size: 12 }} foregroundStyle={COLORS.textSecondary}>
                {props.hoursRemaining}
              </Text>
            </HStack>
            <Text font={{ size: 48, weight: 'bold', design: 'rounded' }} foregroundStyle={accent}>
              {props.hoursDisplay}
            </Text>
            <Spacer />
            <HStack spacing={10}>
              <IosGlassCard>
                <MetricView label="EARNINGS" value={props.earnings} valueColor={COLORS.gold} size={20} />
              </IosGlassCard>
              <IosGlassCard>
                <MetricView label="AI" value={props.aiPct} valueColor={COLORS.cyan} size={16} />
              </IosGlassCard>
              <IosGlassCard>
                <MetricView label="BRAINLIFT" value={props.brainlift} valueColor={COLORS.violet} size={16} />
              </IosGlassCard>
            </HStack>
            <HStack>
              <Text font={{ size: 13, weight: 'semibold' }} foregroundStyle={accent}>
                Today: {props.todayDelta || props.today}
              </Text>
              <Spacer />
              <Text font={{ size: 13 }} foregroundStyle={COLORS.textSecondary}>
                {props.weekDeltaEarnings}
              </Text>
            </HStack>
          </>
        )}

        {/* ── P3: Default — full dashboard ── */}
        {priority === 'default' && (
          <>
            {/* Hero row: Hours card (with remaining) + Earnings card */}
            <HStack spacing={10}>
              <IosGlassCard>
                <Text font={{ size: 32, weight: 'bold', design: 'rounded' }} foregroundStyle={accent}>
                  {props.hoursDisplay}
                </Text>
                <Text font={{ size: 11, weight: 'medium' }} foregroundStyle="#94A3B8">
                  {props.hoursRemaining.replace('left', '').trim()} remaining
                </Text>
              </IosGlassCard>
              <IosGlassCard>
                <Text font={{ size: 24, weight: 'bold' }} foregroundStyle={COLORS.gold}>
                  {props.earnings}
                </Text>
                <Text font={{ size: 11, weight: 'medium' }} foregroundStyle={COLORS.textSecondary}>
                  EARNED
                </Text>
              </IosGlassCard>
            </HStack>

            {/* StatusPill row */}
            <HStack>
              <StatusPill paceBadge={props.paceBadge} />
              <Spacer />
            </HStack>

            {/* Activity chart section */}
            <VStack alignment="leading" spacing={4}>
              <Text font={{ size: 11, weight: 'bold' }} foregroundStyle="#64748B">
                ACTIVITY
              </Text>
              <IosBarChart daily={props.daily} accent={accent} />
            </VStack>

            <Spacer />

            {/* Footer */}
            <HStack>
              <Text font={{ size: 11 }} foregroundStyle={COLORS.textMuted}>
                Today: {props.todayDelta || props.today} {'\u2022'} AI: {props.aiPct}
              </Text>
              <Spacer />
              {isStale(props.cachedAt) && (
                <Text font={{ size: 9 }} foregroundStyle="#FF9500">
                  Cached {formatCachedTime(props.cachedAt)}
                </Text>
              )}
            </HStack>
          </>
        )}

      </VStack>
    </ZStack>
  );
}

// ─── Main widget entry ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createWidget } = require('expo-widgets');

const HourglassWidget = createWidget('HourglassWidget', (props: WidgetData & { widgetFamily?: string; widgetRenderingMode?: string }) => {
  'widget';

  const family = props.widgetFamily ?? 'systemMedium';
  const renderingMode = props.widgetRenderingMode ?? 'fullColor';

  if (family === 'systemSmall') {
    return <SmallWidget props={props} renderingMode={renderingMode} />;
  }

  if (family === 'systemLarge') {
    return <LargeWidget props={props} renderingMode={renderingMode} />;
  }

  return <MediumWidget props={props} renderingMode={renderingMode} />;
});

export default HourglassWidget;

// Named exports for unit testing — allows tests to render sub-components directly
// without going through the expo-widgets createWidget/default export path.
export { SmallWidget, MediumWidget, LargeWidget, WidgetBackground };
