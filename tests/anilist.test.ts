import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }));

const anime = {
  id: 21, idMal: 123, title: { english: 'Example', romaji: 'Example', native: null },
  averageScore: 81,
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('AniList catalog (offline)', () => {
  it('queries a season with pagination and the MAL ID and average score', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: {
      media: [anime], pageInfo: { currentPage: 2, hasNextPage: true },
    } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeason } = await import('../lib/anilist');
    expect(await getSeason(2026, 'fall', 2)).toEqual({
      media: [anime], pageInfo: { currentPage: 2, hasNextPage: true },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graphql.anilist.co');
    expect(init).toMatchObject({ method: 'POST', cache: 'force-cache', next: { revalidate: 86400 } });
    const body = JSON.parse(init.body);
    expect(body.variables).toEqual({ year: 2026, season: 'FALL', page: 2 });
    expect(body.query).toContain('seasonYear: $year');
    expect(body.query).toContain('perPage: 50');
    expect(body.query).toContain('idMal');
    expect(body.query).toContain('averageScore');
  });

  it('searches a trimmed title and skips blank searches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: { media: [anime] } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { searchAnime } = await import('../lib/anilist');
    expect(await searchAnime('  Example  ')).toEqual([anime]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({ search: 'Example' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toContain('sort: SEARCH_MATCH');
    expect(await searchAnime('  ')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('loads bounded season-family results with prequel edges in one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: { media: [anime] } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeasonFamily } = await import('../lib/anilist');
    expect(await getSeasonFamily(' Example ')).toEqual([anime]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual({ search: 'Example' });
    expect(body.query).toContain('perPage: 50');
    expect(body.query).toContain('relationType');
    expect(body.query).toContain('format_in: [TV, TV_SHORT, ONA]');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('reuses canonical catalog metadata for detail lookups without losing the trailer', async () => {
    const full = { ...anime, format:'TV', relations:{ edges:[] }, trailer:{ id:'official-trailer', site:'youtube' } };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data:{ Page:{ media:[full], pageInfo:{ hasNextPage:false } } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeason, getAnime } = await import('../lib/anilist');
    await getSeason(2026, 'fall');
    expect((await getAnime(21))?.trailer).toEqual(full.trailer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).toContain('trailer { id site }');
  });
  it('gets the requested anime by ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Media: anime } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnime } = await import('../lib/anilist');
    expect(await getAnime(21)).toEqual(anime);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual({ id: 21 });
    expect(body.query).toContain('Media(id: $id, type: ANIME)');
    expect(body.query).toContain('trailer { id site }');
    expect(await getAnime(-1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an anime with a different ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { Media: anime } })));
    const { getAnime } = await import('../lib/anilist');
    expect(await getAnime(22)).toBeNull();
  });

  it.each(['network', 'http', 'graphql', 'malformed'] as const)('returns empty results on %s errors', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('offline');
      if (failure === 'http') return new Response(null, { status: 503 });
      if (failure === 'graphql') return Response.json({ data: { Page: { media: [anime] }, Media: anime }, errors: [{ message: 'unavailable' }] });
      return new Response('invalid JSON');
    }));
    const { getSeason, searchAnime, getAnime } = await import('../lib/anilist');
    const pending = Promise.all([getSeason(2026, 'fall', 3), searchAnime('Example'), getAnime(21)]);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([{ media: [], pageInfo: { currentPage: 3, hasNextPage: false } }, [], null]);
  });
});
