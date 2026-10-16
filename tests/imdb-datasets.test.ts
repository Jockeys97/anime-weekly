import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
import { primeImdbDatasetEpisodes } from '../lib/imdb-datasets';
import { runtimeCacheMock } from './runtime-cache-setup';
const target = { imdbId: 'tt1', seriesImdbId: 'tt100' };
const ratings = 'tconst\taverageRating\tnumVotes\ntt1\t8.2\t37\ntt100\t9.9\t9999\n';
const episodes = 'tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt1\ttt100\t2\t12\n';
function response(text: string) {
  return new Response(gzipSync(text), { headers: { 'last-modified': 'Wed, 14 Oct 2026 00:00:00 GMT' } });
}
function mockFiles(ratingText = ratings, episodeText = episodes) {
  const mock = vi.fn(async (url: string) => response(url.includes('title.ratings') ? ratingText : episodeText));
  vi.stubGlobal('fetch', mock); return mock;
}
beforeEach(async () => { (await import('./helpers/next-cache')).clearNextCache(); });
afterEach(() => { vi.unstubAllGlobals(); });
it('joins real episode votes with an exact parent identity and IMDb numbering, never a series score', async () => {
  const fetch = mockFiles();
  expect(await primeImdbDatasetEpisodes([target], '2026-10-14')).toMatchObject({ status: 'ready', ratings: { tt1: { season: 2, episode: 12, score: 8.2, votes: 37 } }, dataUpdatedAt: '2026-10-14T00:00:00.000Z' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => url.startsWith('https://datasets.imdbws.com/'))).toBe(true);
});
it('caches each daily result, deduplicates overlapping jobs and refreshes on the following day', async () => {
  const fetch = mockFiles();
  const [first, second] = await Promise.all([primeImdbDatasetEpisodes([target], '2026-10-14'), primeImdbDatasetEpisodes([target], '2026-10-14')]);
  expect(second).toEqual(first);
  await primeImdbDatasetEpisodes([target, target], '2026-10-14');
  expect(fetch).toHaveBeenCalledTimes(2);
  await primeImdbDatasetEpisodes([target], '2026-10-15');
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('caches a failed daily attempt and retries tomorrow without creating fake ratings', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 })); vi.stubGlobal('fetch', fetch);
  expect(await primeImdbDatasetEpisodes([target], '2026-10-14')).toMatchObject({ status: 'unavailable', ratings: {} });
  await primeImdbDatasetEpisodes([target], '2026-10-14');
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockImplementation(async (url: string) => response(url.includes('title.ratings') ? ratings : episodes));
  expect((await primeImdbDatasetEpisodes([target], '2026-10-15')).ratings.tt1.score).toBe(8.2);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it.each([
  ['wrong parent', ratings, episodes.replace('tt100', 'tt200')],
  ['no episode row', ratings, episodes.split('\n')[0] + '\n'],
  ['missing season', ratings, episodes.replace('\t2\t12', '\t\\N\t12')],
  ['zero votes', ratings.replace('8.2\t37', '8.2\t0'), episodes],
  ['invalid score', ratings.replace('8.2\t37', '11\t37'), episodes],
  ['empty season', ratings, episodes.replace('\t2\t12', '\t\t12')],
] as const)('excludes %s without borrowing a series rating', async (_name, ratingText, episodeText) => {
  mockFiles(ratingText, episodeText);
  expect(await primeImdbDatasetEpisodes([target], '2026-10-14')).toMatchObject({ status: 'ready', ratings: {} });
});
it('rejects schema drift and corrupted gzip instead of publishing a partially parsed file', async () => {
  mockFiles(ratings.replace('numVotes', 'changedColumn'));
  expect((await primeImdbDatasetEpisodes([target], '2026-10-14')).status).toBe('unavailable');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(gzipSync(ratings).subarray(0, 20))));
  expect((await primeImdbDatasetEpisodes([target], '2026-10-15')).status).toBe('unavailable');
});
it('handles TSV headers and rows split across compressed response chunks and a final line without newline', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const data = gzipSync((url.includes('title.ratings') ? ratings : episodes).trimEnd());
    return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += 7) controller.enqueue(data.subarray(i, i + 7)); controller.close(); } }));
  }));
  expect((await primeImdbDatasetEpisodes([target], '2026-10-14')).ratings.tt1).toMatchObject({ score: 8.2, votes: 37 });
});
it('indexes titles and season charts once even without eligible weekly episodes and bounds IDs before downloading', async () => {
  const fetch = mockFiles();
  expect((await primeImdbDatasetEpisodes([], '2026-10-14')).ratings).toEqual({});
  expect((await primeImdbDatasetEpisodes([target, { ...target, seriesImdbId: 'tt200' }], '2026-10-14')).ratings).toEqual({});
  await expect(primeImdbDatasetEpisodes([{ ...target, imdbId: 'bad' }], '2026-10-14')).rejects.toThrow();
  await expect(primeImdbDatasetEpisodes(Array.from({ length: 61 }, () => target), '2026-10-14')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toContain('title.ratings');
});

it('indexes all rated series episodes from the same daily streams, not just the weekly candidates', async () => {
  const fetch = mockFiles(ratings + 'tt2\t9.1\t500\ntt3\t8.7\t600\n', episodes + 'tt2\ttt100\t3\t1\ntt3\ttt200\t1\t2\n');
  await primeImdbDatasetEpisodes([], '2026-10-14');
  const { readImdbEpisodeChart } = await import('../lib/imdb-episode-index');
  const now = new Date('2026-10-14T12:00:00Z');
  expect((await readImdbEpisodeChart('tt100', now)).episodes).toMatchObject([{ imdbId: 'tt1', season: 2, episode: 12 }, { imdbId: 'tt2', season: 3, episode: 1, score: 9.1, votes: 500 }]);
  expect((await readImdbEpisodeChart('tt200', now)).episodes).toMatchObject([{ imdbId: 'tt3', season: 1, episode: 2 }]);
  await primeImdbDatasetEpisodes([target], '2026-10-14');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('keeps title and weekly scores when the optional chart cache rejects writes', async () => {
  const runtime = runtimeCacheMock();
  runtime.set.mockImplementation(async (key, value) => { if (!key.startsWith('episode-chart:')) runtime.values.set(key, value); });
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    mockFiles();
    expect(await primeImdbDatasetEpisodes([target], '2026-10-14')).toMatchObject({ status: 'ready', ratings: { tt1: { score: 8.2 } } });
    const { readImdbDatasetRating } = await import('../lib/imdb-rating-index');
    expect(await readImdbDatasetRating('tt100', new Date('2026-10-14T12:00:00Z'))).toMatchObject({ imdbRating: '9.9' });
    expect(warning).toHaveBeenCalledOnce();
  } finally { warning.mockRestore(); }
});

it('still publishes the daily title index when the episode stream is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('title.ratings') ? response(ratings) : new Response(null, { status: 503 })));
  expect((await primeImdbDatasetEpisodes([target], '2026-10-14')).status).toBe('unavailable');
  const now = new Date('2026-10-14T12:00:00Z');
  const { readImdbDatasetRating } = await import('../lib/imdb-rating-index');
  const { readImdbEpisodeChart } = await import('../lib/imdb-episode-index');
  expect(await readImdbDatasetRating('tt100', now)).toMatchObject({ imdbRating: '9.9' });
  expect((await readImdbEpisodeChart('tt100', now)).status).toBe('unavailable');
});

it('does not redownload datasets to repair an already collected pre-chart day', async () => {
  const { unstable_cache } = await import('next/cache');
  const oldLoader = async (day: string) => ({ status: 'ready', indexVersion: 2, ratings: {}, parents: {}, updatedAt: `${day}T06:00:00Z` });
  Object.defineProperty(oldLoader, 'toString', { value: () => 'imdb-official-episode-daily-loader-v2' });
  await unstable_cache(oldLoader, ['imdb-official-episode-daily-v2'])('2026-10-14');
  const fetch = mockFiles();
  expect((await primeImdbDatasetEpisodes([], '2026-10-14')).status).toBe('ready');
  expect(fetch).not.toHaveBeenCalled();
  await primeImdbDatasetEpisodes([], '2026-10-15');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('does not download again for a different candidate list or accept a different parent on a cache hit', async () => {
  const fetch = mockFiles();
  await primeImdbDatasetEpisodes([target], '2026-10-14');
  expect((await primeImdbDatasetEpisodes([{ imdbId: 'tt2', seriesImdbId: 'tt100' }], '2026-10-14')).ratings).toEqual({});
  expect((await primeImdbDatasetEpisodes([{ ...target, seriesImdbId: 'tt200' }], '2026-10-14')).ratings).toEqual({});
  expect(fetch).toHaveBeenCalledTimes(2);
});
