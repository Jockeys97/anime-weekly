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
async function storePrimedSnapshot(slug: string, primed: Awaited<ReturnType<typeof import('../lib/weekly-ratings').primeWeeklyRatings>>) {
  const { revalidateTag } = await import('next/cache');
  const { storeWeeklyRatingsSnapshot, storeRatingsStore, WEEKLY_RATINGS_TAG } = await import('../lib/weekly-ratings');
  const { total, store, storeHits, ...snapshot } = primed;
  void total;
  void storeHits;
  // The cron invalidates the previous entry before its separate storage request.
  revalidateTag(WEEKLY_RATINGS_TAG, { expire: 0 });
  await storeWeeklyRatingsSnapshot(slug, snapshot);
  await storeRatingsStore(store);
}
// AniList rating lookups. Airing schedules and the daily season-chain batch
// (its query asks for relations) are expected on every run.
function isRatingLookup(url: unknown, init?: RequestInit) {
  return String(url).includes('anilist') && !/airingSchedules|relations \{/.test(String(init?.body));
}
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
    if (url.includes('tenrai')) return Response.json({ data: { mal_id: 456, score: 8.25, members: 1000 } });
    if (url.includes('/watch/providers')) return imdbFailure && animeFailure ? new Response(null, { status: 503 }) : Response.json({ results: {} });
    if (url.includes('/recommendations') || url.includes('/similar')) return Response.json({ results: [] });
    if (url.startsWith('https://www.justwatch.com/')) return new Response(null, { status: 404 });
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
  expect(await getWeeklyRatings('2026-42')).toEqual({ titles: {}, events: [] });
  await storePrimedSnapshot('2026-42', primed);
  expect(primed.titles['tv:1']).toMatchObject({ anilistId: 123, malId: 456, anilistScore: 81, malScore: 8.25, imdbId: 'tt123', imdbRating: '8.1' });
  expect(primed.events).toHaveLength(1);
  expect(primed.names).toEqual({ 'tv:1': 'Ranma ½' });
  const calls = fetchMock.mock.calls.length;
  const { total, store, storeHits, ...snapshot } = primed;
  void store;
  expect(storeHits).toBe(0);
  expect(total).toBe(1);
  expect(await getWeeklyRatings('2026-42')).toEqual(snapshot);
  const repeated = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect(await repeated).toMatchObject({ ...snapshot, total, storeHits: 1 });
  expect(await getWeeklyRatings('2026-43')).toEqual({ titles: {}, events: [] });
  // Discovery, airing schedules and the season-chain batch refresh; completed rating
  // sources do not. TMDB listed no default-country offers, so one JustWatch seed lookup is attempted.
  expect(fetchMock).toHaveBeenCalledTimes(calls + 5);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://www.justwatch.com/'))).toHaveLength(1);
  for (const [input, init] of fetchMock.mock.calls) if (/anilist|tenrai|omdbapi/.test(String(input))) {
    expect(init?.cache).toBe('no-store'); // Only validated snapshots persist.
  }
  const { getWeeklyTitleDetails, getWeeklyTitleSchedule } = await import('../lib/weekly-enrichment');
  const details = await getWeeklyTitleDetails('2026-42', 'tv', 1);
  expect(details).not.toHaveProperty('ratings');
  expect((await getWeeklyTitleSchedule('2026-42', 'tv', 1))?.events).toEqual(primed.events);
  // Includes the second run's season-chain batch (one AniList request per daily run).
  expect(fetchMock.mock.calls.filter(([url]) => /anilist|tenrai|omdbapi/.test(String(url)))).toHaveLength(6);
});
it('stores AniList/MAL successes together, but never persists OMDb quota errors', async () => {
  vi.stubGlobal('fetch', fixtureFetch(true));
  const { getWeeklyRatings, primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  await storePrimedSnapshot('2026-42', await pending);
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
  const partial = await first;
  expect(partial.titles['tv:1']).not.toHaveProperty('imdbRating');
  await storePrimedSnapshot('2026-42', partial);
  await vi.advanceTimersByTimeAsync(60001); // OMDb's process-wide quota pause.
  const retryFetch = fixtureFetch(); vi.stubGlobal('fetch', retryFetch);
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const completed = await retry;
  expect(completed.titles['tv:1']).toMatchObject({ malScore: 8.25, anilistScore: 81, imdbRating: '8.1' });
  expect((await readWeeklyRatingsSnapshot('2026-42')).titles['tv:1']).not.toHaveProperty('imdbRating');
  await storePrimedSnapshot('2026-42', completed);
  expect(retryFetch.mock.calls.some(([url]) => String(url).includes('tenrai') || String(url).includes('/external_ids'))).toBe(false);
  expect(retryFetch.mock.calls.filter(([url, init]) => isRatingLookup(url, init))).toHaveLength(0);
  expect((await readWeeklyRatingsSnapshot('2026-42')).titles['tv:1'].imdbRating).toBe('8.1');
});
it('fills only MAL using the saved ID, and preserves scores and events on failure', async () => {
  const base = fixtureFetch();
  let failed = true;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('tenrai') && failed) throw new Error('offline');
    if (String(init?.body).includes('airingSchedules') && failed) throw new Error('offline');
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readWeeklyRatingsSnapshot } = await import('../lib/weekly-ratings');
  const previous = { titles: { 'tv:1': { anilistId: 123, malId: 456, anilistScore: 81, imdbId: 'tt123', imdbRating: '8.1', imdbVotes: '2,123' } }, events: [{ id: 4, mediaId: 123, episode: 2, airingAt: 1791990000 }] };
  const first = primeWeeklyRatings('2026-42', previous); await vi.runAllTimersAsync();
  await storePrimedSnapshot('2026-42', await first);
  expect(await readWeeklyRatingsSnapshot('2026-42')).toMatchObject({ ...previous, names: { 'tv:1': 'Ranma ½' }, availability: { titles: { 'tv:1': { countries: {} } }, providers: {} } });
  failed = false;
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await retry).titles['tv:1']).toMatchObject({ ...previous.titles['tv:1'], malScore: 8.25 });
  expect(fetchMock.mock.calls.some(([url]) => /omdbapi|external_ids/.test(String(url)))).toBe(false);
  expect(fetchMock.mock.calls.filter(([url, init]) => isRatingLookup(url, init))).toHaveLength(0);
});
it('stops OMDb after quota errors and Tenrai after timeouts while continuing AniList', async () => {
  const base = fixtureFetch(true);
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/tv?')) return Response.json({ results: [1, 2, 3].map(id => ({ id, name: 'Ranma1/2', original_name: 'らんま1/2', first_air_date: '2024-10-05' })), total_pages: 1 });
    if (url.includes('tenrai')) throw new DOMException('Timed out', 'TimeoutError');
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.total).toBe(3);
  expect(Object.values(result.titles).every(rating => rating.anilistScore === 81)).toBe(true);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('tenrai'))).toHaveLength(1);
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
  await storePrimedSnapshot('2026-42', partial);
  const retry = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const merged = await retry;
  expect(Object.keys(merged.titles)).toHaveLength(3);
  expect(merged.titles['tv:1']).toEqual(partial.titles['tv:1']);
  expect(merged.names).toEqual(partial.names);
  await storePrimedSnapshot('2026-42', merged);
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
  expect(fetchMock.mock.calls.every(([url]) => String(url).includes('/watch/providers'))).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await storePrimedSnapshot('2026-42', result);
  expect((await readWeeklyRatingsSnapshot('2026-42')).names).toEqual(result.names);
});

