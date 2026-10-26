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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
    expect(body.query).toContain('updatedAt');
    expect(body.query).toContain('averageScore');
    expect(body.query).toMatch(/\bsynonyms\b/);
  });

  it('preserves adult season media for sitemaps and the similar catalog', async () => {
    const adult = { ...anime, id: 22, isAdult: true };
    const media = [anime, adult];
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: {
      media, pageInfo: { hasNextPage: true },
    } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeason } = await import('../lib/anilist');
    expect(await getSeason(2026, 'fall')).toEqual({
      media, pageInfo: { currentPage: 1, hasNextPage: true },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).query).not.toMatch(/isAdult\s*:/);
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

  it('bypasses raw fetch caching for discovery so HTTP 200 GraphQL failures can recover immediately', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Temporarily unavailable' }] }))
      .mockResolvedValueOnce(Response.json({ data: { Page: { media: [anime], pageInfo: { hasNextPage: false } } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeason } = await import('../lib/anilist');
    expect((await getSeason(2026, 'fall', 1, { fresh: true })).unavailable).toBe(true);
    const pending = getSeason(2026, 'fall', 1, { fresh: true });
    await vi.runAllTimersAsync();
    expect((await pending).media).toEqual([anime]);
    expect(fetchMock.mock.calls.every(([, init]) => init.cache === 'no-store' && init.next === undefined)).toBe(true);
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
    const full = { ...anime, format:'TV', relations:{ edges:[] }, recommendations:{ nodes:[] }, trailer:{ id:'official-trailer', site:'youtube' } };
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
    expect(body.query).toMatch(/\bsynonyms\b/);
    expect(body.query).toMatch(/relations\s*\{\s*edges\s*\{\s*relationType/);
    expect(body.query).toContain('nextAiringEpisode { episode airingAt }');
    expect(body.query).toContain('trailer { id site }');
    expect(body.query).toContain('recommendations(perPage: 25, sort: RATING_DESC)');
    expect(body.query).toMatch(/rating mediaRecommendation \{[\s\S]*coverImage/);
    expect(body.query).toContain('popularity isAdult');
    expect(body.query).toContain('isGeneralSpoiler isAdult');
    expect(await getAnime(-1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not use sparse season recommendations in place of rich detail data', async () => {
    const sparse = { ...anime, format: 'TV', relations: { edges: [] },
      recommendations: { nodes: [{ rating: 20, mediaRecommendation: { id: 1 } }] } };
    const detailed = { ...sparse, recommendations: { nodes: [{ rating: 20,
      mediaRecommendation: { ...anime, id: 1, genres: ['Action'], coverImage: null } }] } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { Page: { media: [sparse], pageInfo: { hasNextPage: false } } } }))
      .mockResolvedValueOnce(Response.json({ data: { Media: detailed } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getSeason, getAnime } = await import('../lib/anilist');
    await getSeason(2026, 'fall');
    const pending = getAnime(21);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(detailed);
    expect(fetchMock).toHaveBeenCalledTimes(2); // Existing detail query only.
  });

  it('batches two popular pages through the rate limiter without caching raw responses', async () => {
    const candidate = { ...anime, genres: ['Action'], tags: [
      { name: 'Safe', rank: 90, isMediaSpoiler: false, isGeneralSpoiler: false, isAdult: false },
      { name: 'Reveal', rank: 99, isMediaSpoiler: true },
    ] };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: {
      page3: { media: [candidate], pageInfo: { currentPage: 3, hasNextPage: true } },
      page4: { media: [], pageInfo: { currentPage: 4, hasNextPage: false } },
    } }));
    vi.stubGlobal('fetch', fetchMock);
    const { getPopularCatalogBatch } = await import('../lib/anilist');
    const pages = await getPopularCatalogBatch(3);
    expect(pages[0].media[0].tags).toEqual([{ name: 'Safe', rank: 90 }]);
    expect(pages[0].media[0].description).toBeNull();
    const init = fetchMock.mock.calls[0][1];
    expect(init.cache).toBe('no-store');
    expect(init.next).toBeUndefined();
    const { query } = JSON.parse(init.body);
    expect(query).toContain('page3: Page(page: 3, perPage: 50)');
    expect(query).toContain('page4: Page(page: 4, perPage: 50)');
    expect(query).toContain('sort: [POPULARITY_DESC, ID]');
    expect(query).not.toContain('recommendations');
    expect(query).not.toContain('description');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects partial or failed popular batches instead of persisting an incomplete catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: {
      page1: { media: [anime], pageInfo: { hasNextPage: true } },
    }, errors: [{ message: 'Query unavailable' }] })));
    const { getPopularCatalogBatch } = await import('../lib/anilist');
    await expect(getPopularCatalogBatch(1)).rejects.toThrow('Popular discovery catalog unavailable');
  });

  it('rejects an anime with a different ID', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { Media: anime } })));
    const { getAnime } = await import('../lib/anilist');
    await expect(getAnime(22)).rejects.toThrow('Anime details unavailable');
  });

  it.each([200, 404])('returns null only for explicit not-found responses (HTTP %s)', async status => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { Media: null } }, { status }))
      .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Not Found.', status: 404 }] }, { status }));
    vi.stubGlobal('fetch', fetchMock);
    const { getAnime } = await import('../lib/anilist');
    expect(await getAnime(21)).toBeNull();
    const pending = expect(getAnime(22)).resolves.toBeNull();
    await vi.runAllTimersAsync();
    await pending;
  });

  it.each(['403', '429', '500', '503', 'network', 'timeout', 'graphql', 'malformed', 'empty', 'bare404', 'mixed'] as const)('throws on a detail upstream failure (%s)', async failure => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('offline');
      if (failure === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
      if (failure === 'graphql') return Response.json({ data: { Media: null }, errors: [{ message: 'Rate limited', status: 429 }] });
      if (failure === 'malformed') return new Response('invalid JSON');
      if (failure === 'empty') return Response.json({ data: {} });
      if (failure === 'bare404') return new Response(null, { status: 404 });
      if (failure === 'mixed') return Response.json({ data: { Media: null }, errors: [{ message: 'Not Found', status: 404 }, { message: 'Unavailable', status: 500 }] });
      // A null Media must never override an upstream HTTP failure.
      return Response.json({ data: { Media: null } }, { status: Number(failure) });
    }));
    const { getAnime } = await import('../lib/anilist');
    const pending = expect(getAnime(21)).rejects.toThrow();
    await vi.runAllTimersAsync();
    await pending;
  });

  it.each(['network', 'http', 'graphql', 'malformed'] as const)('returns empty results on %s errors', async failure => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (failure === 'network') throw new Error('offline');
      if (failure === 'http') return new Response(null, { status: 503 });
      if (failure === 'graphql') return Response.json({ data: { Page: { media: [anime] }, Media: anime }, errors: [{ message: 'unavailable' }] });
      return new Response('invalid JSON');
    }));
    const { getSeason, searchAnime } = await import('../lib/anilist');
    const pending = Promise.all([getSeason(2026, 'fall', 3), searchAnime('Example')]);
    await vi.runAllTimersAsync();
    expect(await pending).toEqual([{ media: [], pageInfo: { currentPage: 3, hasNextPage: false }, unavailable: true }, []]);
  });
});

it('reuses trusted catalog entries with prequel edges when loading a visible card', async () => {
  vi.useRealTimers();
  const entry = { ...anime, format: 'TV', relations: { edges: [] }, recommendations: { nodes: [] } };
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: { media: [entry], pageInfo: { currentPage: 1, hasNextPage: false } } } }));
  vi.stubGlobal('fetch', fetchMock);
  const { getSeason, getAnime } = await import('../lib/anilist');
  await getSeason(2026, 'fall');
  expect(await getAnime(21)).toEqual(entry);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
