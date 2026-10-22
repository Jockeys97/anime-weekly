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
import { getDiscoveryCatalog, getGenreLists, getAiringThisWeekAnime, getSimilarAnime } from '@/lib/discovery-data';
import { formatWeek, isoWeek, weekRange } from '@/lib/week';

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

it('reads this week from the saved schedule, deduplicates titles and reuses the similarity catalog', async () => {
  const start = weekRange(isoWeek(now)).monday.getTime() / 1000;
  const event = (id: number, mediaId: number, airingAt = start, episode = 1) => ({ id, mediaId, airingAt, episode });
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [
    event(1, 2, start + 10), event(2, 1), event(3, 1, start + 20, 2),
    event(4, 3, start - 1), event(5, 4, start + 7 * 86400),
    event(6, 5, start, 0), event(7, 999), event(8, 6, NaN),
  ] });
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({
    media: season === 'fall' ? Array.from({ length: 6 }, (_, i) => ({ ...anime, id: i + 1 })) : [],
    pageInfo: { currentPage: page, hasNextPage: false },
  }));
  const [airing, similar] = await Promise.all([getAiringThisWeekAnime(), getSimilarAnime(anime)]);
  expect(airing.map(item => item.id)).toEqual([1, 2]);
  expect(similar.map(item => item.anime.id)).toEqual([2, 3, 4, 5, 6]);
  expect(readWeeklyRatingsSnapshot).toHaveBeenCalledWith(formatWeek(isoWeek(now)));
  expect(getSeason).toHaveBeenCalledTimes(2); // One shared crawl, no per-title lookups.
});

it('does not load the catalog or fetch a schedule when the weekly snapshot is cold', async () => {
  expect(await getAiringThisWeekAnime()).toEqual([]);
  expect(getSeason).not.toHaveBeenCalled();
});

it('qualifies MAL ratings by their exact store key even without a weekly snapshot or identity in provider values', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: { 'mal:101': stored({ malScore: 8.2, malScoredBy: 1000 }) }, sources: {} });
  const data = await getGenreLists();
  expect(data.lists[0].items.map(item => item.anime.id)).toEqual([1]);
  expect(data.lists[0].items[0].sources).toEqual([{ name: 'MyAnimeList', score: 8.2, votes: 1000, minimum: 1000 }]);
  expect(getSeason).toHaveBeenCalledTimes(2);
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

it('shares simultaneous cold crawls across requests and locales, with one upstream request at a time', async () => {
  let active = 0;
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => {
    expect(++active).toBe(1);
    await Promise.resolve();
    active--;
    return { media: season === 'fall' ? [anime] : [], pageInfo: { currentPage: page, hasNextPage: false } };
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => getDiscoveryCatalog()));
  expect(results.every(result => result[0].id === anime.id)).toBe(true);
  expect(getSeason).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getSeason).mock.calls.every(call => call[3]?.fresh === true)).toBe(true);
});

it('accepts a real season extending beyond ten pages without dropping previously collected titles', async () => {
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({
    media: season === 'fall' ? [{ ...anime, id: page }] : [],
    pageInfo: { currentPage: page, hasNextPage: season === 'fall' && page < 11 },
  }));
  expect((await getDiscoveryCatalog()).map(anime => anime.id)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
  expect(getSeason).toHaveBeenCalledTimes(12);
});

it('keeps a bounded pool at the safety limit instead of throwing all data away', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({
      media: season === 'fall' ? [{ ...anime, id: page }] : [],
      pageInfo: { currentPage: page, hasNextPage: season === 'fall' },
    }));
    const result = await getDiscoveryCatalog();
    expect(result).toHaveLength(40);
    expect(result.at(-1)?.id).toBe(40);
    expect(getSeason).toHaveBeenCalledTimes(41);
    expect(warn).toHaveBeenCalledWith('[discovery] Catalog pagination bounded', expect.objectContaining({ page: 40 }));
  } finally { warn.mockRestore(); }
});

it('stops a repeated-page upstream loop while preserving collected candidates', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({
      media: season === 'fall' ? [anime] : [], pageInfo: { currentPage: page, hasNextPage: season === 'fall' },
    }));
    expect(await getDiscoveryCatalog()).toEqual([anime]);
    expect(getSeason).toHaveBeenCalledTimes(3);
  } finally { warn.mockRestore(); }
});

it('does not cache an upstream outage as an empty success, and releases the failed shared crawl', async () => {
  vi.mocked(getSeason).mockResolvedValueOnce({ media: [], pageInfo: { currentPage: 1, hasNextPage: false }, unavailable: true });
  const failed = await Promise.allSettled([getDiscoveryCatalog(), getDiscoveryCatalog()]);
  expect(failed.every(result => result.status === 'rejected')).toBe(true);
  expect(getSeason).toHaveBeenCalledTimes(1);
  expect(await getDiscoveryCatalog()).toEqual([anime]);
  expect(getSeason).toHaveBeenCalledTimes(3);
});
