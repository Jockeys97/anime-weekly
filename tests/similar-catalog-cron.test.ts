import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import { clearNextCache, revalidateTag as expireLoaderTag } from './helpers/next-cache';
import { CACHE_TAG } from '@/lib/config';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => {
  const cache = await import('./helpers/next-cache');
  return { ...cache, revalidateTag: vi.fn(cache.revalidateTag) };
});
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));

import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { getPopularCatalogBatch, getSeason } from '@/lib/anilist';
import { getSimilarAnime, SIMILAR_CATALOG_TAG } from '@/lib/discovery-data';
import { GET } from '@/app/api/similar-catalog/route';
import config from '../vercel.json';

const source = { id: 1, genres: ['Action'], tags: [], format: 'TV', popularity: 1000, averageScore: 80, title: { romaji: 'Source' } } as unknown as AniListAnime;
const seasonalMatch = { ...source, id: 2, title: { romaji: 'Seasonal' } } as AniListAnime;
const popularMatch = { ...source, id: 3, title: { romaji: 'Popular' } } as AniListAnime;
const request = (auth?: string) => new Request('https://example.test/api/similar-catalog', { headers: auth ? { authorization: auth } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(revalidateTag).mockImplementation(tag => { expireLoaderTag(tag); });
  clearNextCache();
  vi.stubEnv('CRON_SECRET', 'test-secret');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://example.test');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => GET(new Request(url, init))));
  vi.mocked(getSeason).mockImplementation(async (_y, _s, page = 1) => ({ media: [seasonalMatch], pageInfo: { currentPage: page, hasNextPage: false } }));
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([{ media: [popularMatch], pageInfo: { currentPage: 1, hasNextPage: false } }]);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

// Model the page's separate fetch cache (the loader mock above deliberately
// treats even 'max' as a miss). Keep stale HTTP responses during TTL refresh,
// and apply both cron tag profiles to the tags actually supplied by the client.
function pageResponseCache() {
  const entries = new Map<string, { response: Response; written: number; ttl: number; tags: string[] }>();
  const pending = new Map<string, Promise<Response>>();
  const api = vi.fn(async (url: URL, init?: RequestInit) => GET(new Request(url, init)));
  vi.mocked(revalidateTag).mockImplementation((tag, profile) => {
    expireLoaderTag(tag);
    for (const [key, entry] of entries) if (entry.tags.includes(tag)) {
      if (typeof profile === 'object' && profile.expire === 0) entries.delete(key);
      else entry.written = -Infinity;
    }
  });
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit & { next: { revalidate: number; tags: string[] } }) => {
    const key = String(url);
    const entry = entries.get(key);
    if (entry && Date.now() - entry.written < entry.ttl) return entry.response.clone();
    let refresh = pending.get(key);
    if (!refresh) {
      refresh = api(url, init).then(response => {
        if (response.ok) entries.set(key, { response: response.clone(), written: Date.now(), ttl: init.next.revalidate * 1000, tags: init.next.tags });
        return response;
      }).finally(() => pending.delete(key));
      pending.set(key, refresh);
    }
    if (entry) { void refresh.catch(() => {}); return entry.response.clone(); }
    return (await refresh).clone();
  }));
  return { api, settled: () => Promise.allSettled([...pending.values()]) };
}

it('schedules the daily cron once a day after the 06:00 UTC revalidate cron', () => {
  expect(config.crons).toContainEqual({ path: '/api/similar-catalog', schedule: '0 7 * * *' });
  expect(config.crons).toContainEqual({ path: '/api/revalidate', schedule: '0 6 * * *' });
});

it('rejects requests without the cron secret', async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request('Bearer wrong'))).status).toBe(401);
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
  delete process.env.CRON_SECRET;
  expect((await GET(request('Bearer test-secret'))).status).toBe(401);
});

it('marks only the similar catalog stale and warms both catalogs', async () => {
  const response = await GET(request('Bearer test-secret'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', seasonal: 1, popular: 1 });
  expect(revalidateTag).toHaveBeenCalledWith(SIMILAR_CATALOG_TAG, 'max');
  expect(revalidateTag).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
    'https://example.test/api/similar-catalog?catalog=full&cache=v2',
    'https://example.test/api/similar-catalog?catalog=seasonal&cache=v2',
  ]);
  // The page's HTTP read reuses the writer's caches and includes the all-time
  // match, without starting a page-bundle AniList crawl.
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 3]);
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
  expect(getSeason).toHaveBeenCalledTimes(2);
});

