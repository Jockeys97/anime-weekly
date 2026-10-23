import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import { clearNextCache, revalidateTag as expireLoaderTag } from './helpers/next-cache';
import config from '../vercel.json';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => {
  const cache = await import('./helpers/next-cache');
  return { ...cache, revalidateTag: vi.fn(cache.revalidateTag) };
});
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { getPopularCatalogBatch, getSeason } from '@/lib/anilist';
import { getSimilarAnime } from '@/lib/discovery-data';
import { SIMILAR_CATALOG_RESPONSE_TAG } from '@/lib/similar-catalog-client';
import { GET } from '@/app/api/similar-catalog/route';

const source = { id: 1, genres: ['Action'], tags: [], format: 'TV', popularity: 1000, averageScore: 80, title: { romaji: 'Source' } } as unknown as AniListAnime;
const seasonal = { ...source, id: 2 };
const popular = { ...source, id: 3 };
const request = (query = '', auth: string | undefined = 'Bearer test-secret') => new Request(`https://example.test/api/similar-catalog${query}`, { headers: auth ? { authorization: auth } : {} });
beforeEach(() => {
  vi.clearAllMocks(); clearNextCache();
  vi.mocked(revalidateTag).mockImplementation(tag => { expireLoaderTag(tag); });
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => GET(new Request(url, init))));
  vi.mocked(getSeason).mockResolvedValue({ media: [seasonal], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([{ media: [popular], pageInfo: { currentPage: 1, hasNextPage: false } }]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('schedules exactly one daily job', () => {
  expect(config.crons).toEqual([{ path: '/api/revalidate', schedule: '0 6 * * *' }]);
});
it.each(['', '?catalog=full', '?catalog=seasonal', '?catalog=invalid', '?catalog='])('protects every mode with CRON_SECRET: %s', async query => {
  for (const auth of ['', 'Bearer wrong']) expect((await GET(request(query, auth))).status).toBe(401);
  vi.stubEnv('CRON_SECRET', '');
  expect((await GET(request(query))).status).toBe(401);
  expect(getSeason).not.toHaveBeenCalled();
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
});
it.each(['full', 'seasonal'])('never crawls on an authenticated cold %s read', async catalog => {
  const response = await GET(request(`?catalog=${catalog}`));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(getSeason).not.toHaveBeenCalled();
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it('warms, primes seven-day HTTP entries, and reuses both catalogs without daily recrawls', async () => {
  expect(await (await GET(request())).json()).toMatchObject({ status: 'ok', seasonal: 1, popular: 1 });
  expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(SIMILAR_CATALOG_RESPONSE_TAG, 'max');
  expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
    'https://example.test/api/similar-catalog?catalog=full&cache=v3',
    'https://example.test/api/similar-catalog?catalog=seasonal&cache=v3',
  ]);
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 3]);
  expect((await GET(request())).status).toBe(200);
  expect(getSeason).toHaveBeenCalledTimes(2);
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
  expect(after).not.toHaveBeenCalled();
});
it('falls back to the cached season after a failed popular warm, without retrying from pages', async () => {
  vi.mocked(getPopularCatalogBatch).mockRejectedValueOnce(new Error('offline'));
  expect((await GET(request())).status).toBe(503);
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2]);
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
  expect(after).not.toHaveBeenCalled();
});
it('returns empty suggestions on a fully cold cache without scheduling any crawl', async () => {
  expect(await getSimilarAnime(source)).toEqual([]);
  expect(getSeason).not.toHaveBeenCalled(); expect(getPopularCatalogBatch).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});
it('awaits the authorized warm path and does not expire the shared data tags', async () => {
  vi.useFakeTimers();
  let finish!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getPopularCatalogBatch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let done = false;
  const pending = GET(request()).then(response => { done = true; return response; });
  await vi.advanceTimersByTimeAsync(22000);
  expect(done).toBe(false);
  finish([{ media: [popular], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  expect((await pending).status).toBe(200);
  expect(revalidateTag).toHaveBeenCalledExactlyOnceWith(SIMILAR_CATALOG_RESPONSE_TAG, 'max');
});
it('validates read mode without doing any work', async () => {
  expect((await GET(request('?catalog=invalid'))).status).toBe(400);
  expect(getSeason).not.toHaveBeenCalled();
});