it('reuses stable ratings across weeks without OMDb, AniList score, Tenrai or ID lookups', async () => {
  const fetchMock = fixtureFetch(); vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readRatingsStore, getWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  await storePrimedSnapshot('2026-42', primed);
  const saved = await readRatingsStore();
  expect(saved.ratings).toMatchObject({
    'imdb:tt123': { values: { imdbRating: '8.1', imdbVotes: '2,123' }, fetchedAt: expect.any(Number) },
    'anilist:123': { values: { anilistScore: 81 } },
    'mal:456': { values: { malScore: 8.25 } },
  });
  expect(saved.sources['tv:1']).toMatchObject({ imdbId: 'tt123', anilistId: 123, malId: 456 });
  vi.setSystemTime(Date.now() + 7 * 86400000);
  fetchMock.mockClear();
  const second = primeWeeklyRatings('2026-43'); await vi.runAllTimersAsync();
  const reused = await second;
  expect(reused.titles).toEqual(primed.titles);
  expect(reused.storeHits).toBe(1);
  expect(fetchMock.mock.calls.filter(([url, init]) => /omdbapi|tenrai|external_ids/.test(String(url)) || (isRatingLookup(url, init)))).toHaveLength(0);
  expect(reused.store.ratings['imdb:tt123'].fetchedAt).toBe(saved.ratings['imdb:tt123'].fetchedAt);
  expect(saved.ratings['imdb:tt123'].lastSeenAt).toBeLessThan(reused.store.ratings['imdb:tt123'].lastSeenAt);
  await storePrimedSnapshot('2026-43', reused);
  expect((await getWeeklyRatings('2026-43')).titles).toEqual(primed.titles);
});

