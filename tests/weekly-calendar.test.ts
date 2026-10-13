import { describe, expect, it } from 'vitest';
import { buildWeeklyCalendar } from '../lib/weekly-calendar';
import type { AnimeTitle } from '../lib/tmdb';
const week = { year: 2026, week: 42 };
const time = (value: string) => Date.parse(value) / 1000;
const tv = (id = 1): AnimeTitle => ({ id, kind: 'tv', name: `Show ${id}`, overview: '', poster: null, ratings: { anilistId: id }, recommendation: null, providers: {}, providersUnavailable: false });
const movie = (releaseDate: string): AnimeTitle => ({ ...tv(9), kind: 'movie', releaseDate });
const event = (airingAt: number, episode = 1, mediaId = 1) => ({ id: episode, mediaId, airingAt, episode });
describe('weekly day calendar', () => {
  it('builds Monday to Sunday across ISO year boundaries', () => {
    expect(buildWeeklyCalendar([], [], { year: 2026, week: 1 }).days.map(day => day.date)).toEqual(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  });
  it('includes midnight Monday and excludes midnight next Monday', () => {
    const result = buildWeeklyCalendar([tv()], [event(time('2026-10-12T00:00:00Z')), event(time('2026-10-18T23:59:59Z'), 2), event(time('2026-10-19T00:00:00Z'), 3)], week);
    expect(result.days[0].releases[0].episode).toBe(1);
    expect(result.days[6].releases[0].episode).toBe(2);
    expect(result.days.flatMap(day => day.releases)).toHaveLength(2);
    expect(result.undated).toEqual([]);
  });
  it('keeps real episode numbers, deduplicates identical events and sorts times', () => {
    const early = event(time('2026-10-14T08:00:00Z'), 3), late = event(time('2026-10-14T18:00:00Z'), 4);
    const result = buildWeeklyCalendar([tv()], [late, early, early], week);
    expect(result.days[2].releases.map(release => release.episode)).toEqual([3, 4]);
  });
  it('groups movies by actual primary release date with no invented time', () => {
    const result = buildWeeklyCalendar([movie('2026-10-15')], [], week);
    expect(result.days[3].releases).toHaveLength(1);
    expect(result.days[3].releases[0].airingAt).toBeUndefined();
  });
  it('never treats a TV series premiere as this week’s episode date', () => {
    const anime = { ...tv(), releaseDate: '2026-10-14' };
    expect(buildWeeklyCalendar([anime], [], week).undated).toEqual([anime]);
  });
  it('keeps missing, invalid and out-of-week dates separate', () => {
    const titles = [tv(), movie('2026-10-20'), movie('2026-02-31'), movie('')];
    const result = buildWeeklyCalendar(titles, [event(time('2026-10-14T00:00:00Z'), 1, 99)], week);
    expect(result.undated).toEqual(titles);
    expect(result.days.every(day => day.releases.length === 0)).toBe(true);
  });
  it('does not assign schedules to unverified title matches or invalid episodes', () => {
    const unmatched = { ...tv(), ratings: {} };
    expect(buildWeeklyCalendar([unmatched, tv()], [event(time('2026-10-14T08:00:00Z'), 0)], week).undated).toHaveLength(2);
  });
});
