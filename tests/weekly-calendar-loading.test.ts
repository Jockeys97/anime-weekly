import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/tmdb', () => ({
  getQuickWeekData: vi.fn(), getWeeklySource: vi.fn(), getWeeklyRelated: vi.fn(),
  getWeeklyProviders: vi.fn(), getTMDBWeekEpisodes: vi.fn(),
}));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn() }));
import { getQuickWeekData, getTMDBWeekEpisodes, getWeeklyProviders } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { getWeeklyCalendarSchedule } from '../lib/weekly-enrichment';
import { buildWeeklyCalendar } from '../lib/weekly-calendar';
import { mergeWeeklyCalendar } from '../lib/weekly-details';
import { GET } from '../app/api/weekly-calendar/route';
import type { AnimeTitle } from '../lib/tmdb';
const week = { year: 2026, week: 42 };
const tv = (id: number): AnimeTitle => ({ id, kind: 'tv', name: `Show ${id}`, overview: '', poster: null, ratings: {}, recommendation: null, providers: {}, providersUnavailable: false });
const titles = [tv(1), tv(2)];
beforeEach(async () => {
  const { clearNextCache } = await import('./helpers/next-cache'); clearNextCache();
  vi.mocked(getQuickWeekData).mockResolvedValue({ titles, status: 'ready' });
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: {}, events: [] });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('dates every weekly series with a cold rating cache and no watch/rating requests', async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Rating provider must not be called'); }));
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(async id => ({ episodes: [{ seriesId: id, season: 2, episode: 3, date: '2026-10-14' }], unavailable: false }));
  const schedule = await getWeeklyCalendarSchedule('2026-42');
  const result = buildWeeklyCalendar(titles, schedule.events, week, schedule.episodeDates);
  expect(result.days[2].releases.map(release => release.anime.id)).toEqual([1, 2]);
  expect(result.undated).toEqual([]);
  expect(getWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-42');
  expect(getWeeklyProviders).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  await getWeeklyCalendarSchedule('2026-42');
  expect(getTMDBWeekEpisodes).toHaveBeenCalledTimes(2); // Successful per-title dates are shared.
});

it('uses exact AniList identities even when the HTML rating snapshot was cold', async () => {
  const event = { id: 9, mediaId: 123, episode: 4, airingAt: Date.parse('2026-10-14T08:00:00Z') / 1000 };
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: { 'tv:1': { anilistId: 123 } }, events: [event, { ...event, id: 10, mediaId: 999 }] });
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ episodes: [], unavailable: false });
  const schedule = await getWeeklyCalendarSchedule('2026-42');
  const result = buildWeeklyCalendar(titles, schedule.events, week, schedule.episodeDates, 'Europe/Rome', schedule.anilistIds);
  expect(schedule.events).toEqual([event]);
  expect(result.days[2].releases[0]).toMatchObject({ anime: titles[0], episode: 4 });
  expect(result.undated).toEqual([titles[1]]);
  expect(getTMDBWeekEpisodes).toHaveBeenCalledExactlyOnceWith(2, week);
  expect(titles[0].ratings).toEqual({}); // Calendars never replace cached scores.
});

it('retains confirmed partial dates and retries failures without negative caching', async () => {
  const episode = { seriesId: 1, season: 1, episode: 2, date: '2026-10-14' };
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(async id => ({ episodes: id === 1 ? [episode] : [], unavailable: true }));
  const response = await GET(new Request('https://example.test/api/weekly-calendar?week=2026-42'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  const first = await response.json();
  expect(first.episodeDates).toEqual([episode]);
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ episodes: [], unavailable: false });
  const next = await getWeeklyCalendarSchedule('2026-42');
  expect(getTMDBWeekEpisodes).toHaveBeenCalledTimes(4);
  expect(mergeWeeklyCalendar(first, next).episodeDates).toEqual([episode]);
});

it('bounds concurrent episode lookups and the total calendar deadline', async () => {
  vi.useFakeTimers();
  vi.mocked(getQuickWeekData).mockResolvedValue({ titles: Array.from({ length: 40 }, (_, i) => tv(i + 1)), status: 'ready' });
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(() => new Promise(() => {}));
  const pending = getWeeklyCalendarSchedule('2026-42');
  await vi.advanceTimersByTimeAsync(23001);
  expect((await pending).unavailable).toBe(true);
  expect(getTMDBWeekEpisodes).toHaveBeenCalledTimes(8); // Four workers, no further wave past the deadline.
});

it('validates week before work and caches only complete responses', async () => {
  expect((await GET(new Request('https://example.test/api/weekly-calendar?week=2026-54'))).status).toBe(400);
  expect(getQuickWeekData).not.toHaveBeenCalled();
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ episodes: [], unavailable: false });
  const response = await GET(new Request('https://example.test/api/weekly-calendar?week=2026-42'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=21600, stale-while-revalidate=604800');
});