it('refreshes values older than 30 days and overwrites scores only on success', async () => {
  vi.stubGlobal('fetch', fixtureFetch());
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  await storePrimedSnapshot('2026-42', primed);
  vi.setSystemTime(Date.now() + 31 * 86400000);
  const base = fixtureFetch();
  const refreshedFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('omdbapi')) return Response.json({ Response: 'True', imdbRating: '8.8', imdbVotes: '3,456' });
    if (url.includes('tenrai')) return Response.json({ data: { mal_id: 456, score: 8.75, members: 2000 } });
    const response = await base(input, init);
    if (url.includes('anilist') && !String(init?.body).includes('airingSchedules')) {
      const body = await response.json(); body.data.Page.media[0].averageScore = 88;
      return Response.json(body);
    }
    return response;
  });
  vi.stubGlobal('fetch', refreshedFetch);
  // Even a completed same-week snapshot must not bypass the store's age check.
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.titles['tv:1']).toMatchObject({ imdbRating: '8.8', imdbVotes: '3,456', anilistScore: 88, malScore: 8.75 });
  expect(result.storeHits).toBe(0);
  expect(refreshedFetch.mock.calls.filter(([url]) => String(url).includes('omdbapi'))).toHaveLength(1);
  expect(refreshedFetch.mock.calls.some(([url]) => String(url).includes('/external_ids'))).toBe(false);
  for (const key of ['imdb:tt123', 'anilist:123', 'mal:456']) expect(result.store.ratings[key].fetchedAt).toBeGreaterThan(primed.store.ratings[key].fetchedAt);
});

it('keeps stale scores and fetchedAt timestamps when refreshes fail, then retries', async () => {
  vi.stubGlobal('fetch', fixtureFetch());
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  await storePrimedSnapshot('2026-42', primed);
  vi.setSystemTime(Date.now() + 31 * 86400000);
  const failedBase = fixtureFetch(true, true);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('tenrai')) throw new Error('offline');
    return failedBase(input, init);
  }));
  const failed = primeWeeklyRatings('2026-47'); await vi.runAllTimersAsync();
  const retained = await failed;
  expect(retained.titles).toEqual(primed.titles);
  for (const key of Object.keys(primed.store.ratings)) {
    expect(retained.store.ratings[key].values).toEqual(primed.store.ratings[key].values);
    expect(retained.store.ratings[key].fetchedAt).toBe(primed.store.ratings[key].fetchedAt);
  }
  await storePrimedSnapshot('2026-47', retained);
  vi.setSystemTime(Date.now() + 60001);
  const retryFetch = fixtureFetch(); vi.stubGlobal('fetch', retryFetch);
  const retry = primeWeeklyRatings('2026-47'); await vi.runAllTimersAsync();
  expect((await retry).store.ratings['imdb:tt123'].fetchedAt).toBeGreaterThan(primed.store.ratings['imdb:tt123'].fetchedAt);
  expect(retryFetch.mock.calls.filter(([url]) => String(url).includes('omdbapi'))).toHaveLength(1);
});

