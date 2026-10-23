import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });
const result = (language = 'it', malId = 123) => ({ status: 'reported', language, malId, checkedAt: '2026-10-16T00:00:00Z' });
it('deduplicates cards and distinguishes language/season identities', async () => {
  const fetch = vi.fn(async (url: string) => Response.json(result(url.includes('locale=en') ? 'en' : 'it', Number(new URL('https://test'+url).searchParams.get('mal')))));
  vi.stubGlobal('fetch', fetch); const { loadDubbing } = await import('../lib/dubbing-client');
  await Promise.all([loadDubbing('mal=123', 'it', 123), loadDubbing('mal=123','it',123)]);
  await loadDubbing('mal=123','it',123); expect(fetch).toHaveBeenCalledTimes(1);
  await loadDubbing('mal=123','en',123); await loadDubbing('mal=124','it',124); expect(fetch).toHaveBeenCalledTimes(3);
});
it.each([{ ...result(), malId: 999 }, { ...result(), language: 'en' }, {}, { ...result(), status: 'no-dub' }])('does not retain a mismatched or malformed response (%j)', async invalid => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(invalid)).mockResolvedValueOnce(Response.json(result()));
  vi.stubGlobal('fetch', fetch); const { loadDubbing } = await import('../lib/dubbing-client');
  await expect(loadDubbing('mal=123','it',123)).rejects.toThrow();
  expect((await loadDubbing('mal=123','it',123)).status).toBe('reported'); expect(fetch).toHaveBeenCalledTimes(2);
});
it('retries after an outage rather than caching a missing dub', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null,{status:503})).mockResolvedValueOnce(Response.json(result()));
  vi.stubGlobal('fetch',fetch); const { loadDubbing } = await import('../lib/dubbing-client');
  await expect(loadDubbing('mal=123','it',123)).rejects.toThrow(); expect((await loadDubbing('mal=123','it',123)).status).toBe('reported');
});
it('limits lookup concurrency and starts timeouts at dispatch', async () => {
  vi.useFakeTimers(); let active=0, maximum=0;
  vi.stubGlobal('fetch',vi.fn(async (url:string)=>{ maximum=Math.max(maximum,++active); await new Promise(resolve=>setTimeout(resolve,10000)); active--; return Response.json(result('it',Number(new URL('https://test'+url).searchParams.get('mal')))); }));
  const { loadDubbing } = await import('../lib/dubbing-client');
  const all=Promise.all([1,2,3,4,5,6,7,8].map(id=>loadDubbing(`mal=${id}`,'it',id))); await vi.runAllTimersAsync();
  expect(await all).toHaveLength(8); expect(maximum).toBe(6); // Edge-cached responses: six at a time.
});
it('expires successful client lookups after one day', async () => {
  vi.useFakeTimers(); const fetch=vi.fn(async()=>Response.json(result())); vi.stubGlobal('fetch',fetch);
  const { loadDubbing } = await import('../lib/dubbing-client'); await loadDubbing('mal=123','it',123);
  await vi.advanceTimersByTimeAsync(86400001); await loadDubbing('mal=123','it',123); expect(fetch).toHaveBeenCalledTimes(2);
});
