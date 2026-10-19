import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => {
  const cache = await import('./helpers/next-cache');
  return { ...cache, revalidateTag: vi.fn(cache.revalidateTag) };
});
vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  get: vi.fn(), head: vi.fn(), put: vi.fn(), list: vi.fn(),
}));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn(), WEEKLY_PAGE_TAG: 'weekly-page-output' }));
vi.mock('../lib/weekly-enrichment', () => ({ getWeeklyCalendarSchedule: vi.fn() }));
vi.mock('../lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
import { BlobNotFoundError, get, head, list, put, type ListBlobResultBlob } from '@vercel/blob';
import { revalidateTag } from 'next/cache';
import { getQuickWeekData } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { getWeeklyCalendarSchedule } from '../lib/weekly-enrichment';
import { readRatingsStore } from '../lib/ratings-store';
import { clearNextCache } from './helpers/next-cache';
import { isClosedWeek, listArchivedWeeks, readWeekArchive, writeWeekArchive, WEEK_ARCHIVE_TAG, WEEK_ARCHIVE_LIST_TAG, type WeekArchive } from '../lib/week-archive';

const week = { year: 2026, week: 41 };
const data: WeekArchive['data'] = { status: 'ready', titles: [{ id: 1, kind: 'tv', name: 'Saved title', overview: 'Base English story', poster: null, releaseDate: null, genres: ['Action'], ratings: {}, providers: {}, providersUnavailable: false, recommendation: null }] };
const ratings: WeekArchive['ratings'] = {
  titles: { 'tv:1': { anilistId: 123, imdbRating: '8.1', malScore: 8.2 } },
  events: [{ id: 1, mediaId: 123, episode: 2, airingAt: 1791450000 }],
  availability: { titles: { 'tv:1': { countries: { IT: [8] }, fetchedAt: 123 } }, providers: { 8: { name: 'Netflix', logo: null } } },
  episodes: { entries: [], status: 'ready' },
};
const calendar: WeekArchive['calendar'] = { events: ratings.events, episodeDates: [{ seriesId: 1, season: 1, episode: 2, date: '2026-10-08' }], anilistIds: { 'tv:1': 123 }, unavailable: false };
const archive: WeekArchive = { version: 1, week: '2026-41', language: 'en', savedAt: '2026-10-12T06:00:00Z', titleCount: 1, data, ratings, calendar };
function blobResult(value: unknown = archive) {
  return { statusCode: 200 as const, stream: new Response(JSON.stringify(value)).body!, headers: new Headers(), blob: { url: 'https://example.private.blob.vercel-storage.com/weeks/2026-41.json', downloadUrl: '', pathname: 'weeks/2026-41.json', contentType: 'application/json', contentDisposition: '', cacheControl: '', uploadedAt: new Date(archive.savedAt), etag: '', size: 100 } };
}
function listed(pathname: string, uploadedAt = '2026-10-12T06:01:00Z'): ListBlobResultBlob {
  return { pathname, uploadedAt: new Date(uploadedAt), url: `https://example.private.blob.vercel-storage.com/${pathname}`, downloadUrl: '', size: 100, etag: 'fixture-etag' };
}
beforeEach(() => {
  clearNextCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
  vi.mocked(get).mockImplementation(async () => blobResult());
  vi.mocked(getQuickWeekData).mockResolvedValue(data);
  vi.mocked(getWeeklyRatings).mockResolvedValue(ratings);
  vi.mocked(getWeeklyCalendarSchedule).mockResolvedValue(calendar);
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('does no Blob or upstream work when the local token is missing, including whitespace', async () => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', ' ');
  expect(await readWeekArchive(week)).toBeNull();
  expect(await listArchivedWeeks()).toEqual([]);
  expect(await writeWeekArchive(week)).toEqual({ week: '2026-41', status: 'disabled' });
  for (const operation of [head, get, put, list, getQuickWeekData, getWeeklyRatings, getWeeklyCalendarSchedule]) expect(operation).not.toHaveBeenCalled();
});
it('uses UTC ISO weeks at both Monday and year boundaries', async () => {
  expect(isClosedWeek({ year: 2025, week: 52 }, new Date('2025-12-28T23:59:59Z'))).toBe(false);
  expect(isClosedWeek({ year: 2025, week: 52 }, new Date('2025-12-29T00:00:00Z'))).toBe(true);
  expect(isClosedWeek({ year: 2026, week: 1 }, new Date('2026-01-01T12:00:00Z'))).toBe(false);
  expect(isClosedWeek({ year: 2026, week: 53 })).toBe(false);
  for (const value of [{ year: 2026, week: 42 }, { year: 2026, week: 43 }, { year: 2025, week: 53 }]) {
    expect(await readWeekArchive(value)).toBeNull();
    await expect(writeWeekArchive(value)).rejects.toThrow('Only closed ISO weeks');
  }
  expect(head).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
});
it('writes one deterministic private versioned snapshot with all offline rendering inputs', async () => {
  expect(await writeWeekArchive(week)).toEqual({ week: '2026-41', status: 'written', titleCount: 1 });
  expect(head).toHaveBeenCalledWith('weeks/2026-41.json', expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
  const [key, body, options] = vi.mocked(put).mock.calls[0];
  expect(key).toBe('weeks/2026-41.json');
  expect(JSON.parse(body as string)).toEqual({ ...archive, savedAt: new Date().toISOString() });
  expect(options).toMatchObject({ access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' });
  expect(getQuickWeekData).toHaveBeenCalledExactlyOnceWith(week, 'en');
  expect(getWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-41');
  expect(getWeeklyCalendarSchedule).toHaveBeenCalledExactlyOnceWith('2026-41', { catalog: data, snapshot: ratings });
  expect(revalidateTag).toHaveBeenCalledWith('week-archive:2026-41', { expire: 0 });
  expect(revalidateTag).toHaveBeenCalledWith(WEEK_ARCHIVE_LIST_TAG, { expire: 0 });
  expect(revalidateTag).not.toHaveBeenCalledWith(WEEK_ARCHIVE_TAG, expect.anything());
  expect(list).not.toHaveBeenCalled();
});
it('checks head before loaders and never overwrites a saved week', async () => {
  vi.mocked(head).mockResolvedValue({} as Awaited<ReturnType<typeof head>>);
  expect(await writeWeekArchive(week)).toEqual({ week: '2026-41', status: 'exists' });
  for (const operation of [put, list, getQuickWeekData, getWeeklyRatings, getWeeklyCalendarSchedule, revalidateTag]) expect(operation).not.toHaveBeenCalled();
});
it('preserves captured closed-week values and fills missing fields from the existing store without rating APIs', async () => {
  const captured: WeekArchive['ratings'] = { titles: { 'tv:1': { imdbRating: '7.5' } }, events: ratings.events };
  vi.mocked(readRatingsStore).mockResolvedValue({
    sources: { 'tv:1': { anilistId: 123, imdbId: 'tt123', fetchedAt: 1, lastSeenAt: 2 } },
    ratings: {
      'anilist:123': { values: { anilistScore: 81 }, fetchedAt: 1, lastSeenAt: 2 },
      'imdb:tt123': { values: { imdbRating: '9.9', imdbVotes: '123' }, fetchedAt: 1, lastSeenAt: 2 },
    },
    availability: { titles: { 'tv:1': { countries: { IT: [8] }, fetchedAt: 123, lastSeenAt: 2 } }, providers: ratings.availability!.providers },
  });
  expect((await writeWeekArchive(week, captured)).status).toBe('written');
  const payload = JSON.parse(vi.mocked(put).mock.calls[0][1] as string);
  expect(payload.ratings.titles['tv:1']).toEqual({ anilistId: 123, imdbId: 'tt123', imdbRating: '7.5', imdbVotes: '123', anilistScore: 81 });
  expect(payload.ratings.events).toEqual(captured.events);
  expect(payload.ratings.availability).toEqual(ratings.availability);
  expect(getWeeklyRatings).not.toHaveBeenCalled();
  expect(getWeeklyCalendarSchedule).toHaveBeenCalledWith('2026-41', { catalog: data, snapshot: payload.ratings });
  expect(captured).toEqual({ titles: { 'tv:1': { imdbRating: '7.5' } }, events: ratings.events });
});
it.each([{ status: 'ready' as const, titles: [] }, { status: 'error' as const, titles: [] }])('never writes or lists an empty catalog: %j', async value => {
  vi.mocked(getQuickWeekData).mockResolvedValue(value);
  expect((await writeWeekArchive(week)).status).toBe('empty');
  expect(put).not.toHaveBeenCalled(); expect(getWeeklyCalendarSchedule).not.toHaveBeenCalled();
});
it('retries partial discovery on a later cron instead of freezing it permanently', async () => {
  vi.mocked(getQuickWeekData).mockResolvedValue({ ...data, partial: true });
  expect((await writeWeekArchive(week)).status).toBe('failed');
  expect(put).not.toHaveBeenCalled();
});
it('does not mistake an authentication failure for an absent archive', async () => {
  vi.mocked(head).mockRejectedValue(new Error('Forbidden'));
  expect((await writeWeekArchive(week)).status).toBe('failed');
  expect(getQuickWeekData).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
});
it('logs a failed upload without invalidating valid caches', async () => {
  vi.mocked(put).mockRejectedValue(new Error('Storage unavailable'));
  expect((await writeWeekArchive(week)).status).toBe('failed');
  expect(console.error).toHaveBeenCalled(); expect(revalidateTag).not.toHaveBeenCalled();
});
it('caches private reads across page requests and invalidates a cached miss after writing', async () => {
  vi.mocked(get).mockResolvedValueOnce(null);
  expect(await readWeekArchive(week)).toBeNull();
  expect(await readWeekArchive(week)).toBeNull();
  expect(get).toHaveBeenCalledTimes(1);
  await writeWeekArchive(week);
  expect(await readWeekArchive(week)).toEqual(archive);
  expect(await readWeekArchive(week)).toEqual(archive);
  expect(get).toHaveBeenCalledTimes(2);
  expect(get).toHaveBeenCalledWith('weeks/2026-41.json', expect.objectContaining({ access: 'private' }));
});
it('does not cache transient read failures', async () => {
  vi.mocked(get).mockRejectedValueOnce(new Error('Timeout'));
  expect(await readWeekArchive(week)).toBeNull();
  expect(await readWeekArchive(week)).toEqual(archive);
  expect(get).toHaveBeenCalledTimes(2);
});
it.each([{ ...archive, version: 2 }, { ...archive, week: '2026-40' }, { ...archive, titleCount: 0 }, { ...archive, calendar: null }, { ...archive, ratings: null }, { ...archive, data: { status: 'ready', titles: [] } }])('rejects incompatible or incomplete payloads', async value => {
  vi.mocked(get).mockResolvedValueOnce(blobResult(value));
  expect(await readWeekArchive(week)).toBeNull();
});
it('paginates the daily list and includes only closed, valid, non-empty snapshots with Blob upload dates', async () => {
  vi.mocked(list).mockResolvedValueOnce({ blobs: [listed('weeks/2026-41.json'), listed('weeks/2026-42.json'), listed('weeks/2025-53.json'), listed('weeks/readme.txt')], hasMore: true, cursor: 'next' })
    .mockResolvedValueOnce({ blobs: [listed('weeks/2026-40.json')], hasMore: false });
  vi.mocked(get).mockImplementation(async (key: string) => blobResult(key === 'weeks/2026-41.json' ? archive : { ...archive, week: '2026-40', titleCount: 0 }));
  expect(await listArchivedWeeks()).toEqual([{ week: '2026-41', titleCount: 1, uploadedAt: '2026-10-12T06:01:00.000Z' }]);
  await listArchivedWeeks();
  expect(list).toHaveBeenCalledTimes(2); expect(get).toHaveBeenCalledTimes(2);
  expect(list).toHaveBeenNthCalledWith(2, expect.objectContaining({ prefix: 'weeks/', limit: 1000, cursor: 'next' }));
  expect(await readWeekArchive(week)).toEqual(archive);
  expect(get).toHaveBeenCalledTimes(2);
});
it('recovers a failed listing on the next call', async () => {
  vi.mocked(list).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce({ blobs: [], hasMore: false });
  expect(await listArchivedWeeks()).toEqual([]); expect(await listArchivedWeeks()).toEqual([]);
  expect(list).toHaveBeenCalledTimes(2);
});