it('drops ratings and source mappings unseen for 120 days but retains active stale entries', async () => {
  vi.stubGlobal('fetch', fixtureFetch());
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  const expired = Date.now() - 121 * 86400000;
  primed.store.ratings['imdb:tt999'] = { values: { imdbRating: '9' }, fetchedAt: expired, lastSeenAt: expired };
  primed.store.sources['movie:999'] = { imdbId: 'tt999', fetchedAt: expired, lastSeenAt: expired };
  primed.store.availability!.titles['movie:999'] = { countries: { US: [9] }, fetchedAt: expired, lastSeenAt: expired };
  primed.store.availability!.providers[9] = { name: 'Unused provider', logo: null };
  primed.store.ratings['mal:789'] = { values: { malScore: 8 }, fetchedAt: expired, lastSeenAt: Date.now() - 119 * 86400000 };
  primed.store.ratings['imdb:tt123'].lastSeenAt = expired;
  await storePrimedSnapshot('2026-42', primed);
  const second = primeWeeklyRatings('2026-43'); await vi.runAllTimersAsync();
  const result = await second;
  expect(result.store.ratings).not.toHaveProperty('imdb:tt999');
  expect(result.store.sources).not.toHaveProperty('movie:999');
  expect(result.store.availability!.titles).not.toHaveProperty('movie:999');
  expect(result.store.availability!.providers).not.toHaveProperty('9');
  expect(result.store.ratings).toHaveProperty('mal:789');
  expect(result.store.ratings).toHaveProperty('imdb:tt123');
});

it('refreshes only stale MAL and does not renew the AniList fallback timestamp', async () => {
  vi.stubGlobal('fetch', fixtureFetch());
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  primed.store.ratings['mal:456'].fetchedAt = Date.now() - 31 * 86400000;
  await storePrimedSnapshot('2026-42', primed);
  const fetchMock = fixtureFetch(); vi.stubGlobal('fetch', fetchMock);
  const pending = primeWeeklyRatings('2026-43'); await vi.runAllTimersAsync();
  const refreshed = await pending;
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('tenrai'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes('omdbapi') || (isRatingLookup(url, init)))).toHaveLength(0);
  expect(refreshed.store.ratings['anilist:123'].fetchedAt).toBe(primed.store.ratings['anilist:123'].fetchedAt);
  expect(refreshed.store.ratings['mal:456'].fetchedAt).toBeGreaterThan(primed.store.ratings['mal:456'].fetchedAt);
});

it('fetches missing IMDb votes without refetching completed anime scores', async () => {
  vi.stubGlobal('fetch', fixtureFetch());
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const first = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const primed = await first;
  delete primed.titles['tv:1'].imdbVotes;
  delete primed.store.ratings['imdb:tt123'].values.imdbVotes;
  await storePrimedSnapshot('2026-42', primed);
  const fetchMock = fixtureFetch(); vi.stubGlobal('fetch', fetchMock);
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  const result = await pending;
  expect(result.titles['tv:1'].imdbVotes).toBe('2,123');
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('omdbapi'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('tenrai'))).toHaveLength(0);
});

it('reuses providers across weeks for seven days, retains stale offers on failure and retries without rating quota', async () => {
  const base = fixtureFetch();
  const netflix = { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' };
  let watchFailure = false;
  let watchEmpty = false;
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).includes('/watch/providers')) {
      if (watchFailure) return new Response(null, { status: 503 });
      return Response.json({ results: watchEmpty ? {} : { IT: { link: 'https://www.themoviedb.org/tv/1/watch', flatrate: [netflix] }, US: { link: 'https://www.themoviedb.org/tv/1/watch', free: [netflix] } } });
    }
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings, readRatingsStore } = await import('../lib/weekly-ratings');
  const prime = async (slug: string) => { const pending = primeWeeklyRatings(slug); await vi.runAllTimersAsync(); return pending; };
  const first = await prime('2026-42');
  expect(first.availability).toEqual({ titles: { 'tv:1': { countries: { IT: [8], US: [8] }, fetchedAt: expect.any(Number) } }, providers: { 8: { name: 'Netflix', logo: '/netflix.png' } } });
  expect(first.store.availability?.titles['tv:1'].lastSeenAt).toEqual(expect.any(Number));
  await storePrimedSnapshot('2026-42', first);
  expect((await readRatingsStore()).availability).toEqual(first.store.availability);
  vi.setSystemTime(Date.now() + 6 * 86400000);
  fetchMock.mockClear();
  const reused = await prime('2026-43');
  expect(reused.availability).toEqual(first.availability);
  expect(fetchMock.mock.calls.filter(([url]) => /watch\/providers|omdbapi|tenrai|external_ids/.test(String(url)))).toHaveLength(0);
  expect(reused.store.availability?.titles['tv:1'].lastSeenAt).toBeGreaterThan(first.store.availability!.titles['tv:1'].lastSeenAt);
  await storePrimedSnapshot('2026-43', reused);
  vi.setSystemTime(Date.now() + 86400000);
  watchFailure = true;
  const failed = await prime('2026-43');
  expect(failed.availability).toEqual(first.availability);
  expect(failed.store.availability!.titles['tv:1'].fetchedAt).toBe(first.store.availability!.titles['tv:1'].fetchedAt);
  await storePrimedSnapshot('2026-43', failed);
  watchFailure = false; watchEmpty = true;
  fetchMock.mockClear();
  const refreshed = await prime('2026-43');
  expect(refreshed.availability!.titles['tv:1'].countries).toEqual({});
  expect(refreshed.availability!.titles['tv:1'].fetchedAt).toBeGreaterThan(first.availability!.titles['tv:1'].fetchedAt);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/watch/providers'))).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url, init]) => /omdbapi|tenrai|external_ids/.test(String(url)) || (isRatingLookup(url, init)))).toHaveLength(0);
});

