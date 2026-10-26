import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn(), getAnime: vi.fn(), getSeasonFamily: vi.fn(), animeName: (a: { title: { english: string } }) => a.title.english }));
vi.mock('../lib/imdb', () => ({ getImdbScore: vi.fn(), hasImdbScore: () => false }));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn(), getWeeklyProviders: vi.fn(), getAnimeAvailability: vi.fn() }));
import { getSeason } from '../lib/anilist';
import { getQuickWeekData, getWeeklyProviders, getAnimeAvailability } from '../lib/tmdb';
import { getWeeklyPlatformMetadata, getSeasonPlatformMetadata } from '../lib/platform-metadata';
import { mergePlatformSnapshot } from '../lib/platform-data';
import { GET as weeklyGet } from '../app/api/weekly-providers/route';
import { GET as seasonGet } from '../app/api/season-providers/route';
import type { AniListAnime } from '../lib/anilist';
import { getImdbScore } from '../lib/imdb';
const available = { providers: { IT: { link: 'https://www.themoviedb.org/tv/1/watch?locale=IT', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } }, providersUnavailable: false };
const week = { year: 2026, week: 42 };
beforeEach(async () => {
  (await import('./helpers/next-cache')).clearNextCache();
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [1, 2].map(id => ({ id, kind: 'tv', name: `Show ${id}`, overview: '', poster: null, ratings: {}, providers: {}, providersUnavailable: false, recommendation: null })) });
  vi.mocked(getWeeklyProviders).mockResolvedValue(available);
});
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

it('loads all weekly titles once and reuses positive provider results without rating calls', async () => {
  const data = await getWeeklyPlatformMetadata('2026-42');
  expect(data).toEqual({ titles: { 'tv:1': available, 'tv:2': available }, unavailable: false });
  expect(getQuickWeekData).toHaveBeenCalledExactlyOnceWith(week, 'en');
  expect(getWeeklyProviders).toHaveBeenCalledTimes(2);
  expect(getAnimeAvailability).not.toHaveBeenCalled();
  await getWeeklyPlatformMetadata('2026-42');
  expect(getWeeklyProviders).toHaveBeenCalledTimes(2);
});

it('retains positive metadata on failure and retries failed providers without negative caching', async () => {
  vi.mocked(getWeeklyProviders).mockImplementation(async (_kind, id) => id === 1 ? available : { providers: {}, providersUnavailable: true });
  const first = await weeklyGet(new Request('https://example.test/api/weekly-providers?week=2026-42'));
  expect(first.headers.get('cache-control')).toBe('no-store');
  expect((await first.json()).titles['tv:1']).toEqual(available);
  vi.mocked(getWeeklyProviders).mockResolvedValue(available);
  const recovered = await getWeeklyPlatformMetadata('2026-42');
  expect(recovered.unavailable).toBe(false);
  expect(getWeeklyProviders).toHaveBeenCalledTimes(3);
  expect(mergePlatformSnapshot(recovered, { titles: { 'tv:1': { providers: {}, providersUnavailable: true } }, unavailable: true }).titles['tv:1']).toEqual(available);
});

