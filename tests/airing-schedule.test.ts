import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const request = vi.hoisted(() => vi.fn());
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: request }));
import { getWeekAirings } from '../lib/airing-schedule';
const week = { year: 2026, week: 42 };
const start = Date.parse('2026-10-12T00:00:00Z') / 1000;
const event = { id: 10, mediaId: 21, airingAt: start, episode: 3 };
const page = (events: unknown[], hasNextPage = false) => Response.json({ data: { Page: { pageInfo: { hasNextPage }, airingSchedules: events } } });
beforeEach(() => request.mockReset());
afterEach(() => vi.unstubAllGlobals());
describe('weekly airing schedule lookup', () => {
  it('requests only matched titles and a precise week window with tagged hourly caching', async () => {
    request.mockResolvedValueOnce(page([event]));
    expect(await getWeekAirings([21, 21, -1, NaN], week)).toEqual({ events: [event], unavailable: false });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('https://graphql.anilist.co');
    expect(JSON.parse(init.body).variables).toEqual({ ids: [21], from: start - 1, until: start + 604800, page: 1 });
    expect(init.next).toEqual({ revalidate: 3600, tags: ['anime-week'] });
  });
  it('paginates, deduplicates and ignores unrelated or invalid events', async () => {
    const second = { ...event, id: 11, episode: 4, airingAt: start + 86400 };
    request.mockResolvedValueOnce(page([event, { ...event, id: 12, mediaId: 99 }, { ...event, id: 13, airingAt: start - 1 }], true)).mockResolvedValueOnce(page([event, second, { ...event, id: 14, episode: -1 }]));
    expect((await getWeekAirings([21], week)).events).toEqual([event, second]);
    expect(JSON.parse(request.mock.calls[1][1].body).variables.page).toBe(2);
  });
  it.each(['offline', 'http', 'graphql', 'malformed'])('retains confirmed events and reports %s failures', async failure => {
    request.mockResolvedValueOnce(page([event], true));
    if (failure === 'offline') request.mockRejectedValueOnce(new Error('offline'));
    if (failure === 'http') request.mockResolvedValueOnce(new Response('', { status: 503 }));
    if (failure === 'graphql') request.mockResolvedValueOnce(Response.json({ errors: [{ message: 'failed' }] }));
    if (failure === 'malformed') request.mockResolvedValueOnce(new Response('invalid'));
    expect(await getWeekAirings([21], week)).toEqual({ events: [event], unavailable: true });
  });
  it('skips lookups for titles without IDs and for dates outside GraphQL timestamp limits', async () => {
    expect(await getWeekAirings([], week)).toEqual({ events: [], unavailable: false });
    expect((await getWeekAirings([21], { year: 9999, week: 1 })).unavailable).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it('bounds pagination and reports an incomplete result', async () => {
    request.mockImplementation(async () => page([event], true));
    expect(await getWeekAirings([21], week)).toEqual({ events: [event], unavailable: true });
    expect(request).toHaveBeenCalledTimes(4);
  });
});