it('warms availability even when all ratings are missing', async () => {
  const base = fixtureFetch(true, true);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => String(input).includes('/watch/providers') ? Response.json({ results: {} }) : base(input, init)));
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const pending = primeWeeklyRatings('2026-42'); await vi.runAllTimersAsync();
  expect((await pending).availability?.titles['tv:1'].countries).toEqual({});
});

it('reads provider-only snapshots through the legacy production API host independently of the SEO base', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'anime-weekly.vercel.app');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  const snapshot = { titles: {}, events: [], availability: { titles: { 'tv:1': { countries: {}, fetchedAt: Date.now() } }, providers: {} } };
  const fetchMock = vi.fn(async () => Response.json(snapshot)); vi.stubGlobal('fetch', fetchMock);
  const { getWeeklyRatings } = await import('../lib/weekly-ratings');
  expect(await getWeeklyRatings('2026-42')).toEqual(snapshot);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://anime-weekly.vercel.app/api/revalidate?ratings=2026-42', expect.objectContaining({ next: { revalidate: 21600, tags: ['weekly-ratings'] } }));
});

it('fills default-country gaps from JustWatch once per TMDB refresh, without TMDB logos for new services', async () => {
  const { justWatchPage } = await import('./helpers/justwatch-page');
  const base = fixtureFetch();
  const seed = 'https://www.justwatch.com/us/tv-show/ranma1-2';
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/watch/providers')) return Response.json({ results: { IT: { link: 'https://www.themoviedb.org/tv/1/watch', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }] } } });
    if (url === seed) return new Response(justWatchPage('/us/tv-show/ranma1-2', 'tt123', { US: [{ id: 283, name: 'Crunchyroll', href: 'https://www.crunchyroll.com/us' }] }, { 'de-DE': 'https://www.justwatch.com/de/Serie/ranma1-2' }));
    if (url === 'https://www.justwatch.com/de/Serie/ranma1-2') return new Response(justWatchPage('/de/Serie/ranma1-2', 'tt123', { DE: [{ id: 9999, name: 'New Service', href: 'https://example.com/de' }] }));
    return base(input, init);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const prime = async (previous?: Awaited<ReturnType<typeof primeWeeklyRatings>>) => { const pending = primeWeeklyRatings('2026-42', previous); await vi.runAllTimersAsync(); return pending; };
  const jw = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://www.justwatch.com/'));
  const first = await prime();
  expect(jw()).toHaveLength(0); // No IMDb mapping yet: the next run recovers.
  await storePrimedSnapshot('2026-42', first);
  const second = await prime();
  expect(second.availability!.titles['tv:1']).toEqual({ countries: { IT: [8], US: [283], DE: [9999] }, fetchedAt: first.availability!.titles['tv:1'].fetchedAt, recoveredAt: expect.any(Number) });
  expect(second.availability!.providers).toMatchObject({ 8: { name: 'Netflix', logo: '/netflix.png' }, 283: { name: 'Crunchyroll', logo: null }, 9999: { name: 'New Service', logo: null } });
  expect(jw().map(([url]) => String(url))).toEqual([seed, 'https://www.justwatch.com/de/Serie/ranma1-2']);
  await storePrimedSnapshot('2026-42', second);
  fetchMock.mockClear();
  const third = await prime();
  expect(jw()).toHaveLength(0); // Already attempted since the last TMDB refresh.
  expect(third.availability!.titles['tv:1'].countries).toEqual(second.availability!.titles['tv:1'].countries);
});

