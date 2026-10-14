import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
import { primeImdbDatasetEpisodes } from '../lib/imdb-datasets';
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
it('indexes title ratings once even without eligible episodes and bounds IDs before downloading', async () => {
  const fetch = mockFiles();
  expect((await primeImdbDatasetEpisodes([], '2026-10-14')).ratings).toEqual({});
  expect((await primeImdbDatasetEpisodes([target, { ...target, seriesImdbId: 'tt200' }], '2026-10-14')).ratings).toEqual({});
  await expect(primeImdbDatasetEpisodes([{ ...target, imdbId: 'bad' }], '2026-10-14')).rejects.toThrow();
  await expect(primeImdbDatasetEpisodes(Array.from({ length: 61 }, () => target), '2026-10-14')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain('title.ratings');
});

it('does not download again for a different candidate list or accept a different parent on a cache hit', async () => {
  const fetch = mockFiles();
  await primeImdbDatasetEpisodes([target], '2026-10-14');
  expect((await primeImdbDatasetEpisodes([{ imdbId: 'tt2', seriesImdbId: 'tt100' }], '2026-10-14')).ratings).toEqual({});
  expect((await primeImdbDatasetEpisodes([{ ...target, seriesImdbId: 'tt200' }], '2026-10-14')).ratings).toEqual({});
  expect(fetch).toHaveBeenCalledTimes(2);
});
