import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtimeCacheMock } from './runtime-cache-setup';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
const runtime = runtimeCacheMock();
beforeEach(async () => {
  vi.resetModules();
  (await import('next/cache') as unknown as { clearNextCache: () => void }).clearNextCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const pairs = { tt9335498: [8.5, 239325], tt12343534: [8.5, 180000], tt0877057: [8.9, 450000], tt2560140: [9.1, 753626] };
async function write(day: string) {
  const index = await import('../lib/imdb-rating-index');
  const shards = Array.from({ length: index.RATING_SHARDS }, () => ({} as Record<string, [number, number]>));
  for (const [id, value] of Object.entries(pairs)) shards[index.ratingBucket(id)][id] = value as [number, number];
  await index.storeImdbRatingIndex(day, shards);
  return index;
}
it('awaits and reads back all partitions before publishing completion, across multiple anime and fresh modules', async () => {
  await write('2026-10-16');
  expect(runtime.set.mock.calls.at(-1)?.[0]).toBe('2026-10-16:complete');
  expect(runtime.get.mock.calls.length).toBe(257);
  vi.resetModules();
  const { getImdbScore } = await import('../lib/imdb');
  for (const [id, value] of Object.entries(pairs)) expect(await getImdbScore(id)).toMatchObject({ imdbRating: String(value[0]), imdbVotes: String(value[1]), imdbStatus: 'ready' });
});
it('does not publish a completion marker when the cache silently drops a shard; keeps yesterday readable', async () => {
  const index = await write('2026-10-15');
  runtime.set.mockImplementation(async (key, value) => {
    if (key !== `2026-10-16:shard:${index.ratingBucket('tt9335498')}`) runtime.values.set(key, value);
  });
  await expect(write('2026-10-16')).rejects.toThrow('could not be verified');
  expect(runtime.values.has('2026-10-16:complete')).toBe(false);
  expect((await index.readImdbDatasetRating('tt9335498'))?.imdbRating).toBe('8.5');
});
it('does not trust corrupt cached bytes or replace a known rating with n/a after partition eviction', async () => {
  const index = await write('2026-10-15');
  await write('2026-10-16');
  runtime.values.set(`2026-10-16:shard:${index.ratingBucket('tt9335498')}`, 'corrupt');
  expect((await index.readImdbDatasetRating('tt9335498'))?.imdbRating).toBe('8.5');
  runtime.values.delete(`2026-10-16:shard:${index.ratingBucket('tt12343534')}`);
  expect((await index.readImdbDatasetRating('tt12343534'))?.imdbStatus).toBe('ready');
});
it('repairs an old incomplete index only once, without any OMDb or episode-file calls', async () => {
  const fetch = vi.fn(async (_url: string) => { void _url; return new Response(gzipSync('tconst\taverageRating\tnumVotes\ntt9335498\t8.5\t239325\n')); });
  vi.stubGlobal('fetch', fetch);
  const { repairLegacyImdbRatingIndex } = await import('../lib/imdb-datasets');
  expect(await repairLegacyImdbRatingIndex()).toBe(true);
  expect(await repairLegacyImdbRatingIndex()).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('https://datasets.imdbws.com/title.ratings.tsv.gz');
});
it('caches a failed migration attempt so repeated cron runs cannot repeatedly download a dataset', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 503 })); vi.stubGlobal('fetch', fetch);
  const { repairLegacyImdbRatingIndex } = await import('../lib/imdb-datasets');
  expect(await repairLegacyImdbRatingIndex()).toBe(false);
  vi.resetModules();
  expect(await (await import('../lib/imdb-datasets')).repairLegacyImdbRatingIndex()).toBe(false);
  expect(fetch).toHaveBeenCalledTimes(1);
});