it('pins a verified airing cour: own IDs and JustWatch offers instead of the merged TMDB series, until it expires', async () => {
  const { justWatchPage } = await import('./helpers/justwatch-page');
  vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  const seed = 'https://www.justwatch.com/us/tv-show/bleach-thousand-year-blood-war';
  const italy = 'https://www.justwatch.com/it/serie-tv/bleach-thousand-year-blood-war';
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/')) return Response.json({ results: url.includes('/tv?') ? [{ id: 30984, name: 'Bleach', original_name: 'BLEACH', first_air_date: '2004-10-05' }] : [], total_pages: 1 });
    if (url.includes('/30984/watch/providers')) return Response.json({ results: { IT: { link: 'https://www.themoviedb.org/tv/30984/watch', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' }] } } });
    if (url.includes('/external_ids')) return Response.json({ imdb_id: 'tt0434665' });
    if (url.includes('omdbapi')) return Response.json({ Response: 'True', imdbRating: '8.2', imdbVotes: '1,000' });
    if (url.includes('tenrai')) return Response.json({ data: { mal_id: 60636, score: 8.9, members: 1000 } });
    if (url.includes('anilist')) {
      const body = JSON.parse(String(init?.body));
      if (body.query.includes('airingSchedules')) return Response.json({ data: { Page: { airingSchedules: [], pageInfo: { hasNextPage: false } } } });
      if (body.variables?.id === 185874) return Response.json({ data: { Media: { id: 185874, idMal: 60636, type: 'ANIME', format: 'TV', title: { english: 'BLEACH: Thousand-Year Blood War - The Calamity' }, startDate: { year: 2026 }, averageScore: 88 } } });
      return Response.json({ data: { Page: { media: [{ id: 269, idMal: 269, type: 'ANIME', format: 'TV', title: { english: 'Bleach', romaji: 'BLEACH' }, startDate: { year: 2004 }, averageScore: 77 }] } } });
    }
    if (url === seed) return new Response(justWatchPage('/us/tv-show/bleach-thousand-year-blood-war', 'tt14986406', { US: [{ id: 15, name: 'Hulu', href: 'https://www.hulu.com/series/bleach' }] }, { 'it-IT': italy }));
    if (url === italy) return new Response(justWatchPage('/it/serie-tv/bleach-thousand-year-blood-war', 'tt14986406', { IT: [{ id: 337, name: 'Disney Plus', href: 'https://www.disneyplus.com/browse/entity-571475d5' }] }));
    if (url.startsWith('https://www.justwatch.com/')) return new Response(null, { status: 404 });
    if (url.includes('/recommendations') || url.includes('/similar')) return Response.json({ results: [] });
    throw new Error(`Unexpected offline fixture: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const prime = async (slug: string) => { const pending = primeWeeklyRatings(slug); await vi.runAllTimersAsync(); return pending; };
  const pinned = await prime('2026-43');
  expect(pinned.titles['tv:30984']).toMatchObject({ anilistId: 185874, malId: 60636, imdbId: 'tt14986406', anilistScore: 88 });
  expect(pinned.availability!.titles['tv:30984']).toEqual({ countries: { US: [15], IT: [337] }, fetchedAt: expect.any(Number), recoveredAt: expect.any(Number), identity: 'tt14986406' });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/30984/watch/providers'))).toHaveLength(0);
  // No title search: it would match Bleach (2004).
  expect(fetchMock.mock.calls.filter(([url, init]) => String(url).includes('anilist') && String(init?.body).includes('search'))).toHaveLength(0);
  await storePrimedSnapshot('2026-43', pinned);
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  const expired = await prime('2026-45');
  expect(expired.titles['tv:30984'].anilistId).toBe(269);
  expect(expired.availability!.titles['tv:30984'].identity).toBeUndefined();
  expect(expired.availability!.titles['tv:30984'].countries.IT).toEqual([8]);
});

it('pins a weekly title to its airing season: sequel IDs, scores and schedule, never a title search afterwards', async () => {
  const seasons: Record<number, object> = {
    161645: { id: 161645, idMal: 54492, status: 'FINISHED', format: 'TV', title: { english: 'The Apothecary Diaries' }, relations: { edges: [{ relationType: 'SEQUEL', node: { id: 176301, idMal: 58514, status: 'FINISHED', format: 'TV', title: { english: 'The Apothecary Diaries Season 2' } } }] } },
    176301: { id: 176301, idMal: 58514, status: 'FINISHED', format: 'TV', title: { english: 'The Apothecary Diaries Season 2' }, relations: { edges: [{ relationType: 'SEQUEL', node: { id: 195516, idMal: 61987, status: 'RELEASING', format: 'TV', title: { english: 'The Apothecary Diaries Season 3' }, nextAiringEpisode: { episode: 4, airingAt: 1792850400 } } }] } },
    195516: { id: 195516, idMal: 61987, status: 'RELEASING', format: 'TV', title: { english: 'The Apothecary Diaries Season 3' }, relations: { edges: [] } },
  };
  const airingQueries: number[][] = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/discover/')) return Response.json({ results: url.includes('/tv?') ? [{ id: 99, name: 'The Apothecary Diaries', original_name: '薬屋のひとりごと', first_air_date: '2023-10-22' }] : [], total_pages: 1 });
    if (url.includes('/external_ids')) return Response.json({ imdb_id: 'tt28220040' });
    if (url.includes('omdbapi')) return Response.json({ Response: 'True', imdbRating: '8.6', imdbVotes: '28,453' });
    if (url.includes('tenrai')) return Response.json({ data: { mal_id: url.includes('61987') ? 61987 : 54492, score: url.includes('61987') ? 8.9 : 8.84, members: 1000 } });
    if (url.includes('/watch/providers')) return Response.json({ results: {} });
    if (url.startsWith('https://www.justwatch.com/')) return new Response(null, { status: 404 });
    if (url.includes('/recommendations') || url.includes('/similar')) return Response.json({ results: [] });
    if (url.includes('anilist')) {
      const body = JSON.parse(String(init?.body));
      if (body.query.includes('airingSchedules')) { airingQueries.push(body.variables.ids ?? body.variables.mediaIds ?? []); return Response.json({ data: { Page: { airingSchedules: [], pageInfo: { hasNextPage: false } } } }); }
      if (body.query.includes('relations {') && body.variables.ids) return Response.json({ data: { Page: { media: body.variables.ids.map((id: number) => seasons[id]).filter(Boolean) } } });
      if (body.variables?.id === 195516) return Response.json({ data: { Media: { ...seasons[195516], averageScore: 90 } } });
      return Response.json({ data: { Page: { media: [{ id: 161645, idMal: 54492, type: 'ANIME', format: 'TV', title: { english: 'The Apothecary Diaries', romaji: 'Kusuriya no Hitorigoto' }, startDate: { year: 2023 }, averageScore: 88 }] } } });
    }
    throw new Error(`Unexpected offline fixture: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const { primeWeeklyRatings } = await import('../lib/weekly-ratings');
  const prime = async () => { const pending = primeWeeklyRatings('2026-43'); await vi.runAllTimersAsync(); return pending; };
  const titleSearches = () => fetchMock.mock.calls.filter(([url, init]) => String(url).includes('anilist') && String(init?.body).includes('"search"')).length;
  const first = await prime();
  expect(first.titles['tv:99']).toMatchObject({ anilistId: 161645, malId: 54492, anilistScore: 88 });
  await storePrimedSnapshot('2026-43', first);
  fetchMock.mockClear();
  const second = await prime();
  expect(second.titles['tv:99']).toMatchObject({ anilistId: 195516, malId: 61987, anilistScore: 90, malScore: 8.9, imdbRating: '8.6' });
  expect(titleSearches()).toBe(0);
  expect(airingQueries.at(-1)).toContain(195516);
  await storePrimedSnapshot('2026-43', second);
  vi.setSystemTime(Date.now() + 31 * 86400000);
  fetchMock.mockClear();
  const refreshed = await prime();
  expect(refreshed.titles['tv:99']).toMatchObject({ anilistId: 195516, malId: 61987 });
  expect(titleSearches()).toBe(0); // The monthly refresh reads the pinned season by ID.
});
