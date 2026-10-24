import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('@vercel/blob', () => ({ BlobNotFoundError: class extends Error {}, get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), getPopularCatalogBatch: vi.fn(), animeName: (a: { title: { english: string } }) => a.title.english }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn(async () => ({ ratings: {}, sources: {} })) }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn(async () => ({ titles: {}, events: [] })) }));
import { get, put } from '@vercel/blob';
import { getSeason, getPopularCatalogBatch } from '@/lib/anilist';
import { clearNextCache } from './helpers/next-cache';
import { anime, blobResult, snapshot } from './fixtures/anilist-snapshot';
import { warmSimilarCatalogs } from '@/lib/similar-catalog-store';
import { getSeasonWithSnapshot } from '@/lib/anilist-resilient';
import { getTierListData } from '@/lib/tier-list-data';
import { readRatingsStore } from '@/lib/ratings-store';
import { getGenreLists } from '@/lib/discovery-data';
const files = new Map<string, unknown>();
const currentKey = 'anilist/seasons/2026-fall.json';
beforeEach(() => {
  vi.resetAllMocks(); clearNextCache(); files.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T06:00:00Z'));
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
  vi.mocked(get).mockImplementation(async key => files.has(key) ? blobResult(files.get(key)) : null);
  vi.mocked(put).mockImplementation(async (key, body) => { files.set(key, JSON.parse(body as string)); return {} as Awaited<ReturnType<typeof put>>; });
  vi.mocked(getSeason).mockImplementation(async (year, season, page = 1) => ({ media: [{ ...anime, seasonYear: year, season: season.toUpperCase() }], pageInfo: { currentPage: page, hasNextPage: false } }));
  vi.mocked(getPopularCatalogBatch).mockResolvedValue([{ media: [], pageInfo: { currentPage: 1, hasNextPage: false } }]);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('HTTP catalog offline')));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('daily warm persists complete seasons, then all three views survive a cold framework cache and offline APIs', async () => {
  await warmSimilarCatalogs();
  expect(files.has(currentKey)).toBe(true);
  expect(getSeason).toHaveBeenCalledTimes(2); // no second seasonal crawl
  clearNextCache(); vi.mocked(getSeason).mockClear();
  vi.mocked(getSeason).mockRejectedValue(new Error('AniList offline'));
  expect((await getSeasonWithSnapshot(2026, 'fall')).media.map(a => a.id)).toEqual([21]);
  expect((await getTierListData({ year: 2026, season: 'fall' })).items.map(a => a.id)).toEqual([21]);
  expect((await getGenreLists()).lists.find(list => list.genre === 'Action')?.items).toHaveLength(1);
  expect(getSeason).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it('next morning failure and cache eviction retain yesterday in every view, without replacing it with partial pages', async () => {
  await warmSimilarCatalogs();
  const saved = files.get(currentKey);
  vi.setSystemTime(new Date('2026-10-25T06:00:00Z')); clearNextCache();
  vi.mocked(getSeason).mockResolvedValue({ media: [], unavailable: true, pageInfo: { currentPage: 1, hasNextPage: false } });
  await warmSimilarCatalogs();
  expect(files.get(currentKey)).toEqual(saved);
  clearNextCache(); vi.mocked(getSeason).mockClear();
  expect((await getSeasonWithSnapshot(2026, 'fall')).media).toHaveLength(1);
  expect((await getTierListData({ year: 2026, season: 'fall' })).unavailable).toBe(false);
  expect((await getGenreLists()).media).toHaveLength(1);
  expect(getSeason).not.toHaveBeenCalled();
});
it('refreshes on a new UTC day even if yesterday is less than 24 hours old; repeated same-day warm does not recrawl', async () => {
  await warmSimilarCatalogs();
  await warmSimilarCatalogs();
  expect(getSeason).toHaveBeenCalledTimes(2);
  vi.setSystemTime(new Date('2026-10-25T05:00:00Z')); clearNextCache();
  await warmSimilarCatalogs();
  expect(getSeason).toHaveBeenCalledTimes(4);
});
it('an unrelated popular-catalog failure cannot lose the newly saved seasonal catalog', async () => {
  vi.mocked(getPopularCatalogBatch).mockRejectedValue(new Error('Popular offline'));
  await expect(warmSimilarCatalogs()).rejects.toThrow('Popular offline');
  clearNextCache();
  expect((await getTierListData({ year: 2026, season: 'fall' })).items).toHaveLength(1);
  expect((await getGenreLists()).media).toHaveLength(1);
});
it('a stored season is served without consulting the live API, regardless of snapshot age', async () => {
  files.set(currentKey, snapshot);
  expect((await getSeasonWithSnapshot(2026, 'fall')).media).toEqual([anime]);
  expect(getSeason).not.toHaveBeenCalled();
});

it('does not hold genre lists behind a stalled optional ratings store', async () => {
  files.set(currentKey, snapshot);
  vi.mocked(readRatingsStore).mockReturnValue(new Promise(() => {}));
  const pending = getGenreLists();
  await vi.advanceTimersByTimeAsync(1500);
  expect((await pending).lists[0].items).toHaveLength(1);
});
