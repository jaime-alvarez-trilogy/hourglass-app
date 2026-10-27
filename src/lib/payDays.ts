// payDays.ts — 1.2 WorkSmart dashboard parity: pure formatting for the home-screen pay-day
// card (src/components/PayDaysCard.tsx), mirroring the WorkSmart dashboard's pay-day tiles.
//
// Pay dates and work weeks are server UTC calendar dates (YYYY-MM-DD). Every date here is
// handled as a date-only UTC value: a local Date built from them would shift by a day for
// users west of UTC, so nothing below constructs one.
//
// Pure module: imports only from ./hoursOverview.

import { utcToday, type PayDayCard, type PayDays } from './hoursOverview';

/** Text colour role of a state line; the component maps it to a NativeWind token. */
export type PayDayTone = 'success' | 'gold' | 'secondary' | 'critical' | 'muted';

/** Colour scheme of the calendar tile's month band. */
export type PayDayTileTone = 'paid' | 'next' | 'neutral' | 'late' | 'muted';

export interface PayDayStateLine {
  text: string;
  tone: PayDayTone;
}

export interface PayDayAmount {
  /** "about" for an ESTIMATE, else null */
  prefix: string | null;
  /** "$2,000.00", or "—" when there is no amount */
  value: string;
  /** "so far" for a SO_FAR amount, else null */
  suffix: string | null;
  /** True for Paychex payouts, which the dashboard shows before tax */
  beforeTax: boolean;
  hasAmount: boolean;
  /** The whole line as one string, for accessibility labels */
  label: string;
}

