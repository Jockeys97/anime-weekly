import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
beforeEach(() => { vi.resetModules(); vi.stubEnv('OMDB_API_KEY', 'test'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
it('deduplicates simultaneous requests and caches only valid scores', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ Response: 'True', imdbRating: '8.6', imdbVotes: '1,234' }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  const a = primeImdbScore('tt1'), b = primeImdbScore('tt1'); expect(a).toBe(b);
  expect(await a).toMatchObject({ imdbRating: '8.6', imdbStatus: 'ready' });
  await primeImdbScore('tt1'); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
});
it('keeps quota errors retryable instead of caching them as unavailable ratings', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Request limit reached!' })).mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '8' }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  vi.useFakeTimers();
  expect((await primeImdbScore('tt2')).imdbErrorReason).toBe('quota');
  await vi.advanceTimersByTimeAsync(60001);
  expect((await primeImdbScore('tt2')).imdbRating).toBe('8');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('keeps a genuine N/A score distinct from an outage and allows later recovery', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: 'N/A' })).mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '7.5' }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  expect((await primeImdbScore('tt3')).imdbStatus).toBe('unavailable');
  expect((await primeImdbScore('tt3')).imdbRating).toBe('7.5');
});
it('retries a transient 503 once and retains the confirmed ID on persistent network failure', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '9' }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  const result = primeImdbScore('tt4'); await vi.runAllTimersAsync();
  expect((await result).imdbRating).toBe('9'); expect(fetchMock).toHaveBeenCalledTimes(2);
  fetchMock.mockRejectedValue(new Error('offline'));
  expect(await primeImdbScore('tt5')).toEqual({ imdbId: 'tt5', imdbStatus: 'error', imdbErrorReason: 'network' });
});
it('does not retry before a long Retry-After or send a request with missing configuration', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  expect((await primeImdbScore('tt6')).imdbStatus).toBe('error'); expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.stubEnv('OMDB_API_KEY', ''); expect((await primeImdbScore('tt7')).imdbStatus).toBe('unconfigured');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('identifies quota errors returned with a non-success HTTP status', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ Response: 'False', Error: 'Request limit reached!' }, { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);
  const { primeImdbScore } = await import('../lib/imdb');
  expect(await primeImdbScore('ttquota')).toMatchObject({ imdbStatus: 'unmatched' });
  expect(await primeImdbScore('tt9')).toMatchObject({ imdbStatus: 'error', imdbErrorReason: 'quota' });
});

it('pauses quota failures across IDs while preserving valid cached scores and resumes after a minute', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '8' }))
    .mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Request limit reached!' }))
    .mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '7' }));
  vi.stubGlobal('fetch', fetchMock);
  const { getImdbScore, primeImdbScore } = await import('../lib/imdb');
  expect((await primeImdbScore('tt10')).imdbRating).toBe('8');
  expect((await primeImdbScore('tt11')).imdbErrorReason).toBe('quota');
  expect((await primeImdbScore('tt12')).imdbErrorReason).toBe('quota');
  expect((await getImdbScore('tt10')).imdbRating).toBe('8');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30000);
  expect((await primeImdbScore('tt13')).imdbErrorReason).toBe('quota');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30001);
  expect((await primeImdbScore('tt12')).imdbRating).toBe('7');
  expect((await getImdbScore('tt12')).imdbRating).toBe('7');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
