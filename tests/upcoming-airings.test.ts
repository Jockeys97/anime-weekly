import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
import { anilistFetch } from '../lib/rate-limited-fetch';
import { getUpcomingAirings } from '../lib/upcoming-airings';
afterEach(() => vi.resetAllMocks());
it('requests future Media airingSchedule pages with six-hour caching and stable episode IDs', async () => {
  vi.mocked(anilistFetch).mockImplementation(async (_url, init) => {
    const variables = JSON.parse(String(init?.body)).variables;
    expect(variables.id).toBe(21);
    expect(JSON.parse(String(init?.body)).query).toContain('notYetAired: true');
    expect((init as RequestInit & { next: { revalidate: number } }).next.revalidate).toBe(21600);
    return Response.json({ data: { Media: { id: 21, title: { english: 'Example' }, airingSchedule: { pageInfo: { hasNextPage: variables.page === 1 }, nodes: [{ episode: variables.page, airingAt: 1791990000 + variables.page * 86400 }] } } } });
  });
  const events = await getUpcomingAirings(21);
  expect(events?.map(event => event.uid)).toEqual(['anilist-21-episode-1@anime-weekly', 'anilist-21-episode-2@anime-weekly']);
  expect(anilistFetch).toHaveBeenCalledTimes(2);
});
it('distinguishes unknown titles from upstream failures and does not return partial calendars', async () => {
  vi.mocked(anilistFetch).mockResolvedValueOnce(Response.json({ data: { Media: null } }));
  expect(await getUpcomingAirings(1)).toBeNull();
  vi.mocked(anilistFetch).mockResolvedValueOnce(Response.json({ errors: [{ message: 'Rate limited' }] }));
  await expect(getUpcomingAirings(1)).rejects.toThrow('unavailable');
  vi.mocked(anilistFetch).mockResolvedValueOnce(Response.json({ data: { Media: { id: 1, title: {}, airingSchedule: { pageInfo: { hasNextPage: true }, nodes: [{ episode: 1, airingAt: 1791990000 }] } } } })).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(getUpcomingAirings(1)).rejects.toThrow('unavailable');
});
