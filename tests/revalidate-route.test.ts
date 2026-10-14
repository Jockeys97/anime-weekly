import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ WEEKLY_PAGE_TAG: 'weekly-page-output', primeWeeklyRatings: vi.fn() }));
import { revalidatePath, revalidateTag } from 'next/cache';
import { primeWeeklyRatings } from '../lib/weekly-ratings';
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
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ titles: { 'tv:1': { anilistId: 123, malScore: 8, imdbRating: '8.1' } }, events: [] });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revalidated: true, populated: 1 });
  expect(maxDuration).toBe(300);
  // Path invalidation would also stale the ratings snapshot just populated.
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(vi.mocked(revalidateTag).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(primeWeeklyRatings).mock.invocationCallOrder[0]);
  expect(revalidateTag).toHaveBeenNthCalledWith(1, 'anime-week', { expire: 0 });
  expect(revalidateTag).toHaveBeenNthCalledWith(2, 'weekly-page-output', { expire: 0 });
});
