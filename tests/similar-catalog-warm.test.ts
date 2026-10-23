import { afterEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
vi.mock('server-only', () => ({}));
// Model a stale Next read: start the loader, immediately return old data, and
// retain that old data if the background loader fails.
vi.mock('next/cache', () => ({ unstable_cache: (loader: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => {
  void loader(...args).catch(() => {});
  return Promise.resolve([]);
} }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));
import { getSeason, getPopularCatalogBatch } from '@/lib/anilist';
import { warmSimilarCatalogs } from '@/lib/similar-catalog-store';

afterEach(() => vi.useRealTimers());

it('awaits fresh seasonal and popular loaders even when unstable_cache returns stale immediately', async () => {
  vi.useFakeTimers();
  const anime = { id: 2 } as AniListAnime;
  let finishSeason!: (value: Awaited<ReturnType<typeof getSeason>>) => void;
  let finishPopular!: (value: Awaited<ReturnType<typeof getPopularCatalogBatch>>) => void;
  vi.mocked(getSeason).mockImplementationOnce(() => new Promise(resolve => { finishSeason = resolve; }))
    .mockResolvedValue({ media: [anime], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getPopularCatalogBatch).mockImplementationOnce(() => new Promise(resolve => { finishPopular = resolve; }));
  let done = false;
  const pending = warmSimilarCatalogs().then(result => { done = true; return result; });
  await vi.advanceTimersByTimeAsync(4000);
  expect(done).toBe(false);
  expect(getPopularCatalogBatch).not.toHaveBeenCalled();
  finishSeason({ media: [anime], pageInfo: { currentPage: 1, hasNextPage: false } });
  await vi.advanceTimersByTimeAsync(4000);
  expect(done).toBe(false);
  finishPopular([{ media: [{ ...anime, id: 3 }], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  expect(await pending).toEqual({ seasonal: 1, popular: 1, seasonalMs: 4000, popularMs: 4000 });
});
