// PayDaysCard.tsx — 1.2 WorkSmart dashboard parity: the home-screen pay-day card.
//
// Mirrors the WorkSmart dashboard's pay-day tiles (last paid, next pay day, this week's
// "so far") as a vertical list of rows inside one Card. The server picks and orders the
// cards; they render as they come. Formatting lives in src/lib/payDays.ts.
//
// Collapsible (1.2): with onToggle the header becomes a hide / show toggle with a chevron
// (CollapsibleSection) and, collapsed, the card is the label + one summary line of the NEXT
// pay day (else the first card). Without onToggle it renders as before.
//
// Design system: BRAND_GUIDELINES.md
//   - Gold = money: amounts, the NEXT tile band, the card's border accent (§1.4)
//   - Success = the PAID check badge and state line; critical = LATE
//   - NativeWind className tokens only; colors.gold is the one raw hex (Card's Skia border)
//   - Static: no entry animation; the toggle's press-only motion lives in CollapsibleSection

import React from 'react';
import { View, Text } from 'react-native';
import Card from './Card';
import SectionLabel from './SectionLabel';
import CollapsibleSection from './CollapsibleSection';
import { colors } from '@/src/lib/colors';
import type { PayDayCard, PayDays } from '@/src/lib/hoursOverview';
import {
  payDateTile,
  payDayAmount,
  payDayStateLine,
  payDaysSummary,
  payDaysToday,
  payDayTileTone,
  workWeekLabel,
  type PayDaysSummary,
  type PayDayTileTone,
  type PayDayTone,
} from '@/src/lib/payDays';

// ─── Style maps ───────────────────────────────────────────────────────────────

const STATE_TEXT: Record<PayDayTone, string> = {
  success:   'text-success',
  gold:      'text-gold',
  secondary: 'text-textSecondary',
  critical:  'text-critical',
  muted:     'text-textMuted',
};

const TILE_FRAME: Record<PayDayTileTone, string> = {
  paid:    'border-border',
  next:    'border-gold/40',
  neutral: 'border-border',
  late:    'border-critical/40',
  muted:   'border-border',
};

const TILE_BAND: Record<PayDayTileTone, string> = {
  paid:    'bg-textMuted/25',
  next:    'bg-gold',
  neutral: 'bg-surfaceElevated border-b border-border',
  late:    'bg-critical',
  muted:   'bg-textMuted/25',
};

const TILE_BAND_TEXT: Record<PayDayTileTone, string> = {
  paid:    'text-textSecondary',
  next:    'text-background',
  neutral: 'text-textSecondary',
  late:    'text-background',
  muted:   'text-textMuted',
};

const TILE_DAY_TEXT: Record<PayDayTileTone, string> = {
  paid:    'text-textSecondary',
  next:    'text-textPrimary',
  neutral: 'text-textPrimary',
  late:    'text-textPrimary',
  muted:   'text-textMuted',
};

// ─── Calendar tile ────────────────────────────────────────────────────────────

