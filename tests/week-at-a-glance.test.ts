import { describe, expect, it } from 'vitest';
import { glanceDayNumber, glanceProviders, posterClickAction, visibleDayRange, glanceSeriesLabel, glanceWeekday, groupReleases } from '@/components/WeekAtAGlance';
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

describe('glanceProviders', () => {
  const offer = (provider_id: number, provider_name: string, logo_path: string | null = `/${provider_id}.png`) => ({ provider_id, provider_name, logo_path });
  const anime = { providers: {
    IT: { link: '', providers: [offer(1, 'Crunchyroll Amazon Channel'), offer(2, 'Crunchyroll'), offer(3, 'Netflix'), offer(4, 'Prime Video')] },
    US: { link: '', providers: [offer(5, 'Hulu'), offer(6, 'No Logo', null)] },
  } };
  it('follows the selected country', () => {
    expect(glanceProviders(anime, 'IT').map(p => p.provider_name)).toEqual(['Crunchyroll', 'Netflix']);
    expect(glanceProviders(anime, 'US').map(p => p.provider_name)).toEqual(['Hulu']);
  });
  it('collapses reseller variants, skips logo-less offers and caps the count', () => {
    expect(glanceProviders(anime, 'IT', 5).map(p => p.provider_id)).toEqual([2, 3, 4]);
    expect(glanceProviders(anime, 'US', 5).map(p => p.provider_id)).toEqual([5]);
  });
  it('shows nothing when the country has no offers', () => {
    expect(glanceProviders(anime, 'FR')).toEqual([]);
    expect(glanceProviders({ providers: {} }, 'IT')).toEqual([]);
  });
});
describe('visibleDayRange', () => {
  const columns = Array.from({ length: 7 }, (_, index) => ({ left: 2 + index * 120, width: 112 }));
  it('reports the fully visible columns of the sideways scroller', () => {
    expect(visibleDayRange(columns, 0, 343)).toEqual({ first: 0, last: 1 });
    expect(visibleDayRange(columns, 0, 360)).toEqual({ first: 0, last: 2 });
    expect(visibleDayRange(columns, 240, 360)).toEqual({ first: 2, last: 4 });
  });
  it('stops at the last day and handles an empty week', () => {
    expect(visibleDayRange(columns, 480, 400)).toEqual({ first: 4, last: 6 });
    expect(visibleDayRange([], 0, 400)).toEqual({ first: 0, last: 0 });
  });
});

describe('posterClickAction', () => {
  const click = { detail: 1, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  it('waits on a first click and opens details on a second click of the same poster', () => {
    expect(posterClickAction(click, null, 'a')).toBe('wait');
    expect(posterClickAction({ ...click, detail: 2 }, 'a', 'a')).toBe('details');
    expect(posterClickAction(click, 'b', 'a')).toBe('wait');
  });
  it('keeps keyboard activation and modified clicks as the plain link', () => {
    expect(posterClickAction({ ...click, detail: 0 }, null, 'a')).toBe('native');
    expect(posterClickAction({ ...click, metaKey: true }, 'a', 'a')).toBe('native');
    expect(posterClickAction({ ...click, button: 1 }, null, 'a')).toBe('native');
  });
});
