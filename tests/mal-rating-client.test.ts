import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
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
