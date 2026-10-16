import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const cacheEntries = vi.hoisted(() => new Map<string, unknown>());
const cacheConfig = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keys: string[], options: unknown) => {
  cacheConfig(options);
  return async (...args: unknown[]) => {
    const key = JSON.stringify([keys, args]);
    if (cacheEntries.has(key)) return cacheEntries.get(key);
    const result = await fn(...args); cacheEntries.set(key, result); return result;
  };
} }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
import { getAnime } from '../lib/anilist';
const data = (language = 'Italian', dubbed = [16498], partial: number[] = []) => ({ language, dubbed, partial,
  _license: 'CC BY 4.0 - https://creativecommons.org/licenses/by/4.0/', _origin: 'https://github.com/Joelis57/MyDubList' });
beforeEach(() => { cacheEntries.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks(); vi.resetModules(); });
it('shares one validated daily language dataset across concurrent exact-season lookups', async () => {
  const fetch = vi.fn(async () => Response.json(data())); vi.stubGlobal('fetch', fetch);
  const { getDubbing, MYDUBLIST_REVALIDATE } = await import('../lib/mydublist');
  const [first, sequel] = await Promise.all([getDubbing(16498, 'it'), getDubbing(48583, 'it')]);
  expect(first).toMatchObject({ status: 'reported', malId: 16498, language: 'it' });
  expect(sequel).toMatchObject({ status: 'unverified', malId: 48583, reason: 'not-listed' });
  expect(await getDubbing(16498, 'it')).toEqual(first);
  expect(MYDUBLIST_REVALIDATE).toBe(86400); expect(cacheConfig).toHaveBeenCalledWith({ revalidate: 86400, tags: ['mydublist'] }); expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]).toEqual(expect.arrayContaining(['https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/confidence/low/dubbed_italian.json']));
});
it('keeps language datasets separate and never infers a dub from the streaming country', async () => {
  const fetch = vi.fn(async (url: string) => Response.json(url.includes('italian') ? data('Italian', []) : data('English', [123]))); vi.stubGlobal('fetch', fetch);
  const { getDubbing } = await import('../lib/mydublist');
  expect((await getDubbing(123, 'it')).status).toBe('unverified');
  expect((await getDubbing(123, 'en')).status).toBe('reported');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('reports partial dubs separately, never as complete dubbing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(data('Italian', [123], [123, 456]))));
  const { getDubbing } = await import('../lib/mydublist');
  expect((await getDubbing(123, 'it')).status).toBe('partial');
  expect((await getDubbing(456, 'it')).status).toBe('partial');
});
it.each([undefined, null, 0, -1, 1.2, 2147483648])('does not request a dataset for missing/invalid exact MAL ID %s', async id => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { getDubbing } = await import('../lib/mydublist');
  expect(await getDubbing(id, 'it')).toEqual({ status: 'unverified', language: 'it', reason: 'identity' });
  expect(fetch).not.toHaveBeenCalled();
});
it.each([{}, data('English'), data('Italian', [0]), { ...data(), partial: undefined }, { ...data(), _license: 'unknown' }])('rejects invalid/wrong-language datasets without reporting no dub (%j)', async payload => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
  const { getDubbing } = await import('../lib/mydublist');
  expect(await getDubbing(16498, 'it')).toMatchObject({ status: 'unverified', reason: 'upstream' });
});
it('does not cache a failed request as a daily missing entry, throttles retries, and recovers', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(data())); vi.stubGlobal('fetch', fetch);
  const { getDubbing } = await import('../lib/mydublist');
  expect((await getDubbing(16498, 'it')).reason).toBe('upstream');
  expect((await getDubbing(16498, 'it')).reason).toBe('upstream'); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(61000);
  expect((await getDubbing(16498, 'it')).status).toBe('reported'); expect(fetch).toHaveBeenCalledTimes(2);
});
it('bounds stalled upstream requests rather than leaving cards in a loading state', async () => {
  vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  const { getDubbing } = await import('../lib/mydublist');
  const result = getDubbing(16498, 'it'); await vi.advanceTimersByTimeAsync(5001);
  expect(await result).toMatchObject({ status: 'unverified', reason: 'upstream' });
});
it('resolves only the requested season, even when its prequel has a reported dub', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(data())));
  vi.mocked(getAnime).mockResolvedValue({ id: 131681, idMal: 48583, relations: { edges: [{ node: { id: 16498 } }] } } as Awaited<ReturnType<typeof getAnime>>);
  const { GET } = await import('../app/api/dubbing/route');
  const response = await GET(new Request('https://example.test/api/dubbing?anilist=131681&locale=it'));
  expect(await response.json()).toMatchObject({ status: 'unverified', malId: 48583, reason: 'not-listed' });
  expect(getAnime).toHaveBeenCalledExactlyOnceWith(131681);
  expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
});
it('does not guess or traverse relatives when the exact season has no MAL ID', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  vi.mocked(getAnime).mockResolvedValue({ id: 131681, idMal: null } as Awaited<ReturnType<typeof getAnime>>);
  const { GET } = await import('../app/api/dubbing/route');
  expect(await (await GET(new Request('https://example.test/api/dubbing?anilist=131681&locale=it'))).json()).toMatchObject({ status: 'unverified', reason: 'identity' });
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['mal=0&locale=it','mal=1&anilist=2&locale=it','mal=1&locale=xx','mal=1','mal=1&mal=2&locale=it','mal=1&locale=it&locale=en'])('rejects ambiguous/invalid lookup %s', async query => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { GET } = await import('../app/api/dubbing/route');
  expect((await GET(new Request(`https://example.test/api/dubbing?${query}`))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled(); expect(getAnime).not.toHaveBeenCalled();
});
it('returns non-cacheable unverified errors for failed or mismatched exact identities', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 2, idMal: 16498 } as Awaited<ReturnType<typeof getAnime>>);
  const { GET } = await import('../app/api/dubbing/route');
  const response = await GET(new Request('https://example.test/api/dubbing?anilist=1&locale=it'));
  expect(response.status).toBe(503); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ status: 'unverified', reason: 'upstream' });
});
