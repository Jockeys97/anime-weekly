import { describe, expect, it } from 'vitest';
import { formatWeek, isoWeek, parseWeek, shiftWeek, weekRange } from '../lib/week';
describe('ISO weeks in UTC', () => {
  it('calculates Monday through Sunday for 2026-42', () => {
    const range = weekRange({ year: 2026, week: 42 });
    expect(range.start).toBe('2026-10-12'); expect(range.end).toBe('2026-10-18');
  });
  it.each([['2021-01-01', '2020-53'], ['2018-12-31', '2019-01'], ['2026-10-13', '2026-42'], ['2023-01-01', '2022-52']])('formats %s as %s', (day, expected) => expect(formatWeek(isoWeek(new Date(day)))).toBe(expected));
  it('handles weeks crossing calendar years', () => { const range = weekRange({ year: 2020, week: 53 }); expect(range.start).toBe('2020-12-28'); expect(range.end).toBe('2021-01-03'); });
  it('parses and formats a padded week', () => { expect(parseWeek('2026-01')).toEqual({ year: 2026, week: 1 }); expect(formatWeek(parseWeek('2026-01')!)).toBe('2026-01'); });
  it.each(['2021-53', '2026-00', '2026-54', '2026-1', '0000-01', '26-42', '2026-42x'])('rejects invalid week %s', value => expect(parseWeek(value)).toBeNull());
  it('accepts a real week 53', () => expect(parseWeek('2020-53')).toEqual({ year: 2020, week: 53 }));
  it('navigates across ISO years', () => { expect(formatWeek(shiftWeek({ year: 2020, week: 53 }, 1))).toBe('2021-01'); expect(formatWeek(shiftWeek({ year: 2021, week: 1 }, -1))).toBe('2020-53'); });
  it('round trips the early ISO year without Date’s 1900 offset', () => expect(formatWeek(isoWeek(weekRange(parseWeek('0099-01')!).monday))).toBe('0099-01'));
});
