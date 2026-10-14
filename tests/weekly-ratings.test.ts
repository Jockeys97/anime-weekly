import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
beforeEach(async () => {
  vi.resetModules();
  const cache = await import('next/cache') as unknown as { clearNextCache: () => void };
  cache.clearNextCache();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.stubEnv('TMDB_API_KEY', 'fixture'); vi.stubEnv('TMDB_READ_TOKEN', ''); vi.stubEnv('OMDB_API_KEY', 'fixture');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function fixtureFetch(imdbFailure = false, animeFailure = false) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/')) return Response.json({ results: url.includes('/tv?') ? [{ id: 1, name: 'Ranma1/2', original_name: 'らんま1/2', first_air_date: '2024-10-05' }] : [], total_pages: 1 });
    if (url.includes('/external_ids')) return Response.json({ imdb_id: 'tt123' });
    if (url.includes('omdbapi')) return Response.json(imdbFailure ? { Response: 'False', Error: 'Request limit reached!' } : { Response: 'True', imdbRating: '8.1', imdbVotes: '2,123' });
    if (url.includes('anilist')) {
      const body = JSON.parse(String(init?.body));
      if (body.query.includes('airingSchedules')) return Response.json({ data: { Page: { airingSchedules: [{ id: 4, mediaId: 123, episode: 2, airingAt: Date.parse('2026-10-14T15:00:00Z') / 1000 }], pageInfo: { hasNextPage: false } } } });
      if (animeFailure) return Response.json({ errors: [{ message: 'Rate limited' }] });
      return Response.json({ data: { Page: { media: [{ id: 123, idMal: 456, type: 'ANIME', format: 'TV', title: { english: 'Ranma ½', native: 'らんま1/2' }, startDate: { year: 2024 }, averageScore: 81 }] } } });
    }
    if (url.includes('jikan')) return Response.json({ data: { score: 8.25, members: 1000 } });
    if (url.includes('/watch/providers')) return Response.json({ results: {} });
    if (url.includes('/recommendations') || url.includes('/similar')) return Response.json({ results: [] });
    throw new Error(`Unexpected offline fixture: ${url}`);
  });
}
it('a cold read cannot call any rating provider or cache an empty result; cron fills one shared snapshot', async () => {
  const fetchMock = fixtureFetch(); vi.stubGlobal('fetch', fetchMock);
  const { getWeeklyRatings, primeWeeklyRatings } = await import('../lib/weekly-ratings');
  expect(await getWeeklyRatings('2026-42')).toEqual({ titles: {}, events: [] });
  expect(fetchMock).not.toHaveBeenCalled();
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await pending;
  expect(primed.titles['tv:1']).toMatchObject({ anilistId: 123, malId: 456, anilistScore: 81, malScore: 8.25, imdbId: 'tt123', imdbRating: '8.1' });
  expect(primed.events).toHaveLength(1);
  const calls = fetchMock.mock.calls.length;
  expect(await getWeeklyRatings('2026-42')).toEqual(primed);
  expect(await primeWeeklyRatings('2026-42')).toEqual(primed);
  expect(await getWeeklyRatings('2026-43')).toEqual({ titles: {}, events: [] });
  expect(fetchMock).toHaveBeenCalledTimes(calls);
  for (const [input, init] of fetchMock.mock.calls) if (/anilist|jikan|omdbapi/.test(String(input))) {
    expect(init?.cache).toBe('no-store'); // Only validated snapshots persist.
  }
  const { getWeeklyTitleDetails, getWeeklyTitleSchedule } = await import('../lib/weekly-enrichment');
  const details = await getWeeklyTitleDetails('2026-42', 'tv', 1);
  expect(details).not.toHaveProperty('ratings');
  expect((await getWeeklyTitleSchedule('2026-42', 'tv', 1))?.events).toEqual(primed.events);
  expect(fetchMock.mock.calls.filter(([url]) => /anilist|jikan|omdbapi/.test(String(url)))).toHaveLength(4);
});
it('stores AniList/MAL successes together, but never persists OMDb quota errors', async () => {
  vi.stubGlobal('fetch', fixtureFetch(true));
  const { getWeeklyRatings, primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync(); await pending;
  const score = (await getWeeklyRatings('2026-42')).titles['tv:1'];
  expect(score).toMatchObject({ anilistId: 123, malScore: 8.25, imdbId: 'tt123' });
  expect(score).not.toHaveProperty('imdbStatus');
  expect(score).not.toHaveProperty('imdbErrorReason');
  expect(score).not.toHaveProperty('imdbRating');
});
it('a wholly failed cron remains retryable and readers still never fetch ratings', async () => {
  const fetchMock = fixtureFetch(true, true); vi.stubGlobal('fetch', fetchMock);
  const { getWeeklyRatings, primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const failed = primeWeeklyRatings('2026-42').catch(error => error);
  await vi.runAllTimersAsync(); expect(await failed).toBeInstanceOf(Error);
  fetchMock.mockClear();
  expect(await getWeeklyRatings('2026-42')).toEqual({ titles: {}, events: [] });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.stubGlobal('fetch', fixtureFetch());
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await retry).titles['tv:1'].malScore).toBe(8.25);
});