export interface PayDayTile {
  /** "OCT" */
  month: string;
  /** "21" */
  day: string;
  /** "WED" */
  weekday: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_MS = 86_400_000;

const NO_PAY_REASONS: Record<string, string> = {
  NO_HOURS: 'no hours',
  NO_HOURS_YET: 'no hours yet',
};

function utcMs(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcDate(date: string): Date {
  return new Date(utcMs(date));
}

function humanize(raw: string): string {
  const words = raw.replace(/_+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The reference "today" for pay-day countdowns: the server's UTC date when the response
 * carried one, else the UTC date of `now`.
 */
export function payDaysToday(payDays: Pick<PayDays, 'today'>, now: Date = new Date()): string {
  return payDays.today ?? utcToday(now);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/** "TODAY", "TOMORROW", "YESTERDAY", "IN 3 DAYS" or "4 DAYS AGO" for a day offset. */
export function relativeDayWord(diff: number): string {
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  if (diff === -1) return 'YESTERDAY';
  return diff > 0 ? `IN ${diff} DAYS` : `${-diff} DAYS AGO`;
}

/**
 * The tile's state line ("PAID · 4 DAYS AGO", "NEXT PAY DAY · IN 3 DAYS", "IN 10 DAYS",
 * "LATE", "NO PAY · no hours") and its colour role, counted from `today` (YYYY-MM-DD).
 * Unknown states read as the humanised raw state.
 */
export function payDayStateLine(
  card: Pick<PayDayCard, 'state' | 'payDate' | 'noPayReason'>,
  today: string,
): PayDayStateLine {
  const when = relativeDayWord(daysBetween(today, card.payDate));
  switch (card.state.toUpperCase()) {
    case 'PAID':
      return { text: `PAID · ${when}`, tone: 'success' };
    case 'NEXT':
      return { text: `NEXT PAY DAY · ${when}`, tone: 'gold' };
    case 'LATER':
      return { text: when, tone: 'secondary' };
    case 'LATE':
      return { text: 'LATE', tone: 'critical' };
    case 'NO_PAY': {
      const code = card.noPayReason?.toUpperCase() ?? null;
      const reason = code ? (NO_PAY_REASONS[code] ?? humanize(code).toLowerCase()) : null;
      return { text: reason ? `NO PAY · ${reason}` : 'NO PAY', tone: 'muted' };
    }
    default:
      return { text: humanize(card.state), tone: 'secondary' };
  }
}

/** US-dollar amount with cents and thousands separators: "$2,000.00", "-$12.50". */
export function formatPayAmount(amount: number): string {
  const [whole, cents] = Math.abs(amount).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}$${grouped}.${cents}`;
}

/**
 * The amount line of a card, split for styling: ESTIMATE → "about $X", SO_FAR → "$X so far",
 * FINAL → "$X"; a NONE kind or a null amount → "—". Paychex amounts are flagged before tax.
 */
export function payDayAmount(
  card: Pick<PayDayCard, 'amount' | 'amountKind' | 'platform'>,
): PayDayAmount {
  const kind = card.amountKind.toUpperCase();
  if (card.amount === null || kind === 'NONE') {
    return { prefix: null, value: '—', suffix: null, beforeTax: false, hasAmount: false, label: '—' };
  }
  const prefix = kind === 'ESTIMATE' ? 'about' : null;
  const suffix = kind === 'SO_FAR' ? 'so far' : null;
  const beforeTax = card.platform?.toUpperCase() === 'PAYCHEX';
  const value = formatPayAmount(card.amount);
  const label = [prefix, value, suffix, beforeTax ? 'before tax' : null]
    .filter((s): s is string => s !== null)
    .join(' ');
  return { prefix, value, suffix, beforeTax, hasAmount: true, label };
}

/** "for work 5 – 11 Oct", or "for work 28 Sep – 4 Oct" when the week spans two months. */
export function workWeekLabel(weekStart: string, weekEnd: string): string {
  const s = utcDate(weekStart);
  const e = utcDate(weekEnd);
  const end = `${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]}`;
  if (s.getTime() === e.getTime()) return `for work ${end}`;
  const sameMonth =
    s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const start = sameMonth ? `${s.getUTCDate()}` : `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]}`;
  return `for work ${start} – ${end}`;
}

/** Calendar-tile parts of a pay date: { month: "OCT", day: "21", weekday: "WED" }. */
export function payDateTile(payDate: string): PayDayTile {
  const d = utcDate(payDate);
  return {
    month: MONTHS[d.getUTCMonth()].toUpperCase(),
    day: String(d.getUTCDate()),
    weekday: WEEKDAYS[d.getUTCDay()],
  };
}

/** Month-band scheme of the tile: PAID / NEXT / LATE / NO_PAY, anything else neutral. */
export function payDayTileTone(state: string): PayDayTileTone {
  switch (state.toUpperCase()) {
    case 'PAID':
      return 'paid';
    case 'NEXT':
      return 'next';
    case 'LATE':
      return 'late';
    case 'NO_PAY':
      return 'muted';
    default:
      return 'neutral';
  }
}

/** One-line summary of the pay-day cards, for the collapsed card. */
export interface PayDaysSummary {
  /** The card summarised */
  card: PayDayCard;
  state: PayDayStateLine;
  amount: PayDayAmount;
  /** "Next pay day · in 3 days" — the state line in sentence case */
  stateText: string;
  /** stateText + " · " + the amount when there is one: "Next pay day · in 3 days · about $2,000.00" */
  text: string;
  /** For the toggle's accessibility label: "next pay day, in 3 days, about $2,000.00" */
  spoken: string;
}

function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Summary of the NEXT pay day (the first NEXT card), else of the first card; null with no
 * cards. Counted from `today` (YYYY-MM-DD), like payDayStateLine.
 */
export function payDaysSummary(payDays: Pick<PayDays, 'cards'>, today: string): PayDaysSummary | null {
  const card = payDays.cards.find((c) => c.state.toUpperCase() === 'NEXT') ?? payDays.cards[0];
  if (!card) return null;
  const state = payDayStateLine(card, today);
  const amount = payDayAmount(card);
  const stateText = sentenceCase(state.text);
  const parts = amount.hasAmount ? [stateText, amount.label] : [stateText];
  return {
    card,
    state,
    amount,
    stateText,
    text: parts.join(' · '),
    spoken: parts.join(' · ').toLowerCase().replace(/ · /g, ', '),
  };
}
