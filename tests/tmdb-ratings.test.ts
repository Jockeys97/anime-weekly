import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anime-ratings', () => ({ getAnimeRatings: async () => ({}) }));
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
    expect(result.titles[0].ratings).toEqual(scenario === 'invalid-id' ? {} : scenario === 'success' ? { imdbId: 'tt123', imdbRating: '8', imdbVotes: '763' } : { imdbId: 'tt123' });
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
