import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn(), getTMDBWeekEpisodes: vi.fn(), getTMDBEpisodeIdentity: vi.fn() }));
vi.mock('../lib/imdb-episodes', () => ({ EpisodeLookupError: class extends Error { constructor(public reason: string) { super(reason); } }, primeImdbEpisode: vi.fn() }));
import { getQuickWeekData, getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '../lib/tmdb';
import { primeImdbEpisode, EpisodeLookupError } from '../lib/imdb-episodes';
import { primeWeeklyEpisodes } from '../lib/weekly-episode-ratings';
import { topWeeklyEpisodes, type WeeklyEpisode } from '../lib/weekly-episodes';
const entry = (id = 1, score = 8, votes = 10): WeeklyEpisode => ({ imdbId: `tt${id}`, seriesId: 1, seriesName: 'Example', poster: null, title: 'Episode', season: 2, episode: id, date: '2026-10-13', score, votes });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [{ id: 1, kind: 'tv', name: 'Example', poster: null, overview: '', ratings: { imdbRating: '9.9' }, recommendation: null, providers: {}, providersUnavailable: false }] });
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ episodes: [{ seriesId: 1, season: 4, episode: 60, date: '2026-10-13' }, { seriesId: 1, season: 4, episode: 61, date: '2026-10-16' }], unavailable: false });
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt1', seriesImdbId: 'tt100' });
  vi.mocked(primeImdbEpisode).mockResolvedValue({ title: 'Exact episode', season: 2, episode: 12, score: 8.7, votes: 20 });
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
it('ranks actual episode votes, rejects invalid/out-of-week/future entries and breaks ties by vote count', () => {
  const entries = [entry(1, 9, 20), entry(2, 9, 50), entry(3, 7), entry(4, 8), entry(5, 6), entry(6, 10), { ...entry(7, 10), date: '2026-10-19' }, { ...entry(8, 10), date: '2026-10-16' }, entry(9, NaN), entry(10, 11), entry(11, 8, 0), { ...entry(2, 9, 50) }];
  expect(topWeeklyEpisodes(entries, '2026-42').map(e => e.imdbId)).toEqual(['tt6', 'tt2', 'tt1', 'tt4', 'tt3']);
  expect(entries).toHaveLength(12);
  expect(topWeeklyEpisodes(entries, 'bad')).toEqual([]);
});
it('resolves exact episode IDs, skips future releases and uses IMDb numbering even when TMDB differs', async () => {
  const result = await primeWeeklyEpisodes('2026-42');
  expect(result.entries[0]).toMatchObject({ imdbId: 'tt1', date: '2026-10-13', season: 2, episode: 12, score: 8.7 });
  expect(result.status).toBe('ready');
  expect(getTMDBEpisodeIdentity).toHaveBeenCalledTimes(1);
  expect(primeImdbEpisode).toHaveBeenCalledExactlyOnceWith('tt1', 'tt100', '2026-10-14', { season: 4, episode: 60 });
});
it('keeps unmapped and unrated episodes out and never borrows a series score', async () => {
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue(null);
  expect((await primeWeeklyEpisodes('2026-42')).entries).toEqual([]);
  expect(primeImdbEpisode).not.toHaveBeenCalled();
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt1', seriesImdbId: 'tt100' });
  vi.mocked(primeImdbEpisode).mockResolvedValue(null);
  expect((await primeWeeklyEpisodes('2026-42')).entries).toEqual([]);
});
it('preserves previously confirmed episodes and stops vendor requests after quota failure', async () => {
  vi.mocked(primeImdbEpisode).mockRejectedValue(new EpisodeLookupError('quota'));
  const result = await primeWeeklyEpisodes('2026-42', { entries: [entry()], status: 'ready' });
  expect(result.entries).toEqual([entry()]);
  expect(result.status).toBe('partial');
  expect(primeImdbEpisode).toHaveBeenCalledTimes(1);
});

