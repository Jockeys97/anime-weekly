import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ WEEKLY_PAGE_TAG: 'weekly-page-output', primeWeeklyRatings: vi.fn(), readWeeklyRatingsSnapshot: vi.fn(), isWeeklyRatingComplete: (rating: { malScore?: number; anilistScore?: number; imdbRating?: string }) => rating.malScore != null && rating.anilistScore != null && Boolean(rating.imdbRating) }));
import { revalidatePath, revalidateTag } from 'next/cache';
import { primeWeeklyRatings, readWeeklyRatingsSnapshot } from '../lib/weekly-ratings';
import { GET, maxDuration } from '../app/api/revalidate/route';
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
it('requires the existing cron secret before doing work', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  expect((await GET(new Request('https://example.test/api/revalidate'))).status).toBe(401);
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it('warms combined ratings within Hobby limits and invalidates HTML without expiring the new snapshot', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ total: 1, titles: { 'tv:1': { anilistId: 123, anilistScore: 81, malScore: 8, imdbRating: '8.1' } }, events: [] });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revalidated: true, total: 1, populated: 1, unavailable: 0, complete: true });
  expect(maxDuration).toBe(300);
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(revalidateTag).toHaveBeenNthCalledWith(1, 'anime-week', { expire: 0 });
  expect(revalidateTag).toHaveBeenNthCalledWith(2, 'weekly-page-output', { expire: 0 });
});
it('keeps public snapshot reads independent of authentication and provider work', async () => {
  const snapshot = { titles: { 'tv:1': { malScore: 8 } }, events: [] };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(snapshot);
  const response = await GET(new Request('https://example.test/api/revalidate?ratings=2026-42'));
  expect(await response.json()).toEqual(snapshot);
  expect(response.headers.get('cache-control')).toBe('public, s-maxage=300');
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it('reports incomplete snapshots including titles omitted by the job budget', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, events: [] };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ ...previous, total: 3 });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ total: 3, populated: 1, unavailable: 2, complete: false });
  expect(primeWeeklyRatings).toHaveBeenCalledWith(expect.any(String), previous);
  expect(revalidateTag).toHaveBeenCalledTimes(2);
});
