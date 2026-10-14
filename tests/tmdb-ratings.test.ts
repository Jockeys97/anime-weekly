import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }));
vi.mock('../lib/anime-ratings', () => ({ getAnimeRatings: vi.fn(async () => ({})) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('IMDb title link enrichment', () => {
  it.each(['no-key', 'failure', 'success', 'invalid-id'])('preserves only confirmed IDs when %s', async scenario => {
    vi.stubEnv('TMDB_API_KEY', 'test');
    vi.stubEnv('TMDB_READ_TOKEN', '');
    vi.stubEnv('OMDB_API_KEY', scenario === 'no-key' ? '' : 'test');
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = String(input);
      if (url.includes('discover/tv')) return Response.json({ results: [{ id: 1, name: 'Test' }], total_pages: 1 });
      if (url.includes('discover/movie')) return Response.json({ results: [], total_pages: 1 });
      if (url.includes('external_ids')) return Response.json({ imdb_id: scenario === 'invalid-id' ? 'bad/id' : 'tt123' });
      if (url.includes('omdbapi')) {
        if (scenario === 'failure') throw new Error('offline');
        return Response.json({ Response: 'True', imdbRating: '8', imdbVotes: '763' });
      }
      return Response.json({ results: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { getWeekData } = await import('../lib/tmdb');
    const result = await getWeekData({ year: 2026, week: 42 });
    expect(result.titles[0].ratings).toEqual(scenario === 'invalid-id' ? { imdbStatus: 'unmatched' } : scenario === 'success' ? { imdbId: 'tt123', imdbRating: '8', imdbVotes: '763', imdbStatus: 'ready' } : { imdbId: 'tt123', imdbStatus: scenario === 'no-key' ? 'unconfigured' : 'error', ...(scenario === 'failure' ? { imdbErrorReason: 'network' } : {}) });
    if (scenario === 'no-key' || scenario === 'invalid-id') expect(fetchMock.mock.calls.some(([url]) => String(url).includes('omdbapi'))).toBe(false);
  });
});

it('returns the quick title catalog without waiting for rating or provider enrichment', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = String(input);
    if (url.includes('discover/tv')) return Response.json({ results: [{ id: 1, name: 'Quick title', overview: 'Real synopsis', poster_path: '/poster.jpg' }], total_pages: 1 });
    if (url.includes('discover/movie')) return Response.json({ results: [], total_pages: 1 });
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  const { getQuickWeekData } = await import('../lib/tmdb');
  const data = await getQuickWeekData({ year: 2026, week: 42 });
  expect(data.titles[0]).toMatchObject({ id: 1, name: 'Quick title', overview: 'Real synopsis', poster: '/poster.jpg', ratings: {}, providers: {} });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('shares one cold weekly enrichment across simultaneous requests for the same language', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = String(input);
    if (url.includes('discover/tv')) return Response.json({ results: [], total_pages: 1 });
    if (url.includes('discover/movie')) return Response.json({ results: [], total_pages: 1 });
    throw new Error('Unexpected enrichment');
  });
  vi.stubGlobal('fetch', fetchMock);
  const { getCachedWeekData } = await import('../lib/tmdb');
  const results = await Promise.all([getCachedWeekData({ year: 2026, week: 42 }, 'it'), getCachedWeekData({ year: 2026, week: 42 }, 'it'), getCachedWeekData({ year: 2026, week: 42 }, 'it')]);
  expect(results.every(data => data.status === 'ready')).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it('skips movie searches when AniList confirms a TV season', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
  vi.stubGlobal('fetch', fetchMock);
  const { getAnimeAvailability } = await import('../lib/tmdb');
  expect((await getAnimeAvailability(['Example Season 3'], 2026, 'tv')).match).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toContain('/search/tv');
});

it('keeps English catalog titles and localized synopses in the weekly guide', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => Response.json({ results: url.pathname.endsWith('/discover/tv') ? [{ id: 1, name: url.searchParams.get('language') === 'en-US' ? 'Original English Title' : 'Titolo italiano', overview: 'Trama italiana.' }] : [], total_pages: 1 })));
  const { getQuickWeekData } = await import('../lib/tmdb');
  const data = await getQuickWeekData({ year: 2026, week: 42 }, 'it');
  expect(data.titles[0]).toMatchObject({ name: 'Original English Title', overview: 'Trama italiana.' });
});

it('shares score and provider enrichment across different languages and overlays only the matching synopsis', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', ''); vi.stubEnv('OMDB_API_KEY', 'test');
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname.includes('/discover/')) {
      const language = url.searchParams.get('language');
      const tv = url.pathname.endsWith('/tv');
      return Response.json({ results: [{ id: 12345, ...(tv ? { name: 'TV title' } : { title: 'Movie title' }), overview: `${tv ? 'tv' : 'movie'} ${language}` }], total_pages: 1 });
    }
    if (url.pathname.endsWith('/external_ids')) return Response.json({ imdb_id: 'tt123' });
    if (url.hostname === 'www.omdbapi.com') return Response.json({ Response: 'True', imdbRating: '8.5' });
    if (url.pathname.endsWith('/watch/providers')) return Response.json({ results: { IT: { link: 'https://www.themoviedb.org/tv/12345/watch?locale=IT', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } } });
    return Response.json({ results: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
  const { getCachedWeekData } = await import('../lib/tmdb');
  const [en, it, fr] = await Promise.all(['en', 'it', 'fr'].map(locale => getCachedWeekData({ year: 2026, week: 43 }, locale as 'en' | 'it' | 'fr')));
  expect(fetchMock.mock.calls.filter(([url]) => url.pathname.endsWith('/external_ids'))).toHaveLength(2);
  expect(fetchMock.mock.calls.filter(([url]) => url.pathname.endsWith('/watch/providers'))).toHaveLength(2);
  expect(it.titles.map(title => title.overview)).toEqual(['tv it-IT', 'movie it-IT']);
  expect(fr.titles.map(title => title.overview)).toEqual(['tv fr-FR', 'movie fr-FR']);
  expect(it.titles[0].ratings).toEqual(en.titles[0].ratings);
  expect(fr.titles[1].providers).toEqual(en.titles[1].providers);
});

it('returns IMDb and watch providers without starting optional AniList enrichment', async () => {
  vi.clearAllMocks(); vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', ''); vi.stubEnv('OMDB_API_KEY', 'test');
  vi.stubGlobal('fetch', vi.fn(async (url: URL) => {
    if (url.pathname.endsWith('/discover/tv')) return Response.json({ results: [{ id: 77, name: 'Fast title' }], total_pages: 1 });
    if (url.pathname.endsWith('/external_ids')) return Response.json({ imdb_id: 'tt77' });
    if (url.hostname === 'www.omdbapi.com') return Response.json({ Response: 'True', imdbRating: '8.2' });
    if (url.pathname.endsWith('/watch/providers')) return Response.json({ results: { US: { link: 'https://www.themoviedb.org/tv/77/watch?locale=US', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } } });
    return Response.json({ results: [], total_pages: 1 });
  }));
  const { getCachedPrimaryWeekData } = await import('../lib/tmdb');
  const { getAnimeRatings } = await import('../lib/anime-ratings');
  const data = await getCachedPrimaryWeekData({ year: 2026, week: 44 });
  expect(data.titles[0].ratings).toMatchObject({ imdbRating: '8.2' });
  expect(data.titles[0].providers.US?.providers[0].provider_id).toBe(8);
  expect(getAnimeRatings).not.toHaveBeenCalled();
});
