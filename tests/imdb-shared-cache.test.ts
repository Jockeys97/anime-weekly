import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
beforeEach(async () => {
  vi.resetModules();
  (await import('next/cache') as unknown as { clearNextCache: () => void }).clearNextCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const table = 'tconst\taverageRating\tnumVotes\ntt1\t8.2\t37\ntt2560140\t9.1\t123456\ntt9335498\t8.6\t10000\n';
function files(ratings = table) {
  return vi.fn(async (url: string) => new Response(gzipSync(url.includes('title.ratings') ? ratings : 'tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt1\ttt100\t1\t2\n')));
}
it('search reads daily scores outside the weekly candidates after a reader bundle restart, with zero vendor calls', async () => {
  const fetch = files(); vi.stubGlobal('fetch', fetch);
  const { primeImdbDatasetEpisodes } = await import('../lib/imdb-datasets');
  await primeImdbDatasetEpisodes([{ imdbId: 'tt1', seriesImdbId: 'tt100' }]);
  expect(fetch).toHaveBeenCalledTimes(2);
  // Separate reader process/bundle: no process-local pending rows remain.
  vi.resetModules();
  const { getImdbScore } = await import('../lib/imdb');
  expect(await getImdbScore('tt2560140')).toMatchObject({ imdbRating: '9.1', imdbVotes: '123456', imdbStatus: 'ready' });
  expect(await getImdbScore('tt9335498')).toMatchObject({ imdbRating: '8.6', imdbStatus: 'ready' });
  expect((await getImdbScore('tt999')).imdbStatus).toBe('unavailable');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('keeps the previous complete daily file across a week boundary and a failed daily download', async () => {
  const fetch = files(); vi.stubGlobal('fetch', fetch);
  const { primeImdbDatasetEpisodes } = await import('../lib/imdb-datasets');
  const { getImdbScore } = await import('../lib/imdb');
  await primeImdbDatasetEpisodes([]);
  vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
  fetch.mockRejectedValue(new Error('offline'));
  await primeImdbDatasetEpisodes([]);
  expect((await getImdbScore('tt2560140', '2026-43')).imdbRating).toBe('9.1');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('does not publish rows from a corrupt/truncated gzip stream', async () => {
  const compressed = gzipSync(table);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(compressed.subarray(0, compressed.length - 5))));
  const { primeImdbDatasetEpisodes } = await import('../lib/imdb-datasets');
  expect((await primeImdbDatasetEpisodes([])).status).toBe('unavailable');
  const { readImdbDatasetRating } = await import('../lib/imdb-rating-index');
  expect(await readImdbDatasetRating('tt2560140')).toBeUndefined();
});
it('reads a freshly updated cross-week store even when the old weekly IMDb cache was never filled', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { storeRatingsStore } = await import('../lib/ratings-store');
  await storeRatingsStore({ ratings: { 'imdb:tt2560140': { values: { imdbRating: '9.1', imdbVotes: '123456', imdbStatus: 'ready' }, fetchedAt: Date.now(), lastSeenAt: Date.now() } }, sources: {} });
  const { getImdbScore } = await import('../lib/imdb');
  expect((await getImdbScore('tt2560140', '2026-43')).imdbRating).toBe('9.1');
  expect(fetch).not.toHaveBeenCalled();
});
it('uses the cache-only collector endpoint if the reader has an isolated route cache', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'anime.example');
  const fetch = vi.fn(async (url: string) => { expect(url).toContain('/api/revalidate?imdb='); return Response.json({ imdbId: 'tt2560140', imdbRating: '9.1', imdbStatus: 'ready' }); });
  vi.stubGlobal('fetch', fetch);
  const { getImdbScore } = await import('../lib/imdb');
  expect((await getImdbScore('tt2560140')).imdbRating).toBe('9.1');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://anime.example/api/revalidate?imdb=tt2560140');
});
it('does not retain fake scores from N/A, zero-vote or malformed dataset rows', async () => {
  vi.stubGlobal('fetch', files('tconst\taverageRating\tnumVotes\ntt1\tN/A\t20\ntt2\t8.2\t0\ntt3\t11\t30\n'));
  const { primeImdbDatasetEpisodes } = await import('../lib/imdb-datasets');
  await primeImdbDatasetEpisodes([]);
  const { readImdbDatasetRating } = await import('../lib/imdb-rating-index');
  for (const id of ['tt1', 'tt2', 'tt3']) expect(await readImdbDatasetRating(id)).toBeUndefined();
});
