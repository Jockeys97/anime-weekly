vi.mock('@/lib/anilist-snapshot', () => ({ readAniListSnapshotSeason: vi.fn(async () => null), snapshotHealth: vi.fn(), refreshAniListSnapshot: vi.fn() }));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/similar-catalog-client', () => ({ readSharedSimilarCatalog: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn(), animeName: (anime: { title: { english: string } }) => anime.title.english }));
import { getTierListData } from '../lib/tier-list-data';
import { getSeason, type AniListAnime } from '../lib/anilist';
import { readSharedSimilarCatalog } from '../lib/similar-catalog-client';
const season = { year: 2026, season: 'fall' } as const;
const anime = (id: number, extra: Partial<AniListAnime> = {}) => ({ id, title: { english: `Anime ${id}` }, seasonYear: 2026, season: 'FALL', format: 'TV', popularity: id,
  coverImage: { large: 'https://s4.anilist.co/small.jpg', extraLarge: 'https://s4.anilist.co/large.jpg' }, ...extra } as AniListAnime);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(readSharedSimilarCatalog).mockResolvedValue([]); });
afterEach(() => vi.useRealTimers());
it('uses the daily cached season without upstream pagination and keeps the large export cover', async () => {
  vi.mocked(readSharedSimilarCatalog).mockResolvedValue([anime(1), anime(3), anime(1), anime(2, { season: 'SUMMER' }), anime(4, { seasonYear: 2025 }), anime(5, { format: 'MUSIC' }), anime(6, { isAdult: true })]);
  const result = await getTierListData(season);
  expect(result.items.map(item => item.id)).toEqual([3, 1]);
  expect(result.items[0]).toMatchObject({ poster: 'https://s4.anilist.co/small.jpg', exportPoster: 'https://s4.anilist.co/large.jpg' });
  expect(result.unavailable).toBe(false);
  expect(getSeason).not.toHaveBeenCalled();
});
it('falls back to cached exact-season pagination when the shared catalog is absent', async () => {
  vi.mocked(getSeason).mockResolvedValueOnce({ media: [anime(1), anime(99, { isAdult: true })], pageInfo: { currentPage: 1, hasNextPage: true } })
    .mockResolvedValueOnce({ media: [anime(2)], pageInfo: { currentPage: 2, hasNextPage: false } });
  const result = await getTierListData(season);
  expect(result.items.map(item => item.id)).toEqual([2, 1]);
  expect(getSeason).toHaveBeenNthCalledWith(1, 2026, 'fall', 1, expect.objectContaining({ maxWaitMs: expect.any(Number) }));
  expect(getSeason).toHaveBeenCalledTimes(2);
});
it('settles within one deadline when both the cache and upstream stall', async () => {
  vi.useFakeTimers();
  vi.mocked(readSharedSimilarCatalog).mockReturnValue(new Promise(() => {}));
  vi.mocked(getSeason).mockReturnValue(new Promise(() => {}));
  const result = getTierListData(season);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toEqual({ items: [], unavailable: true });
  expect(getSeason).toHaveBeenCalledTimes(1);
  expect(getSeason).toHaveBeenCalledWith(2026, 'fall', 1, { maxWaitMs: 6500 });
  await vi.advanceTimersByTimeAsync(30000);
  expect(getSeason).toHaveBeenCalledTimes(1);
});
it('does not mount a partial board when a later page fails, protecting saved placements', async () => {
  vi.mocked(getSeason).mockResolvedValueOnce({ media: [anime(1)], pageInfo: { currentPage: 1, hasNextPage: true } })
    .mockResolvedValueOnce({ media: [], unavailable: true, pageInfo: { currentPage: 2, hasNextPage: false } });
  expect(await getTierListData(season)).toEqual({ items: [], unavailable: true });
});
it('keeps a confirmed empty season distinct from a failed lookup', async () => {
  vi.mocked(getSeason).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
  expect(await getTierListData(season)).toEqual({ items: [], unavailable: false });
});
