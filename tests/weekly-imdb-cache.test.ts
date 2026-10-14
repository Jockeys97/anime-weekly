import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
beforeEach(() => { vi.resetModules(); vi.stubEnv('OMDB_API_KEY', 'fixture'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('visitors read cron-populated weekly scores without calling OMDb, including cache misses', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ Response: 'True', imdbRating: '8.6', imdbVotes: '1,234' }));
  vi.stubGlobal('fetch', fetchMock);
  const { getImdbScore, primeImdbScore } = await import('../lib/imdb');
  expect(await getImdbScore('tt1', '2026-42')).toEqual({ imdbId: 'tt1', imdbStatus: 'unavailable' });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await primeImdbScore('tt1', '2026-42')).imdbRating).toBe('8.6');
  const read = await getImdbScore('tt1', '2026-42');
  expect(read).toMatchObject({ imdbRating: '8.6', imdbStatus: 'ready' });
  await primeImdbScore('tt1', '2026-42');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await getImdbScore('tt1', '2026-43')).imdbStatus).toBe('unavailable');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await primeImdbScore('tt1', '2026-43');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('a cron quota error never populates the cache and every visitor still gets neutral n/a', async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Request limit reached!' }))
    .mockResolvedValueOnce(Response.json({ Response: 'True', imdbRating: '7.8' }));
  vi.stubGlobal('fetch', fetchMock);
  const { getImdbScore, primeImdbScore } = await import('../lib/imdb');
  expect((await primeImdbScore('tt2', '2026-42')).imdbErrorReason).toBe('quota');
  expect(await getImdbScore('tt2', '2026-42')).toEqual({ imdbId: 'tt2', imdbStatus: 'unavailable' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect((await primeImdbScore('tt2', '2026-42')).imdbErrorReason).toBe('quota');
  expect(await getImdbScore('tt3', '2026-42')).toEqual({ imdbId: 'tt3', imdbStatus: 'unavailable' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60001);
  expect(await getImdbScore('tt2', '2026-42')).toEqual({ imdbId: 'tt2', imdbStatus: 'unavailable' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await primeImdbScore('tt2', '2026-42');
  expect((await getImdbScore('tt2', '2026-42')).imdbRating).toBe('7.8');
});
