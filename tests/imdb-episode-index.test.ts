import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { runtimeCacheMock } from './runtime-cache-setup';
import { storeImdbEpisodeIndex, readImdbEpisodeChart, getImdbEpisodeChart, type EpisodeShard } from '../lib/imdb-episode-index';
import { ratingBucket, RATING_SHARDS } from '../lib/imdb-rating-index';
import { GET } from '../app/api/episode-ratings/route';
const runtime = runtimeCacheMock();
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const now = new Date('2026-10-16T12:00:00Z');
async function write(day = '2026-10-16') {
  const shards: EpisodeShard[] = Array.from({ length: RATING_SHARDS }, () => ({}));
  shards[ratingBucket('tt100')].tt100 = [['tt1', 1, 1, 8.5, 123], ['tt2', 2, 1, 9, 456]];
  shards[ratingBucket('tt200')].tt200 = [['tt3', 3, 1, 7.5, 100]];
  await storeImdbEpisodeIndex(day, shards, `${day}T12:00:00Z`, `${day}T00:00:00Z`);
}
it('persists verified daily partitions and reads only the requested IMDb parent without network calls', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await write();
  expect(runtime.set.mock.calls.at(-1)?.[0]).toBe('episode-chart:2026-10-16:complete');
  runtime.get.mockClear();
  expect(await readImdbEpisodeChart('tt100', now)).toMatchObject({ status: 'ready', episodes: [{ imdbId: 'tt1', season: 1, episode: 1, score: 8.5, votes: 123 }, { imdbId: 'tt2', season: 2, episode: 1, score: 9, votes: 456 }] });
  expect(runtime.get).toHaveBeenCalledTimes(2);
  expect((await readImdbEpisodeChart('tt200', now)).episodes.map(episode => episode.imdbId)).toEqual(['tt3']);
  expect(fetch).not.toHaveBeenCalled();
});
it('distinguishes no rated episodes from a missing daily cache, without filling the cache on public reads', async () => {
  expect(await readImdbEpisodeChart('tt100', now)).toEqual({ status: 'unavailable', episodes: [] });
  expect(runtime.set).not.toHaveBeenCalled();
  await write();
  expect(await readImdbEpisodeChart('tt999', now)).toMatchObject({ status: 'ready', episodes: [] });
});
it('falls back to yesterday after corruption, partial writes or cache eviction', async () => {
  await write('2026-10-15'); await write();
  runtime.values.set(`episode-chart:2026-10-16:${ratingBucket('tt100')}`, 'corrupt');
  expect((await readImdbEpisodeChart('tt100', now)).updatedAt).toBe('2026-10-15T12:00:00Z');
  runtime.values.delete('episode-chart:2026-10-16:complete');
  expect((await readImdbEpisodeChart('tt100', now)).episodes).toHaveLength(2);
});
it('does not publish a completion marker when a write is silently dropped', async () => {
  runtime.set.mockImplementation(async (key, value) => { if (!key.endsWith(`:${ratingBucket('tt100')}`)) runtime.values.set(key, value); });
  await expect(write()).rejects.toThrow('could not be verified');
  expect(runtime.values.has('episode-chart:2026-10-16:complete')).toBe(false);
});
it.each(['', 'foo', 'tt123javascript', 'tt' + '1'.repeat(21)])('rejects invalid identities before reading (%s)', async id => {
  expect((await GET(new Request(`https://example.test/api/episode-ratings?imdb=${id}`))).status).toBe(400);
  expect(runtime.get).not.toHaveBeenCalled();
});
it('keeps public cache misses retryable and never initiates upstream work', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const response = await GET(new Request('https://example.test/api/episode-ratings?imdb=tt100'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ status: 'unavailable', episodes: [] });
  expect(fetch).not.toHaveBeenCalled();
  expect(runtime.set).not.toHaveBeenCalled();
});
it('reads a missing regional index through the collector bundle without downloading IMDb', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'anime-weekly.example.test');
  const fetch = vi.fn(async () => Response.json({ seriesId: 'tt100', status: 'ready', episodes: [{ imdbId: 'tt1', season: 4, episode: 17, score: 9.1, votes: 1200 }] }));
  vi.stubGlobal('fetch', fetch);
  const [a, b] = await Promise.all([getImdbEpisodeChart('tt100'), getImdbEpisodeChart('tt100')]);
  expect(a).toEqual(b); expect(a.episodes[0].season).toBe(4);
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://anime-weekly.example.test/api/revalidate?episodeChart=tt100', expect.objectContaining({ next: { revalidate: 86400 } }));
  expect(runtime.set).not.toHaveBeenCalled();
});
it('rejects a collector response for a different series and never fabricates a chart', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'anime-weekly.example.test');
  const fetch = vi.fn(async () => Response.json({ seriesId: 'tt200', status: 'ready', episodes: [] })); vi.stubGlobal('fetch', fetch);
  expect(await getImdbEpisodeChart('tt100')).toEqual({ status: 'unavailable', episodes: [], reason: 'cache-error' });
  expect(fetch).toHaveBeenCalledTimes(1); expect(runtime.set).not.toHaveBeenCalled();
});
it('bounds cache outages rather than holding a detail render indefinitely', async () => {
  vi.useFakeTimers(); runtime.get.mockImplementation(() => new Promise(() => {}));
  const pending = readImdbEpisodeChart('tt100', now);
  await vi.advanceTimersByTimeAsync(4001);
  expect(await pending).toEqual({ status: 'unavailable', episodes: [], reason: 'cache-error' });
  expect(runtime.get.mock.calls.length).toBeLessThanOrEqual(4);
});
