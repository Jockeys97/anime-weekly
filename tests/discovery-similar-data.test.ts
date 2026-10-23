import { beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import { clearNextCache } from './helpers/next-cache';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('@/lib/similar-catalog-client', async original => ({ ...await original<typeof import('@/lib/similar-catalog-client')>(), readSharedSimilarCatalog: async (mode: string) => {
  const local = await import('@/lib/discovery-data');
  return mode === 'full' ? local.getSimilarCatalog() : local.getDiscoveryCatalog();
} }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));

import { getPopularCatalogBatch, getSeason } from '@/lib/anilist';
import { getDiscoveryCatalog, getSimilarAnime } from '@/lib/discovery-data';
const anime = (id: number) => ({ id, genres: ['Action'], title: { english: `Anime ${id}` } }) as AniListAnime;
const page = (media: AniListAnime[], currentPage = 1, hasNextPage = true) => ({ media, pageInfo: { currentPage, hasNextPage } });
beforeEach(() => {
  clearNextCache(); vi.clearAllMocks();
  vi.mocked(getSeason).mockResolvedValue(page([anime(1000)], 1, false));
  vi.mocked(getPopularCatalogBatch).mockImplementation(async first => [page([anime(first)], first), page([anime(first + 1)], first + 1)]);
});

it('shares one paced five-batch all-time crawl across pages, without changing the seasonal catalog', async () => {
  let active = 0;
  vi.mocked(getPopularCatalogBatch).mockImplementation(async first => {
    expect(++active).toBe(1); await Promise.resolve(); active--;
    return [page([anime(first)], first), page([anime(first + 1)], first + 1)];
  });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => getSimilarAnime(anime(2000 + i))));
  expect(results.every(rows => rows.length === 11)).toBe(true);
  expect(vi.mocked(getPopularCatalogBatch).mock.calls.map(([first]) => first)).toEqual([1, 3, 5, 7, 9]);
  expect(getSeason).toHaveBeenCalledTimes(2);
  expect(await getDiscoveryCatalog()).toEqual([anime(1000)]);
  await getSimilarAnime(anime(9999));
  expect(getPopularCatalogBatch).toHaveBeenCalledTimes(5);
});

it('does not cache partial all-time crawls on failure and retries without recrawling seasons', async () => {
  vi.mocked(getPopularCatalogBatch).mockRejectedValueOnce(new Error('AniList unavailable'));
  const failed = await Promise.allSettled([getSimilarAnime(anime(1)), getSimilarAnime(anime(2))]);
  expect(failed.every(result => result.status === 'rejected')).toBe(true);
  expect(getPopularCatalogBatch).toHaveBeenCalledTimes(1);
  expect(await getSimilarAnime(anime(9999))).toHaveLength(11);
  expect(getPopularCatalogBatch).toHaveBeenCalledTimes(6);
  expect(getSeason).toHaveBeenCalledTimes(2);
});

it('stops at the actual catalog end and deduplicates popular/seasonal candidates', async () => {
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([page([anime(1000)]), page([anime(10)], 2, false)]);
  expect((await getSimilarAnime(anime(9999))).map(row => row.anime.id)).toEqual([10, 1000]);
  expect(getPopularCatalogBatch).toHaveBeenCalledTimes(1);
});
