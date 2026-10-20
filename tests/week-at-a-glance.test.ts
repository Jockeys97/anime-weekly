import { describe, expect, it } from 'vitest';
import { glanceDayNumber, glanceSeriesLabel, glanceWeekday, groupReleases } from '@/components/WeekAtAGlance';
import type { CalendarRelease } from '@/lib/weekly-calendar';
const r = (id: number, episode: number) => ({ anime: { id, kind: 'tv', name: `A${id}` }, date: '2026-10-20', episode }) as unknown as CalendarRelease;
describe('groupReleases', () => {
  it('groups episodes of the same series and keeps the first release first', () => {
    const groups = groupReleases([r(1, 1), r(2, 5), r(1, 2), r(1, 3)]);
    expect(groups.map(g => g.length)).toEqual([3, 1]);
    expect(groups[0][0].episode).toBe(1);
  });
});
describe('glanceSeriesLabel', () => {
  it('counts posters (grouped series), not raw releases', () => {
    const count = groupReleases([r(1, 1), r(2, 5), r(1, 2), r(1, 3)]).length;
    expect(glanceSeriesLabel(count, 'it')).toBe('2 serie');
    expect(glanceSeriesLabel(count, 'en')).toBe('2 series');
  });
  it('uses singular and plural forms per locale', () => {
    expect(glanceSeriesLabel(1, 'de')).toBe('1 Serie');
    expect(glanceSeriesLabel(4, 'de')).toBe('4 Serien');
    expect(glanceSeriesLabel(1, 'es')).toBe('1 serie');
    expect(glanceSeriesLabel(4, 'es')).toBe('4 series');
    expect(glanceSeriesLabel(1, 'fr')).toBe('1 série');
    expect(glanceSeriesLabel(4, 'pt')).toBe('4 séries');
    expect(glanceSeriesLabel(0, 'en')).toBe('0 series');
  });
});
describe('glanceWeekday', () => {
  it('follows the route locale, not the runtime language', () => {
    expect(glanceWeekday('2026-10-20', 'it')).toBe('mar');
    expect(glanceWeekday('2026-10-20', 'en')).toBe('Tue');
    expect(glanceWeekday('2026-10-20', 'de')).toBe('Di');
  });
  it('renders the day number from the same UTC date', () => {
    expect(glanceDayNumber('2026-10-05')).toBe('5');
    expect(glanceDayNumber('2026-10-20')).toBe('20');
  });
});
