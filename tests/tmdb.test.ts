import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

const netflix = { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' };
const crunchyroll = { provider_id: 283, provider_name: 'Crunchyroll', logo_path: null };
const candidate = { id: 21, name: 'Example', first_air_date: '2026-10-01', genre_ids: [16], origin_country: ['JP'] };
const link = (country: string) => `https://www.themoviedb.org/tv/21/watch?locale=${country}`;

beforeEach(() => {
  vi.stubEnv('TMDB_API_KEY', 'test-key');
  vi.stubEnv('TMDB_READ_TOKEN', '');
  vi.stubEnv('OMDB_API_KEY', '');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('TMDB anime availability (offline)', () => {
  it('matches title and year, then returns distinct providers per supported country', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/search/tv')) return Response.json({ results: [
        { ...candidate, id: 1, name: 'Unrelated' },
        { ...candidate, id: 2, first_air_date: '2010-10-01' },
        candidate,
      ] });
      if (url.pathname.endsWith('/tv/21/external_ids')) return Response.json({ imdb_id: null });
      if (url.pathname.endsWith('/tv/21/watch/providers')) return Response.json({ results: {
        IT: { link: link('IT'), flatrate: [netflix], free: [netflix, crunchyroll], ads: [crunchyroll] },
        US: { link: link('US'), flatrate: [crunchyroll] },
        JP: { link: link('JP'), ads: [netflix] },
        FR: { link: 'https://untrusted.example/', flatrate: [netflix] },
        DE: { link: link('DE'), flatrate: [] },
        CA: { link: link('CA'), flatrate: [netflix] },
        ES: { link: link('ES'), flatrate: [crunchyroll] },
        ZZ: { link: link('ZZ'), flatrate: [netflix] },
      } });
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeAvailability } = await import('../lib/tmdb');
    expect(await getAnimeAvailability([' Example ', 'Example'], 2026)).toEqual({
      match: { id: 21, kind: 'tv' }, ratings: { imdbStatus: 'unmatched' }, providersUnavailable: false,
      providers: {
        IT: { link: link('IT'), providers: [netflix, crunchyroll] },
        US: { link: link('US'), providers: [crunchyroll] },
        JP: { link: link('JP'), providers: [netflix] },
        CA: { link: link('CA'), providers: [netflix] },
        ES: { link: link('ES'), providers: [crunchyroll] },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const url = fetchMock.mock.calls[0][0];
    expect(url.searchParams.get('query')).toBe('Example');
    expect(url.searchParams.get('first_air_date_year')).toBe('2026');
  });

  it('matches a movie after no TV match and uses the movie release year', async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/search/tv')) return Response.json({ results: [] });
      if (url.pathname.endsWith('/search/movie')) return Response.json({ results: [{
        id: 42, title: 'Example', release_date: '2026-10-01', genre_ids: [16],
      }] });
      return Response.json({ results: { GB: { link: 'https://www.themoviedb.org/movie/42/watch', free: [crunchyroll] } } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeAvailability } = await import('../lib/tmdb');
    const result = await getAnimeAvailability(['Example'], 2026);
    expect(result.match).toEqual({ id: 42, kind: 'movie' });
    expect(result.providers.GB?.providers).toEqual([crunchyroll]);
    expect(fetchMock.mock.calls[1][0].searchParams.get('primary_release_year')).toBeNull();
  });

  it.each(['network', 'http'] as const)('returns no providers when watch providers fail (%s)', async failure => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
      if (url.pathname.endsWith('/search/tv')) return Response.json({ results: [candidate] });
      if (failure === 'network') throw new Error('offline');
      return new Response(null, { status: 503 });
    }));
    const { getAnimeAvailability } = await import('../lib/tmdb');
    expect(await getAnimeAvailability(['Example'], 2026)).toEqual({
      match: { id: 21, kind: 'tv' }, ratings: { imdbStatus: 'error' }, providers: {}, providersUnavailable: true,
    });
  });

  it('returns no providers when upstream search fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { getAnimeAvailability } = await import('../lib/tmdb');
    expect(await getAnimeAvailability(['Example'], 2026)).toEqual({
      match: null, ratings: { imdbStatus: 'error' }, providers: {}, providersUnavailable: false,
    });
  });

  it('skips fetch when neither key nor token is configured', async () => {
    vi.stubEnv('TMDB_API_KEY', ' ');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { getAnimeAvailability } = await import('../lib/tmdb');
    expect(await getAnimeAvailability(['Example'], 2026)).toEqual({
      match: null, ratings: { imdbStatus: 'unconfigured' }, providers: {}, providersUnavailable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it('matches a confirmed nearby premiere year without an exact-year search filter', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.pathname.endsWith('/search/tv')
    ? Response.json({ results: [{ ...candidate, first_air_date: '2025-12-31' }] })
    : Response.json({ imdb_id: null, results: {} })));
  const { getAnimeAvailability } = await import('../lib/tmdb');
  expect((await getAnimeAvailability(['Example'], 2026, 'tv')).match?.id).toBe(21);
});
