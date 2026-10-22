import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import type { RatingsStore } from '@/lib/ratings-store';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn() }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));

import { getSeason } from '@/lib/anilist';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { getGenreLists } from '@/lib/discovery-data';

const now = new Date('2026-10-21T12:00:00Z');
const anime = { id: 1, idMal: 101, season: 'FALL', seasonYear: 2026, genres: ['Action'], averageScore: 85 } as AniListAnime;
const stored = (values: RatingsStore['ratings'][string]['values'], ageDays = 0) => ({ values, fetchedAt: now.getTime() - ageDays * 86400000, lastSeenAt: now.getTime() });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({ media: season === 'fall' ? [anime] : [], pageInfo: { currentPage: page, hasNextPage: false } }));
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
});
afterEach(() => vi.useRealTimers());

it('qualifies MAL ratings by their exact store key even without a weekly snapshot or identity in provider values', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: { 'mal:101': stored({ malScore: 8.2, malScoredBy: 1000 }) }, sources: {} });
  const data = await getGenreLists();
  expect(data.lists[0].items.map(item => item.anime.id)).toEqual([1]);
  expect(data.lists[0].items[0].sources).toEqual([{ name: 'MyAnimeList', score: 8.2, votes: 1000, minimum: 1000 }]);
  expect(getSeason).toHaveBeenCalledTimes(2);
});

it('keeps cold, stale, low-vote and unrelated MAL scores out of genre lists', async () => {
  const stores: RatingsStore['ratings'][] = [{}, { 'mal:101': stored({ malScore: 9, malScoredBy: 1000 }, 121) }, { 'mal:101': stored({ malScore: 9, malScoredBy: 999 }) }, { 'mal:999': stored({ malScore: 9, malScoredBy: 1000 }) }];
  for (const ratings of stores) {
    vi.mocked(readRatingsStore).mockResolvedValue({ ratings, sources: {} });
    expect((await getGenreLists()).lists[0].items).toEqual([]);
  }
});
