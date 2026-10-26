import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => {
  const cache = await import('./helpers/next-cache');
  return { ...cache, unstable_cache: vi.fn(cache.unstable_cache), revalidateTag: vi.fn(cache.revalidateTag) };
});
vi.mock('@vercel/blob', () => ({ BlobNotFoundError: class BlobNotFoundError extends Error {}, get: vi.fn(), put: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn() }));
import { get, put } from '@vercel/blob';
import { revalidateTag, unstable_cache } from 'next/cache';
import { getSeason } from '../lib/anilist';
import { clearNextCache } from './helpers/next-cache';
import { anime, snapshot, blobResult } from './fixtures/anilist-snapshot';
import { ANILIST_SNAPSHOT_TAG, findSnapshotAnime, readAniListSnapshotSeason, readSnapshotManifest, refreshAniListSnapshot, snapshotHealth } from '../lib/anilist-snapshot';

const currentKey = 'anilist/seasons/2026-fall.json';
const previousKey = 'anilist/seasons/2026-summer.json';
const manifestKey = 'anilist/manifest.json';
const files = new Map<string, unknown>();
const page = (media = [anime], hasNextPage = false) => ({ media, pageInfo: { currentPage: 1, hasNextPage } });
beforeEach(() => {
  clearNextCache(); vi.clearAllMocks(); files.clear();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  files.set(currentKey, snapshot); files.set(previousKey, { ...snapshot, season: 'summer' });
  vi.mocked(get).mockReset().mockImplementation(async key => files.has(key) ? blobResult(files.get(key)) : null);
  vi.mocked(put).mockReset().mockImplementation(async (key, body) => { files.set(key, JSON.parse(body as string)); return {} as Awaited<ReturnType<typeof put>>; });
  vi.mocked(getSeason).mockReset().mockResolvedValue(page());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it('writes bounded fresh pages with only display fields, private deterministic keys and a manifest', async () => {
  vi.mocked(getSeason).mockResolvedValueOnce(page([{ ...anime, secretExtra: 'discard', title: { ...anime.title, extra: 'discard' } } as typeof anime], true))
    .mockResolvedValueOnce(page([{ ...anime, id: 22 }])).mockResolvedValueOnce(page());
  const result = await refreshAniListSnapshot(new Date());
  expect(result).toMatchObject({ ok: true, written: 2, manifestFailed: false });
  expect(getSeason).toHaveBeenNthCalledWith(1, 2026, 'fall', 1, { fresh: true, maxWaitMs: 240000 });
  expect(getSeason).toHaveBeenNthCalledWith(2, 2026, 'fall', 2, expect.objectContaining({ fresh: true }));
  expect(getSeason).toHaveBeenNthCalledWith(3, 2026, 'summer', 1, expect.objectContaining({ fresh: true }));
  expect(files.get(currentKey)).toMatchObject({ version: 1, count: 2, savedAt: new Date().toISOString() });
  const saved = files.get(currentKey) as typeof snapshot;
  expect(saved.media[0].isAdult).toBe(false);
  expect(saved.media[0]).not.toHaveProperty('secretExtra'); expect(saved.media[0].title).not.toHaveProperty('extra');
  for (const [key, , options] of vi.mocked(put).mock.calls) {
    expect([currentKey, previousKey, manifestKey]).toContain(key);
    expect(options).toMatchObject({ access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    expect(revalidateTag).toHaveBeenCalledWith(key, { expire: 0 });
  }
  expect(await readSnapshotManifest()).toMatchObject({ version: 1, seasons: [{ key: currentKey, count: 2 }, { key: previousKey, count: 1 }] });
});

it('keeps both good files and the manifest on upstream failure, logging one JSON line per failed season', async () => {
  const manifest = { version: 1, savedAt: snapshot.savedAt, seasons: [{ key: currentKey, count: 1, savedAt: snapshot.savedAt }] };
  files.set(manifestKey, manifest);
  vi.mocked(getSeason).mockResolvedValue({ ...page([]), unavailable: true });
  expect(await refreshAniListSnapshot(new Date())).toMatchObject({ ok: false, written: 0 });
  expect(put).not.toHaveBeenCalled(); expect(files.get(currentKey)).toEqual(snapshot); expect(files.get(manifestKey)).toEqual(manifest);
  expect(console.error).toHaveBeenCalledTimes(2);
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject({ event: 'anilist_snapshot_failed', season: '2026-fall', reason: 'AniList unavailable' });
});

it.each(['empty', 'partial', 'limit', 'invalid'] as const)('does not replace a good season with %s data', async failure => {
  if (failure === 'empty') vi.mocked(getSeason).mockResolvedValue(page([]));
  if (failure === 'partial') vi.mocked(getSeason).mockResolvedValueOnce(page([anime], true)).mockResolvedValue({ ...page([]), unavailable: true });
  if (failure === 'limit') vi.mocked(getSeason).mockResolvedValue(page([anime], true));
  if (failure === 'invalid') vi.mocked(getSeason).mockResolvedValue(page([{ ...anime, title: null } as unknown as typeof anime]));
  expect((await refreshAniListSnapshot(new Date())).written).toBe(0);
  expect(vi.mocked(getSeason).mock.calls.length).toBeLessThanOrEqual(20);
  expect(put).not.toHaveBeenCalled(); expect(files.get(currentKey)).toEqual(snapshot);
});

it('reports partial success and retains the failed season timestamp in the manifest', async () => {
  vi.mocked(getSeason).mockResolvedValueOnce(page()).mockResolvedValueOnce({ ...page([]), unavailable: true });
  expect(await refreshAniListSnapshot(new Date())).toMatchObject({ ok: false, written: 1 });
  expect(files.get(previousKey)).toEqual({ ...snapshot, season: 'summer' });
  expect(await readSnapshotManifest()).toMatchObject({ seasons: [{ key: currentKey, savedAt: new Date().toISOString() }, { key: previousKey, savedAt: snapshot.savedAt }] });
});

it('validates the complete envelope before overwriting, even if upstream exceeds its page size', async () => {
  vi.mocked(getSeason).mockResolvedValue(page(Array.from({ length: 501 }, (_, index) => ({ ...anime, id: index + 1 }))));
  expect(await refreshAniListSnapshot(new Date())).toMatchObject({ ok: false, written: 0 });
  expect(put).not.toHaveBeenCalled(); expect(files.get(currentKey)).toEqual(snapshot);
});

it('reports storage/manifest failures without logging arbitrary SDK messages', async () => {
  vi.mocked(put).mockRejectedValueOnce(new Error('sensitive upstream details'));
  const result = await refreshAniListSnapshot(new Date());
  expect(result).toMatchObject({ ok: false, written: 1 });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('sensitive upstream details');
  expect(files.get(currentKey)).toEqual(snapshot);
  vi.mocked(put).mockImplementation(async key => { if (key === manifestKey) throw new Error('SDK failure'); return {} as Awaited<ReturnType<typeof put>>; });
  expect(await refreshAniListSnapshot(new Date())).toMatchObject({ ok: false, written: 2, manifestFailed: true });
});

it('caches valid reads with five-minute ISR and retries Blob errors and misses outside cache', async () => {
  vi.mocked(get).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
  expect(await readAniListSnapshotSeason(2026, 'fall')).toBeNull();
  expect(await readAniListSnapshotSeason(2026, 'fall')).toBeNull();
  expect(await readAniListSnapshotSeason(2026, 'fall')).toEqual(snapshot);
  expect(await readAniListSnapshotSeason(2026, 'fall')).toEqual(snapshot);
  expect(get).toHaveBeenCalledTimes(3);
  expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ['anilist-season-v1', currentKey], { revalidate: 300, tags: [ANILIST_SNAPSHOT_TAG, currentKey] });
  expect(get).toHaveBeenCalledWith(currentKey, expect.objectContaining({ access: 'private', useCache: false }));
  await refreshAniListSnapshot(new Date());
  expect((await readAniListSnapshotSeason(2026, 'fall'))?.savedAt).toBe(new Date().toISOString());
});

it.each([
  { ...snapshot, version: 2 }, { ...snapshot, count: 0 }, { ...snapshot, count: 2 }, { ...snapshot, season: 'summer' },
  { ...snapshot, savedAt: 'invalid' }, { ...snapshot, media: [{ ...anime, genres: null }] },
  { ...snapshot, media: [{ ...anime, relations: { edges: [null] } }] },
  { ...snapshot, media: [{ ...anime, nextAiringEpisode: { episode: 1 } }] },
  { ...snapshot, media: [{ ...anime, isAdult: 'yes' }] },
])('rejects malformed files without caching the miss: %j', async value => {
  files.set(currentKey, value);
  expect(await readAniListSnapshotSeason(2026, 'fall')).toBeNull();
  files.set(currentKey, snapshot);
  expect(await readAniListSnapshotSeason(2026, 'fall')).toEqual(snapshot);
});

it.each([{ version: 2, savedAt: snapshot.savedAt, seasons: [] }, { version: 1, savedAt: snapshot.savedAt, seasons: [{ key: currentKey, count: 0, savedAt: snapshot.savedAt }] }])('rejects invalid manifests and retries missing reads', async value => {
  expect(await readSnapshotManifest()).toBeNull(); files.set(manifestKey, value);
  expect(await readSnapshotManifest()).toBeNull();
});

it('searches both files by exact ID with current-season precedence', async () => {
  files.set(previousKey, { ...snapshot, season: 'summer', count: 2, media: [{ ...anime, description: 'Previous' }, { ...anime, id: 22 }] });
  expect(await findSnapshotAnime(21)).toEqual(anime); expect((await findSnapshotAnime(22))?.id).toBe(22);
  expect(await findSnapshotAnime(999)).toBeNull();
});

it('uses current and previous seasons across the UTC year boundary', async () => {
  await refreshAniListSnapshot(new Date('2027-01-01T00:00:00Z'));
  expect(getSeason).toHaveBeenCalledWith(2027, 'winter', 1, expect.any(Object));
  expect(getSeason).toHaveBeenCalledWith(2026, 'fall', 1, expect.any(Object));
});

it('measures the oldest required season rather than a fresh manifest', async () => {
  files.set(previousKey, { ...snapshot, season: 'summer', savedAt: '2026-10-20T05:00:00Z' });
  expect(await snapshotHealth(new Date())).toMatchObject({ ok: false, stale: true, ageHours: 25, savedAt: '2026-10-20T05:00:00Z' });
});

it('does no storage/upstream work without a Blob token', async () => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', ' ');
  expect(await readAniListSnapshotSeason(2026, 'fall')).toBeNull(); expect(await readSnapshotManifest()).toBeNull();
  expect(await snapshotHealth(new Date())).toMatchObject({ ok: false, stale: true, ageHours: null, savedAt: null, seasons: [] });
  expect(await refreshAniListSnapshot(new Date())).toMatchObject({ ok: false, written: 0 });
  expect(get).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(getSeason).not.toHaveBeenCalled();
});

it('keeps isAdult on read and tolerates legacy snapshots without it', async () => {
  files.set(currentKey, { ...snapshot, media: [{ ...anime, isAdult: true }] });
  expect((await readAniListSnapshotSeason(2026, 'fall'))?.media[0].isAdult).toBe(true);
  const { isAdult: _omit, ...legacy } = anime;
  files.set(previousKey, { ...snapshot, season: 'summer', media: [legacy] });
  expect((await readAniListSnapshotSeason(2026, 'summer'))?.media[0]).not.toHaveProperty('isAdult');
});
