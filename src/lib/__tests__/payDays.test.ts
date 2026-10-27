// Tests: payDays — 1.2 WorkSmart dashboard parity, pay-day card formatting
// File: src/lib/payDays.ts

import {
  daysBetween,
  formatPayAmount,
  payDateTile,
  payDayAmount,
  payDaysSummary,
  payDaysToday,
  payDayStateLine,
  payDayTileTone,
  relativeDayWord,
  workWeekLabel,
} from '../payDays';
import { normalizePayDays } from '../hoursOverview';
import { PAY_DAYS_RAW } from '../../__fixtures__/hoursOverview';

const TODAY = '2026-10-25';

function stateCard(state: string, payDate: string, noPayReason: string | null = null) {
  return { state, payDate, noPayReason };
}

// ─── Day arithmetic ───────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('counts calendar days forward and backward', () => {
    expect(daysBetween(TODAY, '2026-10-28')).toBe(3);
    expect(daysBetween(TODAY, '2026-10-21')).toBe(-4);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-10-25', '2026-11-04')).toBe(10);
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('is not skewed by a DST change (UTC arithmetic)', () => {
    // US DST ends 2026-11-01; Europe 2026-10-25
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('payDaysToday', () => {
  it('prefers the server date', () => {
    expect(payDaysToday({ today: '2026-10-25' }, new Date('2026-10-27T10:00:00Z'))).toBe('2026-10-25');
  });

  it('falls back to the UTC date of now', () => {
    // 23:30 on the 24th in UTC-7 is already the 25th in UTC
    expect(payDaysToday({ today: null }, new Date('2026-10-25T06:30:00Z'))).toBe('2026-10-25');
    expect(payDaysToday({ today: null }, new Date('2026-10-24T23:59:00Z'))).toBe('2026-10-24');
  });
});

describe('relativeDayWord', () => {
  it('uses words for 0 and ±1', () => {
    expect(relativeDayWord(0)).toBe('TODAY');
    expect(relativeDayWord(1)).toBe('TOMORROW');
    expect(relativeDayWord(-1)).toBe('YESTERDAY');
  });

  it('counts the rest in days', () => {
    expect(relativeDayWord(2)).toBe('IN 2 DAYS');
    expect(relativeDayWord(10)).toBe('IN 10 DAYS');
    expect(relativeDayWord(-2)).toBe('2 DAYS AGO');
    expect(relativeDayWord(-4)).toBe('4 DAYS AGO');
  });
});

// ─── State line ───────────────────────────────────────────────────────────────

describe('payDayStateLine', () => {
  it('PAID → "PAID · N DAYS AGO" in success', () => {
    expect(payDayStateLine(stateCard('PAID', '2026-10-21'), TODAY)).toEqual({
      text: 'PAID · 4 DAYS AGO',
      tone: 'success',
    });
  });

  it('PAID yesterday / today', () => {
    expect(payDayStateLine(stateCard('PAID', '2026-10-24'), TODAY).text).toBe('PAID · YESTERDAY');
    expect(payDayStateLine(stateCard('PAID', TODAY), TODAY).text).toBe('PAID · TODAY');
  });

  it('NEXT → "NEXT PAY DAY · IN N DAYS" in gold', () => {
    expect(payDayStateLine(stateCard('NEXT', '2026-10-28'), TODAY)).toEqual({
      text: 'NEXT PAY DAY · IN 3 DAYS',
      tone: 'gold',
    });
  });

  it('NEXT tomorrow / today', () => {
    expect(payDayStateLine(stateCard('NEXT', '2026-10-26'), TODAY).text).toBe('NEXT PAY DAY · TOMORROW');
    expect(payDayStateLine(stateCard('NEXT', TODAY), TODAY).text).toBe('NEXT PAY DAY · TODAY');
  });

  it('LATER → the countdown alone in textSecondary', () => {
    expect(payDayStateLine(stateCard('LATER', '2026-11-04'), TODAY)).toEqual({
      text: 'IN 10 DAYS',
      tone: 'secondary',
    });
    expect(payDayStateLine(stateCard('LATER', '2026-10-26'), TODAY).text).toBe('TOMORROW');
  });

  it('LATE → "LATE" in critical', () => {
    expect(payDayStateLine(stateCard('LATE', '2026-10-21'), TODAY)).toEqual({
      text: 'LATE',
      tone: 'critical',
    });
  });

  it('NO_PAY → "NO PAY" plus the reason, muted', () => {
    expect(payDayStateLine(stateCard('NO_PAY', '2026-10-28', 'NO_HOURS'), TODAY)).toEqual({
      text: 'NO PAY · no hours',
      tone: 'muted',
    });
    expect(payDayStateLine(stateCard('NO_PAY', '2026-10-28', 'NO_HOURS_YET'), TODAY).text).toBe(
      'NO PAY · no hours yet',
    );
    expect(payDayStateLine(stateCard('NO_PAY', '2026-10-28'), TODAY).text).toBe('NO PAY');
    expect(payDayStateLine(stateCard('NO_PAY', '2026-10-28', 'CONTRACT_ENDED'), TODAY).text).toBe(
      'NO PAY · contract ended',
    );
  });

  it('matches states case-insensitively', () => {
    expect(payDayStateLine(stateCard('paid', '2026-10-21'), TODAY).text).toBe('PAID · 4 DAYS AGO');
  });

  it('unknown state → humanised raw state', () => {
    expect(payDayStateLine(stateCard('ON_HOLD', '2026-10-28'), TODAY)).toEqual({
      text: 'On hold',
      tone: 'secondary',
    });
    expect(payDayStateLine(stateCard('UNKNOWN', '2026-10-28'), TODAY).text).toBe('Unknown');
  });
});

// ─── Amount ───────────────────────────────────────────────────────────────────

describe('formatPayAmount', () => {
  it('formats dollars with cents and thousands separators', () => {
    expect(formatPayAmount(2000)).toBe('$2,000.00');
    expect(formatPayAmount(1908.333)).toBe('$1,908.33');
    expect(formatPayAmount(0)).toBe('$0.00');
    expect(formatPayAmount(1234567.5)).toBe('$1,234,567.50');
    expect(formatPayAmount(-12.5)).toBe('-$12.50');
  });
});

describe('payDayAmount', () => {
  const base = { amount: 2000, platform: 'PAYONEER' };

  it('FINAL → plain amount', () => {
    expect(payDayAmount({ ...base, amountKind: 'FINAL' })).toEqual({
      prefix: null,
      value: '$2,000.00',
      suffix: null,
      beforeTax: false,
      hasAmount: true,
      label: '$2,000.00',
    });
  });

  it('ESTIMATE → "about" prefix', () => {
    const a = payDayAmount({ ...base, amountKind: 'ESTIMATE' });
    expect(a.prefix).toBe('about');
    expect(a.suffix).toBeNull();
    expect(a.label).toBe('about $2,000.00');
  });

  it('SO_FAR → "so far" suffix', () => {
    const a = payDayAmount({ ...base, amount: 1908.33, amountKind: 'SO_FAR' });
    expect(a.prefix).toBeNull();
    expect(a.suffix).toBe('so far');
    expect(a.label).toBe('$1,908.33 so far');
  });

  it('NONE kind or null amount → "—"', () => {
    for (const a of [
      payDayAmount({ ...base, amountKind: 'NONE' }),
      payDayAmount({ ...base, amount: null, amountKind: 'FINAL' }),
      payDayAmount({ amount: null, amountKind: 'ESTIMATE', platform: 'PAYCHEX' }),
    ]) {
      expect(a).toEqual({
        prefix: null,
        value: '—',
        suffix: null,
        beforeTax: false,
        hasAmount: false,
        label: '—',
      });
    }
  });

  it('PAYCHEX → before tax', () => {
    const a = payDayAmount({ amount: 2000, amountKind: 'ESTIMATE', platform: 'PAYCHEX' });
    expect(a.beforeTax).toBe(true);
    expect(a.label).toBe('about $2,000.00 before tax');
    expect(payDayAmount({ ...base, amountKind: 'FINAL' }).beforeTax).toBe(false);
    expect(payDayAmount({ amount: 5, amountKind: 'FINAL', platform: null }).beforeTax).toBe(false);
  });

  it('unknown kind → plain amount', () => {
    expect(payDayAmount({ ...base, amountKind: 'PROVISIONAL' }).label).toBe('$2,000.00');
  });
});

// ─── Work week + tile ─────────────────────────────────────────────────────────

describe('workWeekLabel', () => {
  it('same month → "for work 5 – 11 Oct"', () => {
    expect(workWeekLabel('2026-10-05', '2026-10-11')).toBe('for work 5 – 11 Oct');
    expect(workWeekLabel('2026-10-19', '2026-10-25')).toBe('for work 19 – 25 Oct');
  });

  it('cross month → "for work 28 Sep – 4 Oct"', () => {
    expect(workWeekLabel('2026-09-28', '2026-10-04')).toBe('for work 28 Sep – 4 Oct');
  });

  it('cross year → both months named', () => {
    expect(workWeekLabel('2026-12-28', '2027-01-03')).toBe('for work 28 Dec – 3 Jan');
  });

  it('single day → one date', () => {
    expect(workWeekLabel('2026-10-05', '2026-10-05')).toBe('for work 5 Oct');
  });
});

describe('payDateTile', () => {
  it('splits a pay date into month / day / weekday (UTC)', () => {
    expect(payDateTile('2026-10-21')).toEqual({ month: 'OCT', day: '21', weekday: 'WED' });
    expect(payDateTile('2026-11-04')).toEqual({ month: 'NOV', day: '4', weekday: 'WED' });
    expect(payDateTile('2027-01-01')).toEqual({ month: 'JAN', day: '1', weekday: 'FRI' });
  });
});

describe('payDayTileTone', () => {
  it('maps each state to a band scheme', () => {
    expect(payDayTileTone('PAID')).toBe('paid');
    expect(payDayTileTone('NEXT')).toBe('next');
    expect(payDayTileTone('LATER')).toBe('neutral');
    expect(payDayTileTone('LATE')).toBe('late');
    expect(payDayTileTone('NO_PAY')).toBe('muted');
    expect(payDayTileTone('SOMETHING_NEW')).toBe('neutral');
  });
});

// ─── Live-shaped fixture ──────────────────────────────────────────────────────

describe('PAY_DAYS_RAW fixture', () => {
  it('formats the three live tiles', () => {
    const payDays = normalizePayDays(PAY_DAYS_RAW)!;
    const today = payDaysToday(payDays);
    expect(payDays.cards.map((c) => payDayStateLine(c, today).text)).toEqual([
      'PAID · 4 DAYS AGO',
      'NEXT PAY DAY · IN 3 DAYS',
      'IN 10 DAYS',
    ]);
    expect(payDays.cards.map((c) => payDayAmount(c).label)).toEqual([
      '$1,600.00',
      'about $1,600.00',
      '$1,600.00 so far',
    ]);
    expect(payDays.cards.map((c) => workWeekLabel(c.weekStart, c.weekEnd))).toEqual([
      'for work 5 – 11 Oct',
      'for work 12 – 18 Oct',
      'for work 19 – 25 Oct',
    ]);
  });
});

// ─── Collapsed summary (1.2) ──────────────────────────────────────────────────

describe('payDaysSummary', () => {
  const payDays = normalizePayDays(PAY_DAYS_RAW)!;
  const card = (state: string, payDate: string, amount: number | null = 1600) => ({
    ...payDays.cards[0],
    state,
    payDate,
    amount,
    amountKind: amount === null ? 'NONE' : 'FINAL',
  });

  it('summarises the NEXT card of the live fixture', () => {
    expect(payDaysSummary(payDays, TODAY)).toMatchObject({
      card: payDays.cards[1],
      stateText: 'Next pay day · in 3 days',
      text: 'Next pay day · in 3 days · about $1,600.00',
      spoken: 'next pay day, in 3 days, about $1,600.00',
    });
  });

  it('matches the state case-insensitively and takes the first NEXT', () => {
    const cards = [card('LATER', '2026-11-04'), card('next', '2026-10-28'), card('NEXT', '2026-11-11')];
    expect(payDaysSummary({ cards }, TODAY)?.card).toBe(cards[1]);
  });

  it('falls back to the first card', () => {
    const cards = [card('PAID', '2026-10-21'), card('LATER', '2026-11-04')];
    expect(payDaysSummary({ cards }, TODAY)?.text).toBe('Paid · 4 days ago · $1,600.00');
  });

  it('drops a missing amount and sentence-cases every state line', () => {
    expect(payDaysSummary({ cards: [card('LATE', '2026-10-21', null)] }, TODAY)).toMatchObject({
      text: 'Late',
      spoken: 'late',
    });
    expect(
      payDaysSummary({ cards: [{ ...card('NO_PAY', '2026-10-28', null), noPayReason: 'NO_HOURS' }] }, TODAY)?.text,
    ).toBe('No pay · no hours');
  });

  it('is null with no cards', () => {
    expect(payDaysSummary({ cards: [] }, TODAY)).toBeNull();
  });
});
