import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));

import { revalidateTag } from 'next/cache';
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
  process.env.CRON_SECRET = 'test-secret';
  vi.mocked(getSeason).mockImplementation(async (_y, _s, page = 1) => ({ media: [seasonalMatch], pageInfo: { currentPage: page, hasNextPage: false } }));
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([{ media: [popularMatch], pageInfo: { currentPage: 1, hasNextPage: false } }]);
});
afterEach(() => { vi.useRealTimers(); delete process.env.CRON_SECRET; });

it('schedules the daily cron once a day after the 06:00 UTC revalidate cron', () => {
  expect(config.crons).toContainEqual({ path: '/api/similar-catalog', schedule: '0 7 * * *' });
  expect(config.crons).toContainEqual({ path: '/api/revalidate', schedule: '0 6 * * *' });
});

it('rejects requests without the cron secret', async () => {
  expect((await GET(request())).status).toBe(401);
  expect((await GET(request('Bearer wrong'))).status).toBe(401);
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
});

it('marks only the similar catalog stale and warms both catalogs', async () => {
  const response = await GET(request('Bearer test-secret'));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok', seasonal: 1, popular: 1 });
  expect(revalidateTag).toHaveBeenCalledWith(SIMILAR_CATALOG_TAG, 'max');
  expect(revalidateTag).toHaveBeenCalledTimes(1);
});

it('fails soft with 503 when AniList is unavailable', async () => {
  vi.mocked(getPopularCatalogBatch).mockRejectedValue(new Error('down'));
  const response = await GET(request('Bearer test-secret'));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: 'failed' });
});

it('falls back to the seasonal catalog instead of waiting for a cold all-time crawl', async () => {
  vi.useFakeTimers();
  vi.mocked(getPopularCatalogBatch).mockReturnValue(new Promise(() => {}));
  const pending = getSimilarAnime(source, 4000);
  await vi.advanceTimersByTimeAsync(4000);
  const ranked = await pending;
  expect(ranked.map(row => row.anime.id)).toEqual([2]);
});
