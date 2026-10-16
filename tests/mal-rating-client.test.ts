import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });
it('shares the same cached MAL lookup across cards and locale changes', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ malId: 123, malScore: 8.12, malStatus: 'ready' }));
  vi.stubGlobal('fetch', fetch);
  const { loadMalRating } = await import('../lib/mal-rating-client');
  await Promise.all([loadMalRating('mal=123'), loadMalRating('mal=123')]);
  await loadMalRating('mal=123');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('allows recovery after a failed lookup', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json({ malId: 123, malScore: 8.12 }));
  vi.stubGlobal('fetch', fetch);
  const { loadMalRating } = await import('../lib/mal-rating-client');
  await expect(loadMalRating('mal=123')).rejects.toThrow();
  expect((await loadMalRating('mal=123')).malScore).toBe(8.12);
});
it('limits active catalog lookups and does not time out while waiting for dispatch', async () => {
  vi.useFakeTimers();
  let active = 0, maximum = 0;
  const fetch = vi.fn(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 10000));
    active--;
    return Response.json({ malId: 123, malScore: 8.12, malStatus: 'ready' });
  });
  vi.stubGlobal('fetch', fetch);
  const { loadMalRating } = await import('../lib/mal-rating-client');
  const result = Promise.all([1, 2, 3, 4, 5, 6].map(id => loadMalRating(`mal=${id}`)));
  expect(fetch).toHaveBeenCalledTimes(2);
  await vi.runAllTimersAsync();
  expect(await result).toHaveLength(6);
  expect(fetch).toHaveBeenCalledTimes(6);
  expect(maximum).toBe(2);
});
it('releases stalled lookup slots so subsequent cards can recover', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
    .mockImplementationOnce(() => new Promise(() => {}))
    .mockResolvedValue(Response.json({ malScore: 8.12 }));
  vi.stubGlobal('fetch', fetch);
  const { loadMalRating } = await import('../lib/mal-rating-client');
  const result = Promise.allSettled([1, 2, 3].map(id => loadMalRating(`mal=${id}`)));
  await vi.runAllTimersAsync();
  expect((await result).map(entry => entry.status)).toEqual(['rejected', 'rejected', 'fulfilled']);
  expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([{}, { malStatus: 'error' }, { malScore: '8.12' }, { malScore: 12 }])('does not cache an invalid successful response (%j)', async payload => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(payload)).mockResolvedValueOnce(Response.json({ malScore: 8.12 }));
  vi.stubGlobal('fetch', fetch);
  const { loadMalRating } = await import('../lib/mal-rating-client');
  await expect(loadMalRating('mal=123')).rejects.toThrow();
  expect((await loadMalRating('mal=123')).malScore).toBe(8.12);
  expect(fetch).toHaveBeenCalledTimes(2);
});