it('primes cold page entries and serves the previous full catalog during and after both daily invalidations', async () => {
  vi.useFakeTimers();
  const http = pageResponseCache();
  expect((await GET(request('Bearer test-secret'))).status).toBe(200);
  expect(http.api).toHaveBeenCalledTimes(2); // no visitor needed to seed HTTP cache

  revalidateTag(CACHE_TAG, { expire: 0 }); // /api/revalidate at 06:00 UTC
  let finish!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getPopularCatalogBatch).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const cron = GET(request('Bearer test-secret')); // /api/similar-catalog at 07:00
  await vi.advanceTimersByTimeAsync(0);

  let ranked: number[] | undefined;
  const visit = getSimilarAnime(source).then(rows => { ranked = rows.map(row => row.anime.id); });
  await vi.advanceTimersByTimeAsync(0);
  expect(ranked).toEqual([2, 3]); // resolves without advancing the 4s page timer
  expect(after).not.toHaveBeenCalled();
  expect(http.api).toHaveBeenCalledTimes(2);
  finish([{ media: [{ ...popularMatch, id: 4 }], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  expect((await cron).status).toBe(200);
  await visit;
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 3]);
  expect(http.api).toHaveBeenCalledTimes(2);

  // At TTL expiry a slow API refill also leaves the previous full response
  // immediately available. Its successful completion publishes the new one.
  await vi.advanceTimersByTimeAsync(86400001);
  let respond!: (response: Response) => void;
  http.api.mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }));
  ranked = undefined;
  const staleVisit = getSimilarAnime(source).then(rows => { ranked = rows.map(row => row.anime.id); });
  await vi.advanceTimersByTimeAsync(0);
  expect(ranked).toEqual([2, 3]);
  respond(Response.json({ media: [seasonalMatch, { ...popularMatch, id: 4 }] }));
  await http.settled();
  await staleVisit;
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 4]);

  await vi.advanceTimersByTimeAsync(86400001);
  http.api.mockResolvedValueOnce(new Response(null, { status: 503 }));
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 4]);
  await http.settled();
  http.api.mockRejectedValueOnce(new Error('offline'));
  expect((await getSimilarAnime(source)).map(row => row.anime.id)).toEqual([2, 4]);
  await http.settled();
  expect(after).not.toHaveBeenCalled();
});

it('awaits the full crawl on the authorized warm path, even after the page timeout', async () => {
  vi.useFakeTimers();
  let finish!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getPopularCatalogBatch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  let done = false;
  const pending = GET(request('Bearer test-secret')).then(response => { done = true; return response; });
  await vi.advanceTimersByTimeAsync(22000);
  expect(done).toBe(false);
  expect(after).not.toHaveBeenCalled();
  finish([{ media: [popularMatch], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  const response = await pending;
  expect(await response.json()).toMatchObject({ status: 'ok', seasonal: 1, popular: 1, ms: 22000, popularMs: 22000, seasonalMs: 0 });
});

it.each(['full', 'seasonal', 'full&cache=v2', 'seasonal&cache=v2', 'invalid', ''])('rejects unauthorized %s reads before loading any catalog', async catalog => {
  for (const auth of [undefined, 'Bearer wrong']) {
    const response = await GET(new Request(`https://example.test/api/similar-catalog?catalog=${catalog}`, {
      headers: auth ? { authorization: auth } : {},
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
  }
  vi.stubEnv('CRON_SECRET', undefined);
  expect((await GET(new Request(`https://example.test/api/similar-catalog?catalog=${catalog}`, {
    headers: { authorization: 'Bearer test-secret' },
  }))).status).toBe(401);
  expect(getSeason).not.toHaveBeenCalled();
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});

it.each(['full', 'seasonal'])('serves authenticated %s reads without invalidation', async catalog => {
  const response = await GET(new Request(`https://example.test/api/similar-catalog?catalog=${catalog}`, {
    headers: { authorization: 'Bearer test-secret' },
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await response.json()).media.map((anime: AniListAnime) => anime.id)).toEqual(catalog === 'full' ? [3, 2] : [2]);
  expect(revalidateTag).not.toHaveBeenCalled();
  expect((await GET(new Request('https://example.test/api/similar-catalog?catalog=invalid', {
    headers: { authorization: 'Bearer test-secret' },
  }))).status).toBe(400);
});

it('fails soft with 503 when AniList is unavailable', async () => {
  vi.mocked(getPopularCatalogBatch).mockRejectedValue(new Error('down'));
  const response = await GET(request('Bearer test-secret'));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: 'failed' });
  expect(fetch).not.toHaveBeenCalled();
});

it('reports a failed warmup if the page HTTP entry cannot be primed', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  const response = await GET(request('Bearer test-secret'));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: 'failed' });
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
});

it('falls back to the seasonal catalog instead of waiting for a cold all-time crawl', async () => {
  vi.useFakeTimers();
  let finish!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getPopularCatalogBatch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = getSimilarAnime(source, 4000);
  await vi.advanceTimersByTimeAsync(4000);
  const ranked = await pending;
  expect(ranked.map(row => row.anime.id)).toEqual([2]);
  expect(after).toHaveBeenCalledOnce();
  finish([{ media: [popularMatch], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  const callback = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
  await callback();
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
});

it('bounds a cold seasonal fallback too and keeps the shared crawl alive without duplicates', async () => {
  vi.useFakeTimers();
  let finish!: (value: Awaited<ReturnType<typeof getSeason>>) => void;
  vi.mocked(getSeason).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = Promise.all([getSimilarAnime(source), getSimilarAnime({ ...source, id: 99 })]);
  await vi.advanceTimersByTimeAsync(4250);
  expect(await pending).toEqual([[], []]);
  expect(after).toHaveBeenCalledTimes(2);
  finish({ media: [seasonalMatch], pageInfo: { currentPage: 1, hasNextPage: false } });
  await Promise.all(vi.mocked(after).mock.calls.map(([callback]) => (callback as () => Promise<void>)()));
  expect(getSeason).toHaveBeenCalledTimes(2);
  expect(getPopularCatalogBatch).toHaveBeenCalledOnce();
});

it('can fall back outside a request scope', async () => {
  vi.useFakeTimers();
  vi.mocked(after).mockImplementationOnce(() => { throw new Error('`after` was called outside a request scope'); });
  let finish!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getPopularCatalogBatch).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = getSimilarAnime(source);
  await vi.advanceTimersByTimeAsync(4000);
  expect((await pending).map(row => row.anime.id)).toEqual([2]);
  finish([{ media: [popularMatch], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  await vi.advanceTimersByTimeAsync(0);
});