function CalendarTile({ payDate, state }: { payDate: string; state: string }): React.JSX.Element {
  const tile = payDateTile(payDate);
  const tone = payDayTileTone(state);
  return (
    <View className="w-[52px]">
      <View className={`rounded-xl overflow-hidden border bg-surface ${TILE_FRAME[tone]}`}>
        <View className={`items-center py-0.5 ${TILE_BAND[tone]}`}>
          <Text className={`text-[10px] font-sans-semibold tracking-widest ${TILE_BAND_TEXT[tone]}`}>
            {tile.month}
          </Text>
        </View>
        <View className="items-center pt-0.5 pb-1">
          <Text
            className={`font-display-semibold text-xl ${TILE_DAY_TEXT[tone]}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {tile.day}
          </Text>
          <Text className="text-[10px] font-sans-medium tracking-widest text-textMuted">
            {tile.weekday}
          </Text>
        </View>
      </View>
      {tone === 'paid' && (
        <View
          testID="pay-day-paid-check"
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-success border-2 border-surface items-center justify-center"
        >
          <Text className="text-background text-[8px] font-sans-bold">✓</Text>
        </View>
      )}
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function PayDayRow({
  card,
  today,
  first,
}: {
  card: PayDayCard;
  today: string;
  first: boolean;
}): React.JSX.Element {
  const state = payDayStateLine(card, today);
  const amount = payDayAmount(card);
  const week = workWeekLabel(card.weekStart, card.weekEnd);
  const tile = payDateTile(card.payDate);

  return (
    <View
      testID={`pay-day-row-${card.payDate}`}
      accessible
      accessibilityLabel={`${tile.month} ${tile.day}, ${state.text}, ${amount.label}, ${week}${card.thisWeek ? ', this week' : ''}`}
      className={first ? 'flex-row items-center gap-3' : 'flex-row items-center gap-3 mt-3 pt-3 border-t border-border'}
    >
      <CalendarTile payDate={card.payDate} state={card.state} />

      <View className="flex-1">
        <Text
          className={`text-xs font-sans-semibold uppercase tracking-widest ${STATE_TEXT[state.tone]}`}
          numberOfLines={1}
        >
          {state.text}
        </Text>

        <View className="flex-row flex-wrap items-baseline mt-0.5">
          {amount.prefix !== null && (
            <Text className="text-textSecondary text-sm font-sans mr-1">{amount.prefix}</Text>
          )}
          <Text
            className={`font-display-semibold text-xl ${amount.hasAmount ? 'text-gold' : 'text-textMuted'}`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {amount.value}
          </Text>
          {amount.suffix !== null && (
            <Text className="text-textSecondary text-sm font-sans ml-1">{amount.suffix}</Text>
          )}
          {amount.beforeTax && (
            <Text className="text-textMuted text-xs font-sans ml-1.5">before tax</Text>
          )}
        </View>

        <View className="flex-row items-center mt-0.5">
          <Text className="text-textMuted text-xs font-sans">{week}</Text>
          {card.thisWeek && (
            <View className="ml-2 rounded-full border border-border bg-surfaceElevated px-2 py-px">
              <Text className="text-textSecondary text-[10px] font-sans-medium">this week</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Collapsed summary ────────────────────────────────────────────────────────

/** "Next pay day · in 3 days · about $2,000.00", styled like a row's state + amount lines. */
function SummaryLine({ summary }: { summary: PayDaysSummary }): React.JSX.Element {
  const { amount } = summary;
  return (
    <Text testID="pay-days-summary" className="mt-3 font-sans-semibold text-sm" style={{ fontVariant: ['tabular-nums'] }}>
      <Text className={STATE_TEXT[summary.state.tone]}>{summary.stateText}</Text>
      {amount.hasAmount && (
        <>
          <Text className="text-textMuted">{' · '}</Text>
          {amount.prefix !== null && <Text className="text-textSecondary font-sans">{`${amount.prefix} `}</Text>}
          <Text className="text-gold">{amount.value}</Text>
          {amount.suffix !== null && <Text className="text-textSecondary font-sans">{` ${amount.suffix}`}</Text>}
          {amount.beforeTax && <Text className="text-textMuted font-sans text-xs">{' before tax'}</Text>}
        </>
      )}
    </Text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface PayDaysCardProps {
  payDays: PayDays;
  /** Fallback clock when the response has no server `today`. Default: new Date(). */
  now?: Date;
  /** Label + summary line only when true; read only with onToggle. Default false. */
  collapsed?: boolean;
  /** Makes the header a hide / show toggle. Without it the card is always expanded. */
  onToggle?: () => void;
  testID?: string;
}

export default function PayDaysCard({
  payDays,
  now,
  collapsed = false,
  onToggle,
  testID,
}: PayDaysCardProps): React.JSX.Element | null {
  const today = payDaysToday(payDays, now ?? new Date());
  // Null exactly when there are no cards
  const summary = payDaysSummary(payDays, today);
  if (summary === null) return null;

  const rows = payDays.cards.map((card, i) => (
    <PayDayRow key={`${card.weekStart}-${card.payDate}-${i}`} card={card} today={today} first={i === 0} />
  ));

  if (onToggle === undefined) {
    return (
      <Card borderAccentColor={colors.gold} testID={testID}>
        <SectionLabel className="mb-3">PAY DAYS</SectionLabel>
        {rows}
      </Card>
    );
  }

  return (
    <Card borderAccentColor={colors.gold} testID={testID}>
      <CollapsibleSection
        collapsed={collapsed}
        onToggle={onToggle}
        accessibilityLabel={`Pay days, ${summary.spoken}. ${collapsed ? 'Show details' : 'Hide details'}`}
        toggleTestID="pay-days-toggle"
        header={<SectionLabel>PAY DAYS</SectionLabel>}
        summary={<SummaryLine summary={summary} />}
      >
        <View className="mt-3">{rows}</View>
      </CollapsibleSection>
    </Card>
  );
}