it('loads a canonical season page once and explicitly requests provider-only matching', async () => {
  vi.mocked(getSeason).mockResolvedValue({ media: [{ id: 178533, title: { english: 'Ranma ½ (2024)', romaji: null, native: 'らんま1/2' }, startDate: { year: 2024 }, format: 'TV' } as AniListAnime], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getAnimeAvailability).mockResolvedValue({ ...available, match: { id: 259140, kind: 'tv' }, ratings: {} });
  const data = await getSeasonPlatformMetadata(2024, 'fall', 1);
  expect(data.titles['anilist:178533']).toEqual({ ...available, match: { id: 259140, kind: 'tv' } });
  expect(getSeason).toHaveBeenCalledExactlyOnceWith(2024, 'fall', 1);
  expect(getAnimeAvailability).toHaveBeenCalledExactlyOnceWith(['Ranma ½ (2024)', 'らんま1/2'], 2024, 'tv', false, true);
  expect(getImdbScore).not.toHaveBeenCalled();
  expect(getWeeklyProviders).not.toHaveBeenCalled();
});

it('includes verified Steel Ball Run offers in seasonal filters without rating or title-search requests', async () => {
  vi.mocked(getSeason).mockResolvedValue({ media: [{ id: 210482, format: 'ONA', startDate: { year: 2026 }, title: { english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE", romaji: null, native: null } } as AniListAnime], pageInfo: { currentPage: 1, hasNextPage: false } });
  const data = await getSeasonPlatformMetadata(2026, 'fall', 1);
  expect(data.titles['anilist:210482'].providers.US?.providers[0].watch_url).toBe('https://www.netflix.com/title/82116553');
  expect(data.titles['anilist:210482'].providers.IT?.providers[0].provider_name).toBe('Netflix');
  expect(getAnimeAvailability).not.toHaveBeenCalled();
  expect(getImdbScore).not.toHaveBeenCalled();
});

it('does not cache a failed title identity as confirmed empty platform metadata', async () => {
  const anime = { id: 1, title: { english: 'Example', romaji: null, native: null }, format: 'TV', startDate: { year: 2024 } } as AniListAnime;
  vi.mocked(getSeason).mockResolvedValue({ media: [anime], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getAnimeAvailability).mockResolvedValueOnce({ match: null, ratings: { imdbStatus: 'unmatched' }, providers: {}, providersUnavailable: false })
    .mockResolvedValue({ ...available, match: { id: 1, kind: 'tv' }, ratings: {} });
  const first = await getSeasonPlatformMetadata(2024, 'fall', 1);
  expect(first.unavailable).toBe(true);
  expect(first.titles['anilist:1'].providersUnavailable).toBe(true);
  const next = await getSeasonPlatformMetadata(2024, 'fall', 1);
  expect(next.unavailable).toBe(false);
  expect(next.titles['anilist:1'].providers.IT?.providers[0].provider_name).toBe('Netflix');
});

it('rejects invalid route parameters before calling any sources', async () => {
  expect((await weeklyGet(new Request('https://example.test/api/weekly-providers?week=nope'))).status).toBe(400);
  expect((await seasonGet(new Request('https://example.test/api/season-providers?year=2026&season=fall&page=0'))).status).toBe(400);
  expect((await seasonGet(new Request('https://example.test/api/season-providers?year=2026&season=bad'))).status).toBe(400);
  expect(getQuickWeekData).not.toHaveBeenCalled();
  expect(getSeason).not.toHaveBeenCalled();
});

it('bounds eager metadata work and exposes a partial response rather than false empty results', async () => {
  vi.useFakeTimers();
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: Array.from({ length: 40 }, (_, id) => ({ id: id + 1, kind: 'tv', name: 'Show', poster: null, overview: '', ratings: {}, recommendation: null, providers: {}, providersUnavailable: false })) });
  vi.mocked(getWeeklyProviders).mockImplementation(() => new Promise(() => {}));
  const pending = getWeeklyPlatformMetadata('2026-42');
  await vi.advanceTimersByTimeAsync(23001);
  const data = await pending;
  expect(getWeeklyProviders).toHaveBeenCalledTimes(4);
  expect(data.unavailable).toBe(true);
  expect(Object.values(data.titles)).toHaveLength(40);
  expect(Object.values(data.titles).every(title => title.providersUnavailable)).toBe(true);
});

it('excludes adult titles from seasonal platform listings before provider lookups', async () => {
  const title = { id: 1, title: { english: 'Example', romaji: null, native: null }, format: 'TV', startDate: { year: 2024 } } as AniListAnime;
  vi.mocked(getSeason).mockResolvedValue({ media: [title, { ...title, id: 2, isAdult: true }], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getAnimeAvailability).mockResolvedValue({ ...available, match: { id: 1, kind: 'tv' }, ratings: {} });
  const data = await getSeasonPlatformMetadata(2024, 'fall', 1);
  expect(Object.keys(data.titles)).toEqual(['anilist:1']);
  expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
});
