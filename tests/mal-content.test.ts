import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/rate-limited-fetch', () => ({ jikanFetch: vi.fn() }));
import { get, put } from '@vercel/blob';
import { jikanFetch } from '@/lib/rate-limited-fetch';
import { clearNextCache } from './helpers/next-cache';
import { readMildNudityIds, refreshMildNudityIndex, scheduleMildNuditySelfHeal } from '@/lib/mal-content';
const files = new Map<string, unknown>();
const key = 'mal/content/r-plus-v1.json';
const page = (ids: number[], current = 1, next = false) => Response.json({ data: ids.map(mal_id => ({ mal_id, rating: 'R+ - Mild Nudity' })), pagination: { current_page: current, has_next_page: next } });
beforeEach(() => {
  vi.resetAllMocks(); clearNextCache(); files.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T06:00:00Z')); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'test-token');
  vi.mocked(get).mockImplementation(async name => files.has(name) ? { statusCode: 200, stream: new Response(JSON.stringify(files.get(name))).body } as Awaited<ReturnType<typeof get>> : null);
  vi.mocked(put).mockImplementation(async (name, body) => { files.set(name, JSON.parse(body as string)); return {} as Awaited<ReturnType<typeof put>>; });
  vi.mocked(jikanFetch).mockImplementation(async () => page([11, 22]));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('reads a cold index without making MAL requests or caching its absence', async () => {
  expect(await readMildNudityIds()).toBeNull(); expect(jikanFetch).not.toHaveBeenCalled();
  await refreshMildNudityIndex();
  expect(await readMildNudityIds()).toEqual([11, 22]);
});
it('collects every page before publishing the complete daily index and coalesces concurrent warm calls', async () => {
  vi.mocked(jikanFetch).mockImplementation(async url => String(url).endsWith('page=1') ? page([11, 22], 1, true) : page([33], 2));
  expect(await Promise.all([refreshMildNudityIndex(), refreshMildNudityIndex()])).toEqual([true, true]);
  expect(await readMildNudityIds()).toEqual([11, 22, 33]);
  expect(jikanFetch).toHaveBeenCalledTimes(2); expect(put).toHaveBeenCalledOnce();
  expect(await refreshMildNudityIndex()).toBe(true); expect(jikanFetch).toHaveBeenCalledTimes(2);
});
it.each(['failed-page', 'unknown', 'rx', 'empty', 'wrong-page'])('retains yesterday on %s instead of publishing partial or unverified identities', async failure => {
  const old = { version: 1, rating: 'R+', savedAt: '2026-10-23T06:00:00Z', ids: [44] }; files.set(key, old);
  vi.mocked(jikanFetch).mockResolvedValueOnce(page([11], 1, true)).mockImplementationOnce(async () => {
    if (failure === 'failed-page') return new Response(null, { status: 503 });
    if (failure === 'empty') return page([], 2);
    if (failure === 'wrong-page') return page([22], 1);
    return Response.json({ data: [{ mal_id: 22, rating: failure === 'rx' ? 'Rx - Hentai' : null }], pagination: { current_page: 2, has_next_page: false } });
  });
  expect(await refreshMildNudityIndex()).toBe(false); expect(put).not.toHaveBeenCalled();
  clearNextCache(); expect(await readMildNudityIds()).toEqual([44]);
});
it('does not read or crawl without durable storage configured', async () => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  expect(await readMildNudityIds()).toBeNull(); expect(await refreshMildNudityIndex()).toBe(false);
  expect(get).not.toHaveBeenCalled(); expect(jikanFetch).not.toHaveBeenCalled();
});

it('self-heals a missing index from a search at most once per cooldown', async () => {
  expect(await readMildNudityIds()).toBeNull();
  expect(await scheduleMildNuditySelfHeal()).toBe(true);
  expect(await readMildNudityIds()).toEqual([11, 22]);
  expect(await scheduleMildNuditySelfHeal()).toBe(false);
  expect(jikanFetch).toHaveBeenCalledOnce();
});
