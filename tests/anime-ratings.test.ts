import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const search = { kind: 'tv' as const, originalTitle: 'Original', title: 'Display', year: 2020 };
const candidate = { id: 1, type: 'ANIME', format: 'TV', title: { native: 'Original', english: 'Display' }, startDate: { year: 2020 }, idMal: 123, averageScore: 81 };
const matchResponse = (overrides = {}) => Response.json({ data: { Page: { media: [{ ...candidate, ...overrides }] } } });
const noMatch = () => Response.json({ data: { Page: { media: [] } } });

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('anime rating lookups (offline)', () => {
  it('searches the original first, then display title, and fetches only the matched MAL ID', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(noMatch()).mockResolvedValueOnce(matchResponse()).mockResolvedValueOnce(Response.json({ data: { score: 8.12, members: 1200000 } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ malScore: 8.12, malMembers: 1200000, anilistScore: 81 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables.search).toBe('Original');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).variables.search).toBe('Display');
    expect(fetchMock.mock.calls[2][0]).toBe('https://api.jikan.moe/v4/anime/123');
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({ cache: 'force-cache', next: { revalidate: 604800, tags: ['anime-week'] } });
    }
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
  it('returns no score without a conservative match and skips Jikan', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => matchResponse({ startDate: { year: 2010 } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([null, 0, -1])('keeps the AniList fallback without a valid MAL ID (%s)', async idMal => {
    const fetchMock = vi.fn().mockResolvedValue(matchResponse({ idMal }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    expect(await getAnimeRatings(search)).toEqual({ anilistScore: 81 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('degrades to the AniList fallback on Jikan failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(matchResponse()).mockRejectedValueOnce(new Error('offline')));
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    expect(await getAnimeRatings(search)).toEqual({ anilistScore: 81 });
  });
  it('contains failures and lets later requests continue through the queue', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ errors: [{ message: 'unavailable' }] })).mockResolvedValueOnce(matchResponse({ idMal: null }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const failed = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await failed).toEqual({});
    const recovered = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await recovered).toEqual({ anilistScore: 81 });
  });
  it('spaces concurrent requests and serializes each service', async () => {
    const starts: Record<string, number[]> = { anilist: [], jikan: [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const service = url.includes('anilist') ? 'anilist' : 'jikan';
      starts[service].push(Date.now());
      // A response slower than the minimum spacing must still be serialized.
      await new Promise(resolve => setTimeout(resolve, service === 'anilist' ? 800 : 900));
      return service === 'anilist' ? matchResponse() : Response.json({ data: { score: 8, members: 100 } });
    }));
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = Promise.all([getAnimeRatings(search), getAnimeRatings(search), getAnimeRatings(search)]);
    await vi.runAllTimersAsync();
    expect((await pending).every(result => result.malScore === 8)).toBe(true);
    for (const service of ['anilist', 'jikan']) {
      expect(starts[service]).toHaveLength(3);
      for (let i = 1; i < 3; i++) expect(starts[service][i] - starts[service][i - 1]).toBeGreaterThanOrEqual(service === 'anilist' ? 800 : 900);
    }
  });
  it.each(['2', 'Thu, 01 Jan 2026 00:00:02 GMT'])('honors Retry-After %s', async retryAfter => {
    const starts: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => {
      starts.push(Date.now());
      return starts.length === 1 ? new Response(null, { status: 429, headers: { 'Retry-After': retryAfter } }) : matchResponse({ idMal: null });
    }));
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ anilistScore: 81 });
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2000);
  });
  it('limits retries to three attempts with exponential backoff and no score', async () => {
    const starts: number[] = [];
    const fetchMock = vi.fn(async () => { starts.push(Date.now()); return new Response(null, { status: 429 }); });
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = getAnimeRatings({ ...search, originalTitle: undefined });
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(700);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1400);
  });
  it('retries Jikan at most three times then retains the AniList fallback', async () => {
    const starts: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('anilist')) return matchResponse();
      starts.push(Date.now());
      return new Response(null, { status: 429 });
    }));
    const { getAnimeRatings } = await import('../lib/anime-ratings');
    const pending = getAnimeRatings(search);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual({ anilistScore: 81 });
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(400);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(800);
  });
});
