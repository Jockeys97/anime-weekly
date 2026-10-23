import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import type { RatingsStore } from '@/lib/ratings-store';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/similar-catalog-client', () => ({ readSharedSimilarCatalog: vi.fn() }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));

import { getPopularCatalogBatch, getSeason } from '@/lib/anilist';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { readSharedSimilarCatalog } from '@/lib/similar-catalog-client';
import { getGenreLists, getSimilarAnime } from '@/lib/discovery-data';

const now = new Date('2026-10-21T12:00:00Z');
const anime = { id: 1, idMal: 101, season: 'FALL', seasonYear: 2026, genres: ['Action'], averageScore: 85 } as AniListAnime;
const stored = (values: RatingsStore['ratings'][string]['values'], ageDays = 0) => ({ values, fetchedAt: now.getTime() - ageDays * 86400000, lastSeenAt: now.getTime() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([{ media: [], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({ media: season === 'fall' ? [anime] : [], pageInfo: { currentPage: page, hasNextPage: false } }));
  vi.mocked(readSharedSimilarCatalog).mockResolvedValue([anime]);
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
});
afterEach(() => vi.useRealTimers());

it('ranks similar titles from the shared catalog without loading the weekly schedule', async () => {
  vi.mocked(readSharedSimilarCatalog).mockResolvedValue(Array.from({ length: 6 }, (_, i) => ({ ...anime, id: i + 1 })));
  const similar = await getSimilarAnime(anime);
  expect(similar.map(item => item.anime.id)).toEqual([2, 3, 4, 5, 6]);
  expect(readWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(getSeason).not.toHaveBeenCalled();
});

it('qualifies MAL ratings by their exact store key even without a weekly snapshot or identity in provider values', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: { 'mal:101': stored({ malScore: 8.2, malScoredBy: 1000 }) }, sources: {} });
  const data = await getGenreLists();
  expect(data.lists[0].items.map(item => item.anime.id)).toEqual([1]);
  expect(data.lists[0].items[0].sources).toEqual([{ name: 'MyAnimeList', score: 8.2, votes: 1000, minimum: 1000 }]);
  expect(getSeason).not.toHaveBeenCalled();
});

it('falls back to the catalog score for cold, stale, low-vote and unrelated MAL ratings', async () => {
  const stores: RatingsStore['ratings'][] = [{}, { 'mal:101': stored({ malScore: 9, malScoredBy: 1000 }, 121) }, { 'mal:101': stored({ malScore: 9, malScoredBy: 999 }) }, { 'mal:999': stored({ malScore: 9, malScoredBy: 1000 }) }];
  for (const ratings of stores) {
    vi.mocked(readRatingsStore).mockResolvedValue({ ratings, sources: {} });
    const items = (await getGenreLists()).lists[0].items;
    expect(items.map(item => item.anime.id)).toEqual([1]);
    expect(items[0].sources).toEqual([{ name: 'AniList', score: 8.5, votes: 0, minimum: 0 }]);
  }
});
