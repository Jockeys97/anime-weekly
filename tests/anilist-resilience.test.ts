import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('@vercel/blob', () => ({ BlobNotFoundError: class BlobNotFoundError extends Error {}, get: vi.fn(), put: vi.fn() }));
// Exercise the actual live response classification, skipping only rate delays.
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: (...args: Parameters<typeof fetch>) => fetch(...args) }));
import { get, put } from '@vercel/blob';
import { clearNextCache } from './helpers/next-cache';
import { anime, snapshot, blobResult } from './fixtures/anilist-snapshot';
import { getAnimeWithSnapshot, getSeasonWithSnapshot } from '../lib/anilist-resilient';
import { GET as cronGET } from '../app/api/anilist-snapshot/route';
import { GET as healthGET, dynamic } from '../app/api/health/anilist-snapshot/route';

const files = new Map<string, unknown>();
const request = (authorization?: string) => new Request('https://example.test/api/anilist-snapshot', { headers: authorization ? { authorization } : {} });
beforeEach(() => {
  vi.clearAllMocks(); clearNextCache(); files.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token'); vi.stubEnv('CRON_SECRET', 'fixture-secret');
  files.set('anilist/seasons/2026-fall.json', snapshot);
  files.set('anilist/seasons/2026-summer.json', { ...snapshot, season: 'summer' });
  vi.mocked(get).mockImplementation(async key => files.has(key) ? blobResult(files.get(key)) : null);
  vi.mocked(put).mockImplementation(async (key, body) => { files.set(key, JSON.parse(body as string)); return {} as Awaited<ReturnType<typeof put>>; });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
  vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it.each([403, 500, 503])('serves detail data from Blob during HTTP %s without caching the live error', async status => {
  vi.mocked(fetch).mockImplementation(async () => new Response(null, { status }));
  expect(await getAnimeWithSnapshot(21)).toEqual(anime);
  // Recovery is immediate at the data layer, even with a warm snapshot cache.
  vi.mocked(fetch).mockImplementation(async () => Response.json({ data: { Media: { ...anime, description: 'Live again' } } }));
  expect((await getAnimeWithSnapshot(21))?.description).toBe('Live again');
});

it('serves the saved detail when the live network throws', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('offline'));
  expect(await getAnimeWithSnapshot(21)).toEqual(anime);
});

it('keeps an uncached transient error when AniList is down and the ID is absent', async () => {
  await expect(getAnimeWithSnapshot(999)).rejects.toThrow('Anime details unavailable (HTTP 403)');
  await expect(getAnimeWithSnapshot(999)).rejects.toThrow('Anime details unavailable (HTTP 403)');
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([200, 404])('returns null only for confirmed not-found with no snapshot (HTTP %s)', async status => {
  vi.mocked(fetch).mockImplementation(async () => Response.json({ data: { Media: null } }, { status }));
  expect(await getAnimeWithSnapshot(999)).toBeNull();
  expect(await getAnimeWithSnapshot(21)).toEqual(anime);
});

it('uses live success without consulting Blob', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ data: { Media: anime } }));
  expect(await getAnimeWithSnapshot(21)).toEqual(anime); expect(get).not.toHaveBeenCalled();
});

it('paginates the season fallback and keeps genuine empty live pages', async () => {
  const media = Array.from({ length: 51 }, (_, i) => ({ ...anime, id: i + 1 }));
  files.set('anilist/seasons/2026-fall.json', { ...snapshot, count: media.length, media });
  expect(await getSeasonWithSnapshot(2026, 'fall', 1)).toMatchObject({ stale: true, pageInfo: { currentPage: 1, hasNextPage: true }, media: media.slice(0, 50) });
  expect(await getSeasonWithSnapshot(2026, 'fall', 2)).toMatchObject({ stale: true, pageInfo: { currentPage: 2, hasNextPage: false }, media: media.slice(50) });
  expect(await getSeasonWithSnapshot(2025, 'fall')).toMatchObject({ unavailable: true, media: [] });
  vi.mocked(fetch).mockImplementation(async () => Response.json({ data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }));
  expect(await getSeasonWithSnapshot(2026, 'fall')).toEqual({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
});

it.each([undefined, 'Bearer wrong', 'Basic fixture-secret', 'Bearer fixture-secret-longer'])('rejects missing/wrong cron bearer: %s', async auth => {
  expect((await cronGET(request(auth))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled();
});

it.each(['', ' '])('rejects an unconfigured cron secret', async secret => {
  vi.stubEnv('CRON_SECRET', secret);
  expect((await cronGET(request('Bearer fixture-secret'))).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

it('returns 502 during a real 403 outage without overwriting good data, and warns about old copies', async () => {
  const old = { ...snapshot, savedAt: '2026-10-19T06:00:00Z' };
  files.set('anilist/seasons/2026-fall.json', old);
  const response = await cronGET(request('Bearer fixture-secret'));
  expect(response.status).toBe(502); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(put).not.toHaveBeenCalled(); expect(files.get('anilist/seasons/2026-fall.json')).toEqual(old);
  expect(console.error).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject({ event: 'anilist_snapshot_failed', season: '2026-fall', reason: 'AniList unavailable' });
  expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toMatchObject({ event: 'anilist_snapshot_stale', ageHours: 48 });
});

it.each([false, true])('returns %s partial/success status from cron, fetching without the daily live cache', async complete => {
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    const { variables } = JSON.parse(init?.body as string);
    if (!complete && variables.season === 'SUMMER') return new Response(null, { status: 403 });
    return Response.json({ data: { Page: { media: [anime], pageInfo: { hasNextPage: false } } } });
  });
  const response = await cronGET(request('Bearer fixture-secret'));
  expect(response.status).toBe(complete ? 200 : 207);
  expect(await response.json()).toMatchObject({ ok: complete, written: complete ? 2 : 1 });
  expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
});

it('returns public no-store health 200 when both required copies are fresh', async () => {
  const response = await healthGET();
  expect(dynamic).toBe('force-dynamic'); expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ ok: true, stale: false, ageHours: 0.5, savedAt: snapshot.savedAt, seasons: [{ key: 'anilist/seasons/2026-fall.json', count: 1 }, { key: 'anilist/seasons/2026-summer.json', count: 1 }] });
  expect(console.warn).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it.each(['old', 'missing', 'previous-missing'] as const)('returns health 503 with structured stale warning for %s copies', async state => {
  if (state === 'old') files.set('anilist/seasons/2026-fall.json', { ...snapshot, savedAt: '2026-10-20T05:00:00Z' });
  if (state === 'missing') files.clear();
  if (state === 'previous-missing') files.delete('anilist/seasons/2026-summer.json');
  const response = await healthGET();
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ ok: false, stale: true });
  expect(JSON.parse(vi.mocked(console.warn).mock.calls[0][0])).toMatchObject({ event: 'anilist_snapshot_stale', ageHours: state === 'old' ? 25 : state === 'missing' ? null : 0.5 });
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('fixture-token');
});
