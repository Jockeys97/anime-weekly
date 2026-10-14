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
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
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
  expect(primed.names).toEqual({ 'tv:1': 'Ranma ½' });
  const calls = fetchMock.mock.calls.length;
  const { total, ...snapshot } = primed;
  expect(total).toBe(1);
  expect(await getWeeklyRatings('2026-42')).toEqual(snapshot);
  const repeated = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect(await repeated).toEqual(primed);
  expect(await getWeeklyRatings('2026-43')).toEqual({ titles: {}, events: [] });
  expect(fetchMock).toHaveBeenCalledTimes(calls + 3); // Discovery and airing schedules refresh; completed rating sources do not.
  for (const [input, init] of fetchMock.mock.calls) if (/anilist|jikan|omdbapi/.test(String(input))) {
    expect(init?.cache).toBe('no-store'); // Only validated snapshots persist.
  }
  const { getWeeklyTitleDetails, getWeeklyTitleSchedule } = await import('../lib/weekly-enrichment');
  const details = await getWeeklyTitleDetails('2026-42', 'tv', 1);
  expect(details).not.toHaveProperty('ratings');
  expect((await getWeeklyTitleSchedule('2026-42', 'tv', 1))?.events).toEqual(primed.events);
  expect(fetchMock.mock.calls.filter(([url]) => /anilist|jikan|omdbapi/.test(String(url)))).toHaveLength(5);
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
it('retries missing scores on a warm snapshot without querying completed sources', async () => {
  const fetchMock = fixtureFetch(true); vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readWeeklyRatingsSnapshot } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await first).titles['tv:1']).not.toHaveProperty('imdbRating');
  await vi.advanceTimersByTimeAsync(60001); // OMDb's process-wide quota pause.
  const retryFetch = fixtureFetch(); vi.stubGlobal('fetch', retryFetch);
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await retry).titles['tv:1']).toMatchObject({ malScore: 8.25, anilistScore: 81, imdbRating: '8.1' });
  expect(retryFetch.mock.calls.some(([url]) => String(url).includes('jikan') || String(url).includes('/external_ids'))).toBe(false);
  expect(retryFetch.mock.calls.filter(([url, init]) => String(url).includes('anilist') && !String(init?.body).includes('airingSchedules'))).toHaveLength(0);
  expect((await readWeeklyRatingsSnapshot('2026-42')).titles['tv:1'].imdbRating).toBe('8.1');
});
it('fills only MAL using the saved ID, and preserves scores and events on failure', async () => {
  const base = fixtureFetch();
  let failed = true;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('jikan') && failed) throw new Error('offline');
    if (String(init?.body).includes('airingSchedules') && failed) throw new Error('offline');
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readWeeklyRatingsSnapshot } = await import('../lib/weekly-ratings');
  const previous = { titles: { 'tv:1': { anilistId: 123, malId: 456, anilistScore: 81, imdbId: 'tt123', imdbRating: '8.1' } }, events: [{ id: 4, mediaId: 123, episode: 2, airingAt: 1791990000 }] };
  const first = primeWeeklyRatings('2026-42', previous); await vi.runAllTimersAsync(); await first;
  expect(await readWeeklyRatingsSnapshot('2026-42')).toEqual({ ...previous, names: { 'tv:1': 'Ranma ½' } });
  failed = false;
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await retry).titles['tv:1']).toMatchObject({ ...previous.titles['tv:1'], malScore: 8.25 });
  expect(fetchMock.mock.calls.some(([url]) => /omdbapi|external_ids/.test(String(url)))).toBe(false);
  expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes('anilist') && !String(init?.body).includes('airingSchedules'))).toHaveLength(0);
});
it('stops OMDb after quota errors and Jikan after timeouts while continuing AniList', async () => {
  const base = fixtureFetch(true);
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/tv?')) return Response.json({ results: [1, 2, 3].map(id => ({ id, name: 'Ranma1/2', original_name: 'らんま1/2', first_air_date: '2024-10-05' })), total_pages: 1 });
    if (url.includes('jikan')) throw new DOMException('Timed out', 'TimeoutError');
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.total).toBe(3);
  expect(Object.values(result.titles).every(rating => rating.anilistScore === 81)).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('jikan'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('omdbapi'))).toHaveLength(1);
});
it('resumes titles omitted by the previous run budget and keeps saved scores', async () => {
  const base = fixtureFetch();
  let exhaustBudget = true;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/tv?')) return Response.json({ results: [1, 2, 3].map(id => ({ id, name: 'Ranma1/2', original_name: 'らんま1/2', first_air_date: '2024-10-05' })), total_pages: 1 });
    if (exhaustBudget && url.includes('/external_ids')) {
      exhaustBudget = false;
      vi.setSystemTime(Date.now() + 243000);
    }
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readWeeklyRatingsSnapshot } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const partial = await first;
  expect(partial.total).toBe(3);
  expect(Object.keys(partial.titles)).toHaveLength(1);
  expect(partial.names).toEqual({ 'tv:1': 'Ranma ½', 'tv:2': 'Ranma ½', 'tv:3': 'Ranma ½' });
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const merged = await retry;
  expect(Object.keys(merged.titles)).toHaveLength(3);
  expect(merged.titles['tv:1']).toEqual(partial.titles['tv:1']);
  expect(merged.names).toEqual(partial.names);
  expect((await readWeeklyRatingsSnapshot('2026-42')).titles).toEqual(merged.titles);
});
it('merges display names for completed TV and movie sources and retains undiscovered titles', async () => {
  vi.spyOn(await import('../lib/tmdb'), 'getWeeklyRatingSources').mockResolvedValue([
    { kind: 'tv', id: 1, title: 'Ranma1/2', originalTitle: undefined, year: undefined },
    { kind: 'movie', id: 1, title: '  Movie title  ', originalTitle: undefined, year: undefined },
  ]);
  const fetchMock = fixtureFetch(); vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readWeeklyRatingsSnapshot } = await import('../lib/weekly-ratings');
  const complete = { malScore: 8.25, anilistScore: 81, imdbRating: '8.1' };
  const previous = {
    titles: { 'tv:1': { ...complete }, 'movie:1': { ...complete }, 'tv:99': { ...complete } },
    events: [],
    names: { 'tv:1': 'Old title', 'tv:99': 'Retained title' },
  };
  const pending = primeWeeklyRatings('2026-42', previous); await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.names).toEqual({ 'tv:1': 'Ranma ½', 'movie:1': 'Movie title', 'tv:99': 'Retained title' });
  expect(result.titles).toEqual(previous.titles);
  expect(previous.names).toEqual({ 'tv:1': 'Old title', 'tv:99': 'Retained title' });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await readWeeklyRatingsSnapshot('2026-42')).names).toEqual(result.names);
});
