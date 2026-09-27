/**
 * Pure calendar math for the leave calendar (isomorphic, UTC calendar dates).
 * Weekdays use JavaScript numbering (0 = Sunday … 6 = Saturday).
 */
import { addDays, parseIsoDate, utcIsoDate } from '@/lib/dates';

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Normalizes `?month=` (yyyy-MM) — falls back to the month of `today`. */
export function parseMonthParam(value: string | undefined | null, today: string): string {
  if (value && MONTH_RE.test(value)) {
    const year = Number(value.slice(0, 4));
    if (year >= 2000 && year <= 2200) return value;
  }
  return today.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return utcIsoDate(d).slice(0, 7);
}

export function monthBounds(month: string): { first: string; last: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0));
  return { first: `${month}-01`, last: utcIsoDate(last) };
}

/**
 * First day of the organization week: the first working day that follows a weekend day
 * (Sun–Thu with a Fri/Sat weekend → Sunday). Defaults to Sunday.
 */
export function weekStartDay(weekendDays: readonly number[]): number {
  if (!weekendDays.length || weekendDays.length >= 7) return 0;
  for (let d = 0; d < 7; d++) {
    const prev = (d + 6) % 7;
    if (!weekendDays.includes(d) && weekendDays.includes(prev)) return d;
  }
  return 0;
}

export function weekday(iso: string): number {
  return parseIsoDate(iso)?.getUTCDay() ?? 0;
}

/** Visible grid range (whole weeks) for a month. */
export function gridRange(month: string, weekStart: number): { from: string; to: string; weeks: string[][] } {
  const { first, last } = monthBounds(month);
  const lead = (weekday(first) - weekStart + 7) % 7;
  const from = addDays(first, -lead)!;
  const trail = (weekStart + 6 - weekday(last) + 7) % 7;
  const to = addDays(last, trail)!;
  const weeks: string[][] = [];
  let cursor = from;
  while (cursor <= to) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1)!;
    }
    weeks.push(week);
  }
  return { from, to, weeks };
}

export type WeekSegment<E> = {
  event: E;
  /** 1-based grid column of the first day in this week. */
  col: number;
  span: number;
  lane: number;
  /** The event started before / continues after this week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Clips events to one week and assigns non-overlapping lanes (greedy, longest first). */
export function layoutWeek<E extends { start_date: string; end_date: string }>(week: string[], events: E[]): WeekSegment<E>[] {
  const weekFrom = week[0]!;
  const weekTo = week[6]!;
  const inWeek = events
    .filter((e) => e.start_date <= weekTo && e.end_date >= weekFrom)
    .map((e) => {
      const s = e.start_date < weekFrom ? weekFrom : e.start_date;
      const en = e.end_date > weekTo ? weekTo : e.end_date;
      const col = week.indexOf(s) + 1;
      const span = week.indexOf(en) - week.indexOf(s) + 1;
      return { event: e, col, span, continuesBefore: e.start_date < weekFrom, continuesAfter: e.end_date > weekTo };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span);
  const laneEnds: number[] = [];
  return inWeek.map((seg) => {
    let lane = laneEnds.findIndex((end) => end < seg.col);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = seg.col + seg.span - 1;
    return { ...seg, lane };
  });
}

export function holidayOn<H extends { start_date: string; end_date: string }>(day: string, holidays: H[]): H | undefined {
  return holidays.find((h) => h.start_date <= day && h.end_date >= day);
}
