import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { cache, trakt, mal, mappings, airings, snapshot } = vi.hoisted(() => ({
  cache: vi.fn((fn: () => unknown) => fn), trakt: vi.fn(), mal: vi.fn(), mappings: vi.fn(), airings: vi.fn(), snapshot: vi.fn(),
}));
vi.mock('next/cache', () => ({ unstable_cache: cache }));
vi.mock('@/lib/rate-limited-fetch', () => ({ throttle: (spacing: number) => spacing === 350 ? trakt : mal }));
vi.mock('@/lib/anilist', () => ({ getAnimeMappings: mappings }));
vi.mock('@/lib/airing-schedule', () => ({ getWeekAirings: airings }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: snapshot }));
import { getPersonalWeek } from '../lib/my-anime-data';
import * as identity from '../lib/my-anime-identity';

const week = { year: 2026, week: 43 };
const mapping = { id: 21, idMal: 123, title: { romaji: 'Example Anime', english: null, native: null } };
const token = (accessToken: string) => ({ accessToken, refreshToken: 'refresh', expiresAt: Date.now() + 3600000 });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TRAKT_CLIENT_ID', 'offline-client');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must stay offline'); }));
  snapshot.mockResolvedValue({ titles: { 'tv:42': { anilistId: 21 } }, names: { 'tv:42': 'Example Anime' }, events: [] });
  mappings.mockResolvedValue({ media: [mapping], unavailable: false });
  airings.mockResolvedValue({ events: [{ id: 1, mediaId: 21, episode: 2, airingAt: Date.parse('2026-10-20T12:00:00Z') / 1000 }], unavailable: false });
  mal.mockImplementation(async () => Response.json({ data: [{ node: { id: 123, title: 'Example Anime' } }], paging: {} }));
  trakt.mockImplementation(async (url: string) => {
    if (url.includes('/watching')) return new Response(null, { status: 204 });
    if (url.includes('/watchlist')) return Response.json([{ show: { title: 'Example Anime', ids: { trakt: 7, tmdb: 42 } } }]);
    if (url.includes('/1?')) return Response.json([]);
    return Response.json([{ first_aired: '2026-10-20T12:00:00Z', episode: { season: 1, number: 2 }, show: { title: 'Example Anime', ids: { trakt: 7, tmdb: 42 } } }]);
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('private personalized data', () => {
  it('uses only token hashes in a 600-second cache key, isolated by token and week', async () => {
    await getPersonalWeek({ mal: token('user-a-secret') }, week);
    await getPersonalWeek({ mal: token('user-b-secret') }, week);
    await getPersonalWeek({ mal: token('user-b-secret') }, { year: 2026, week: 44 });
    const calls = cache.mock.calls as unknown as [() => unknown, string[], { revalidate: number }][];
    expect(calls[0][2]).toMatchObject({ revalidate: 600, tags: [expect.stringMatching(/^my-anime:[a-f0-9]{64}$/)] });
    expect(JSON.stringify(calls)).not.toContain('user-a-secret');
    expect(JSON.stringify(calls)).not.toContain('user-b-secret');
    expect(calls[0][1]).not.toEqual(calls[1][1]); expect(calls[1][1]).not.toEqual(calls[2][1]);
    expect(calls[0][1][3]).toMatch(/^[a-f0-9]{64}$/);
  });
  it('fetches both MAL statuses/fields with no-store and builds verified anime links', async () => {
    const data = await getPersonalWeek({ mal: token('mal-access') }, week);
    expect(data.releases).toHaveLength(1); expect(data.releases[0].anilistId).toBe(21);
    expect(data.followed).toBe(1); expect(data.unavailable).toEqual([]);
    const urls = mal.mock.calls.map(call => new URL(call[0]));
    expect(urls.map(url => url.searchParams.get('status'))).toEqual(['watching', 'plan_to_watch']);
    expect(urls[0].searchParams.get('fields')).toBe('id,title,alternative_titles,start_season,broadcast,status,num_episodes');
    for (const [, init] of mal.mock.calls) expect(init).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer mal-access' } });
    expect(mappings).toHaveBeenCalledWith([123], true, expect.any(Number));
    expect(airings).toHaveBeenCalledWith([21], week, expect.any(Number), true, true);
    expect(trakt).not.toHaveBeenCalled();
  });
  it('loads the Trakt personal calendar, Rome edge, watchlist and watching with API headers', async () => {
    const data = await getPersonalWeek({ trakt: token('trakt-access') }, week);
    expect(data.releases).toHaveLength(1); expect(data.followed).toBe(1);
    const urls = trakt.mock.calls.map(call => call[0]);
    expect(urls).toContain('https://api.trakt.tv/calendars/my/shows/2026-10-19/7?extended=full');
    expect(urls).toContain('https://api.trakt.tv/calendars/my/shows/2026-10-18/1?extended=full');
    expect(urls).toContain('https://api.trakt.tv/users/me/watching?extended=full');
    expect(urls.some(url => url.includes('/users/me/watchlist/shows?'))).toBe(true);
    for (const [, init] of trakt.mock.calls) expect(init).toMatchObject({ cache: 'no-store', headers: {
      Authorization: 'Bearer trakt-access', 'trakt-api-version': '2', 'trakt-api-key': 'offline-client',
      'Content-Type': 'application/json', 'User-Agent': 'AnimeWeekly/0.1.0 (+https://weeklyanime.com)',
    } });
    expect(mal).not.toHaveBeenCalled();
  });
  it('paginates MAL without following untrusted next URLs', async () => {
    mal.mockResolvedValueOnce(Response.json({ data: [{ node: { id: 123, title: 'Example Anime' } }], paging: { next: 'https://attacker.example/steal-token' } }));
    await getPersonalWeek({ mal: token('access') }, week);
    expect(mal.mock.calls[1][0]).toContain('https://api.myanimelist.net/v2/users/@me/animelist?');
    expect(new URL(mal.mock.calls[1][0]).searchParams.get('offset')).toBe('1000');
    expect(mal.mock.calls.every(call => !call[0].includes('attacker'))).toBe(true);
  });
  it('preserves MAL results when Trakt fails and marks partial data', async () => {
    trakt.mockRejectedValue(new Error('offline'));
    const data = await getPersonalWeek({ trakt: token('t'), mal: token('m') }, week);
    expect(data.unavailable).toContain('trakt'); expect(data.releases).toHaveLength(1);
  });
  it('returns graceful empty/error states when providers or AniList fail', async () => {
    mal.mockResolvedValue(new Response(null, { status: 429 }));
    const failed = await getPersonalWeek({ mal: token('m') }, week);
    expect(failed.unavailable).toContain('mal'); expect(failed.releases).toEqual([]);
    mal.mockImplementation(async () => Response.json({ data: [], paging: {} }));
    const empty = await getPersonalWeek({ mal: token('m') }, week);
    expect(empty.releases).toEqual([]); expect(empty.followed).toBe(0); expect(empty.unavailable).toEqual([]);
    mal.mockImplementation(async () => Response.json({ data: [{ node: { id: 123, title: 'Example Anime' } }], paging: {} }));
    airings.mockResolvedValue({ events: [], unavailable: true });
    expect((await getPersonalWeek({ mal: token('m') }, week)).unavailable).toContain('anilist');
  });
  it('includes confirmed MAL anime outside a cold/empty weekly snapshot', async () => {
    snapshot.mockResolvedValue({ titles: {}, events: [] });
    const data = await getPersonalWeek({ mal: token('m') }, week);
    expect(data.releases[0].anilistId).toBe(21); expect(data.unmatched).toBe(0);
  });
  it('includes independently verified Trakt anime outside the week, with covers, and excludes live action from releases and followed counts', async () => {
    snapshot.mockResolvedValue({ titles: {}, events: [] }); mappings.mockResolvedValue({ media: [], unavailable: false });
    const anime = { title: 'Outside Anime', ids: { trakt: 7, tmdb: 500 } }, drama = { title: 'The Diplomat', ids: { trakt: 8, tmdb: 600 } };
    trakt.mockImplementation(async (url: string) => {
      if (url.includes('/watching')) return new Response(null, { status: 204 });
      if (url.includes('/watchlist')) return Response.json([{ show: anime }, { show: drama }]);
      if (url.includes('/1?')) return Response.json([]);
      return Response.json([anime, drama].map(show => ({ first_aired: '2026-10-20T12:00:00Z', episode: { season: 1, number: 2 }, show })));
    });
    vi.spyOn(identity, 'resolvePersonalAnime').mockResolvedValue({ identities: new Map([[7, { id: 55, title: 'Outside Anime', tmdbId: 500, poster: 'https://s4.anilist.co/file/cover.jpg' }]]), excluded: 1, unmatched: 0, unavailable: false, deferred: false });
    const data = await getPersonalWeek({ trakt: token('outside-account') }, week);
    expect(data.followed).toBe(1); expect(data.releases).toHaveLength(1);
    expect(data.releases[0]).toMatchObject({ title: 'Outside Anime', anilistId: 55, poster: 'https://s4.anilist.co/file/cover.jpg' });
  });
});
