import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn(), getTMDBWeekEpisodes: vi.fn(), getTMDBEpisodeIdentity: vi.fn() }));
vi.mock('../lib/imdb-datasets', () => ({ primeImdbDatasetEpisodes: vi.fn() }));
vi.mock('../lib/imdb-episodes', () => ({ primeImdbEpisode: vi.fn() }));
import { getQuickWeekData, getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '../lib/tmdb';
import { primeImdbDatasetEpisodes } from '../lib/imdb-datasets';
import { primeImdbEpisode } from '../lib/imdb-episodes';
import { primeWeeklyEpisodes } from '../lib/weekly-episode-ratings';
import { topWeeklyEpisodes, EPISODE_COLLECTOR_VERSION, type WeeklyEpisode } from '../lib/weekly-episodes';
const entry = (id = 1, score = 8, votes = 10): WeeklyEpisode => ({ imdbId: `tt${id}`, seriesId: 1, seriesName: 'Example', poster: null, title: 'Episode', season: 2, episode: id, date: '2026-10-13', score, votes });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [{ id: 1, kind: 'tv', name: 'Example', poster: null, overview: '', ratings: { imdbRating: '9.9' }, recommendation: null, providers: {}, providersUnavailable: false }] });
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ episodes: [{ seriesId: 1, season: 4, episode: 60, date: '2026-10-13', title: 'Exact episode' }, { seriesId: 1, season: 4, episode: 61, date: '2026-10-16' }], unavailable: false });
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt1', seriesImdbId: 'tt100' });
  vi.mocked(primeImdbDatasetEpisodes).mockResolvedValue({ status: 'ready', ratings: { tt1: { season: 2, episode: 12, score: 8.7, votes: 20 } }, updatedAt: '2026-10-14T12:00:00Z', dataUpdatedAt: '2026-10-14T00:00:00Z' });
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
it('ranks actual episode votes, rejects invalid/out-of-week/future entries and breaks ties by vote count', () => {
  const entries = [entry(1, 9, 20), entry(2, 9, 50), entry(3, 7), entry(4, 8), entry(5, 6), entry(6, 10), { ...entry(7, 10), date: '2026-10-19' }, { ...entry(8, 10), date: '2026-10-16' }, entry(9, NaN), entry(10, 11), entry(11, 8, 0), { ...entry(2, 9, 50) }];
  expect(topWeeklyEpisodes(entries, '2026-42').map(e => e.imdbId)).toEqual(['tt6', 'tt2', 'tt1', 'tt4', 'tt3']);
  expect(entries).toHaveLength(12);
  expect(topWeeklyEpisodes(entries, 'bad')).toEqual([]);
});
it('joins exact episode IDs, skips future releases and uses IMDb numbering even when TMDB differs', async () => {
  const result = await primeWeeklyEpisodes('2026-42');
  expect(result.entries[0]).toMatchObject({ imdbId: 'tt1', date: '2026-10-13', title: 'Exact episode', season: 2, episode: 12, score: 8.7, source: 'imdb-datasets' });
  expect(result).toMatchObject({ status: 'ready', source: 'imdb-datasets', dataUpdatedAt: '2026-10-14T00:00:00Z' });
  expect(getTMDBEpisodeIdentity).toHaveBeenCalledTimes(1);
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledExactlyOnceWith([{ imdbId: 'tt1', seriesImdbId: 'tt100' }], '2026-10-14');
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});
it('keeps unmapped and unrated episodes out and never borrows a series score', async () => {
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue(null);
  expect((await primeWeeklyEpisodes('2026-42')).entries).toEqual([]);
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledWith([], '2026-10-14');
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt1', seriesImdbId: 'tt100' });
  vi.mocked(primeImdbDatasetEpisodes).mockResolvedValue({ status: 'ready', ratings: {}, updatedAt: '2026-10-14T12:00:00Z' });
  expect((await primeWeeklyEpisodes('2026-42')).entries).toEqual([]);
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});
it('preserves previously confirmed episodes during a dataset failure and reuses the daily attempt', async () => {
  vi.mocked(primeImdbDatasetEpisodes).mockResolvedValue({ status: 'unavailable', ratings: {}, updatedAt: '2026-10-14T12:00:00Z' });
  const result = await primeWeeklyEpisodes('2026-42', { entries: [entry()], status: 'ready' });
  expect(result.entries).toEqual([entry()]);
  expect(result).toMatchObject({ status: 'partial', reason: 'source', source: 'imdb-datasets' });
  expect(await primeWeeklyEpisodes('2026-42', result)).toBe(result);
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledTimes(1);
});
it.each(['ready', 'partial', 'unavailable'] as const)('reuses a completed daily attempt (%s) without upstream calls', async status => {
  const previous = { entries: [entry()], status, collectorVersion: EPISODE_COLLECTOR_VERSION, updatedAt: '2026-10-14T06:00:00Z' };
  expect(await primeWeeklyEpisodes('2026-42', previous)).toBe(previous);
  expect(getQuickWeekData).not.toHaveBeenCalled();
  expect(primeImdbDatasetEpisodes).not.toHaveBeenCalled();
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});
it('refreshes the following day instead of permanently freezing an error', async () => {
  const previous = { entries: [], status: 'unavailable' as const, collectorVersion: EPISODE_COLLECTOR_VERSION, updatedAt: '2026-10-13T06:00:00Z' };
  expect((await primeWeeklyEpisodes('2026-42', previous)).status).toBe('ready');
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledTimes(1);
});
it('caps exact targets at sixty even across concurrent metadata workers', async () => {
  const catalog = await getQuickWeekData({ year: 2026, week: 42 }, 'en');
  vi.mocked(getQuickWeekData).mockResolvedValue({ ...catalog, titles: Array.from({ length: 4 }, (_, index) => ({ ...catalog.titles[0], id: index + 1 })) });
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(async id => ({ unavailable: false, episodes: Array.from({ length: 20 }, (_, index) => ({ seriesId: id, season: 1, episode: index + 1, date: '2026-10-13' })) }));
  vi.mocked(getTMDBEpisodeIdentity).mockImplementation(async date => ({ imdbId: `tt${date.seriesId * 100 + date.episode}`, seriesImdbId: 'tt100' }));
  vi.mocked(primeImdbDatasetEpisodes).mockImplementation(async targets => ({ status: 'ready', ratings: Object.fromEntries(targets.map(target => [target.imdbId, { score: 8.7, votes: 20, season: 1, episode: 1 }])), updatedAt: '2026-10-14T12:00:00Z' }));
  const result = await primeWeeklyEpisodes('2026-42');
  expect(vi.mocked(primeImdbDatasetEpisodes).mock.calls[0][0]).toHaveLength(60);
  expect(result.entries).toHaveLength(5);
  expect(result.status).toBe('partial');
  expect(primeImdbEpisode).not.toHaveBeenCalled();
});
it('migrates an OMDb snapshot once and then reuses the new daily dataset snapshot', async () => {
  const result = await primeWeeklyEpisodes('2026-42', { entries: [], status: 'unavailable', collectorVersion: 2, updatedAt: '2026-10-14T06:00:00Z' });
  expect(result).toMatchObject({ status: 'ready', collectorVersion: EPISODE_COLLECTOR_VERSION, coverage: { rated: 1 } });
  expect(await primeWeeklyEpisodes('2026-42', result)).toBe(result);
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledTimes(1);
});
it('saves discovery failure as a daily attempt and keeps confirmed ratings intact', async () => {
  vi.mocked(getQuickWeekData).mockRejectedValue(new Error('timeout'));
  const result = await primeWeeklyEpisodes('2026-42', { entries: [entry()], status: 'ready' });
  expect(result).toMatchObject({ entries: [entry()], status: 'partial', reason: 'metadata', collectorVersion: EPISODE_COLLECTOR_VERSION });
  expect(await primeWeeklyEpisodes('2026-42', result)).toBe(result);
  expect(getQuickWeekData).toHaveBeenCalledTimes(1);
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledExactlyOnceWith([], '2026-10-14');
});
it('excludes movies and does not manufacture a weekday or episode identity for an unmapped title', async () => {
  const catalog = await getQuickWeekData({ year: 2026, week: 42 }, 'en');
  vi.mocked(getQuickWeekData).mockResolvedValue({ ...catalog, titles: [{ ...catalog.titles[0], kind: 'movie' }] });
  expect((await primeWeeklyEpisodes('2026-42')).entries).toEqual([]);
  expect(getTMDBWeekEpisodes).not.toHaveBeenCalled();
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledWith([], '2026-10-14');
});
it('does not choose between conflicting parent identities for one IMDb episode', async () => {
  const catalog = await getQuickWeekData({ year: 2026, week: 42 }, 'en');
  vi.mocked(getQuickWeekData).mockResolvedValue({ ...catalog, titles: [{ ...catalog.titles[0] }, { ...catalog.titles[0], id: 2 }] });
  vi.mocked(getTMDBWeekEpisodes).mockImplementation(async id => ({ episodes: [{ seriesId: id, season: 1, episode: 1, date: '2026-10-13' }], unavailable: false }));
  vi.mocked(getTMDBEpisodeIdentity).mockImplementation(async date => ({ imdbId: 'tt1', seriesImdbId: `tt${date.seriesId}` }));
  const result = await primeWeeklyEpisodes('2026-42');
  expect(result.entries).toEqual([]);
  expect(result.reason).toBe('metadata');
  expect(primeImdbDatasetEpisodes).toHaveBeenCalledWith([], '2026-10-14');
});

it('drops a formerly rated candidate when a complete daily dataset can no longer verify its vote', async () => {
  vi.mocked(primeImdbDatasetEpisodes).mockResolvedValue({ status: 'ready', ratings: {}, updatedAt: '2026-10-14T12:00:00Z' });
  const result = await primeWeeklyEpisodes('2026-42', { entries: [entry()], status: 'ready' });
  expect(result.entries).toEqual([]);
  expect(result.coverage?.unrated).toBe(1);
});