it.each(['ready', 'partial', 'unavailable'] as const)('reuses a completed daily attempt (%s) without making any upstream calls', async status => {
  const previous = { entries: [entry()], status, collectorVersion: 2, updatedAt: '2026-10-14T06:00:00Z' };
  expect(await primeWeeklyEpisodes('2026-42', previous)).toBe(previous);
  expect(getQuickWeekData).not.toHaveBeenCalled();
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});
it('refreshes the following day instead of permanently freezing an error', async () => {
  const previous = { entries: [], status: 'unavailable' as const, updatedAt: '2026-10-13T06:00:00Z' };
  expect((await primeWeeklyEpisodes('2026-42', previous)).status).toBe('ready');
  expect(primeImdbEpisode).toHaveBeenCalledTimes(1);
});

it('caps candidates at thirty to allow at most sixty HTTP calls per daily run', async () => {
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ unavailable: false, episodes: Array.from({ length: 70 }, (_, index) => ({ seriesId: 1, season: 1, episode: index + 1, date: '2026-10-13' })) });
  vi.mocked(getTMDBEpisodeIdentity).mockImplementation(async date => ({ imdbId: `tt${date.episode}`, seriesImdbId: 'tt100' }));
  const result = await primeWeeklyEpisodes('2026-42');
  expect(primeImdbEpisode).toHaveBeenCalledTimes(30);
  expect(result.entries).toHaveLength(30);
  expect(result.status).toBe('partial');
});

it('repairs a pre-fix failure once and then reuses its new daily snapshot', async () => {
  const result = await primeWeeklyEpisodes('2026-42', { entries: [], status: 'unavailable', updatedAt: '2026-10-14T06:00:00Z' });
  expect(result).toMatchObject({ status: 'ready', collectorVersion: 2, coverage: { rated: 1 } });
  expect(await primeWeeklyEpisodes('2026-42', result)).toBe(result);
  expect(primeImdbEpisode).toHaveBeenCalledTimes(1);
});
it('reports a source outage separately from a quota failure', async () => {
  vi.mocked(primeImdbEpisode).mockRejectedValue(new EpisodeLookupError('source'));
  expect(await primeWeeklyEpisodes('2026-42')).toMatchObject({ status: 'unavailable', reason: 'source' });
  vi.mocked(primeImdbEpisode).mockRejectedValue(new EpisodeLookupError('quota'));
  expect(await primeWeeklyEpisodes('2026-42')).toMatchObject({ status: 'unavailable', reason: 'quota' });
});

it('saves discovery failure as a daily attempt rather than throwing and repeatedly retrying', async () => {
  vi.mocked(getQuickWeekData).mockRejectedValue(new Error('timeout'));
  const result = await primeWeeklyEpisodes('2026-42');
  expect(result).toMatchObject({ status: 'unavailable', reason: 'metadata', collectorVersion: 2 });
  expect(await primeWeeklyEpisodes('2026-42', result)).toBe(result);
  expect(getQuickWeekData).toHaveBeenCalledTimes(1);
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});

it('keeps a quota failure visible even when another in-flight lookup reports a source error', async () => {
  const catalog = await getQuickWeekData({ year: 2026, week: 42 }, 'en');
  vi.mocked(getQuickWeekData).mockResolvedValue({ ...catalog, titles: [...catalog.titles, { ...catalog.titles[0], id: 2 }] });
  vi.mocked(getTMDBEpisodeIdentity).mockImplementation(async date => ({ imdbId: `tt${date.seriesId}`, seriesImdbId: 'tt100' }));
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(async id => ({ episodes: [{ seriesId: id, season: 1, episode: 1, date: '2026-10-13' }], unavailable: false }));
  vi.mocked(primeImdbEpisode).mockRejectedValueOnce(new EpisodeLookupError('quota')).mockRejectedValueOnce(new EpisodeLookupError('source'));
  expect(await primeWeeklyEpisodes('2026-42')).toMatchObject({ status: 'unavailable', reason: 'quota' });
});
