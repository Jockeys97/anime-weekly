import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const background = vi.hoisted(() => ({ tasks: [] as Promise<void>[] }));
vi.mock('../lib/imdb-episode-index', () => ({ readImdbEpisodeChart: vi.fn() }));
import { readImdbEpisodeChart } from '../lib/imdb-episode-index';
vi.mock('../lib/imdb-datasets', () => ({ repairLegacyImdbRatingIndex: vi.fn(), ensureImdbEpisodeIndex: vi.fn() }));
import { repairLegacyImdbRatingIndex, ensureImdbEpisodeIndex } from '../lib/imdb-datasets';
vi.mock('server-only', () => ({}));
vi.mock('../lib/week-archive', async () => {
  const { formatWeek, isoWeek } = await import('../lib/week');
  return { writeWeekArchive: vi.fn(), isClosedWeek: (week: { year: number; week: number }) => formatWeek(week) < formatWeek(isoWeek(new Date())) };
});
import { writeWeekArchive } from '../lib/week-archive';
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn((callback: () => Promise<void>) => { background.tasks.push(callback()); }) }));
vi.mock('../lib/weekly-ratings', () => ({ WEEKLY_PAGE_TAG: 'weekly-page-output', WEEKLY_RATINGS_TAG: 'weekly-ratings', primeWeeklyRatings: vi.fn(), readWeeklyRatingsSnapshot: vi.fn(), storeWeeklyRatingsSnapshot: vi.fn(), storeRatingsStore: vi.fn(), readRatingsStore: vi.fn(), isWeeklyRatingComplete: (rating: { malScore?: number; anilistScore?: number; imdbRating?: string }) => rating.malScore != null && rating.anilistScore != null && Boolean(rating.imdbRating) }));
vi.mock('../lib/imdb', () => ({ readSharedImdbScore: vi.fn(), hasImdbScore: (rating: { imdbRating?: string }) => Boolean(rating.imdbRating) }));
vi.mock('../lib/weekly-episode-ratings', () => ({ primeWeeklyEpisodes: vi.fn() }));
import { primeWeeklyEpisodes } from '../lib/weekly-episode-ratings';
import { readSharedImdbScore } from '../lib/imdb';

import { revalidatePath, revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { primeWeeklyRatings, readWeeklyRatingsSnapshot, storeWeeklyRatingsSnapshot, storeRatingsStore, readRatingsStore } from '../lib/weekly-ratings';
import { GET, POST, maxDuration } from '../app/api/revalidate/route';
beforeEach(() => {
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  vi.mocked(writeWeekArchive).mockResolvedValue({ week: '2026-41', status: 'written', titleCount: 1 });
  vi.mocked(repairLegacyImdbRatingIndex).mockResolvedValue(true);
  vi.mocked(ensureImdbEpisodeIndex).mockResolvedValue(true);
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ stored: true })));
});

it.each(['2026-42', '2026-43', '2026-54', '2025-53', '', '../2026-41'])('rejects an invalid or open archive week: %s', async archive => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await GET(new Request(`https://example.test/api/revalidate?archive=${encodeURIComponent(archive)}`, { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(400);
  expect(writeWeekArchive).not.toHaveBeenCalled(); expect(primeWeeklyRatings).not.toHaveBeenCalled();
});

it('authenticates manual archives before public read modes and performs only the requested archive work', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  expect((await GET(new Request('https://example.test/api/revalidate?archive=2026-41&ratings=2026-42'))).status).toBe(401);
  expect(writeWeekArchive).not.toHaveBeenCalled(); expect(readWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  const response = await GET(new Request('https://example.test/api/revalidate?archive=2026-41', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toEqual({ week: '2026-41', status: 'written', titleCount: 1 });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(writeWeekArchive).toHaveBeenCalledExactlyOnceWith({ year: 2026, week: 41 });
  expect(primeWeeklyRatings).not.toHaveBeenCalled(); expect(after).not.toHaveBeenCalled();
});

it('reports manual storage failures so the cron caller can log and retry them', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  vi.mocked(writeWeekArchive).mockResolvedValue({ week: '2026-41', status: 'failed' });
  expect((await GET(new Request('https://example.test/api/revalidate?archive=2026-41', { headers: { Authorization: 'Bearer fixture' } }))).status).toBe(503);
});

it('archives the previous UTC ISO week in a fresh authenticated request after normal daily persistence', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.setSystemTime(new Date('2025-12-29T06:00:00Z'));
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ titles: {}, events: [], total: 0, storeHits: 0, store: { ratings: {}, sources: {} } });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200); expect(fetch).not.toHaveBeenCalled();
  await finishBackground();
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe('https://example.test/api/revalidate?store=2026-01');
  expect(fetch).toHaveBeenNthCalledWith(2, new URL('https://example.test/api/revalidate?archive=2025-52&background=1'), expect.objectContaining({ method: 'POST', body: JSON.stringify({ titles: {}, events: [] }), headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, cache: 'no-store', signal: expect.any(AbortSignal) }));
  expect(writeWeekArchive).not.toHaveBeenCalled(); // The self-request gets a fresh function budget.
});

it('still schedules archiving when the daily collector is already complete, and tolerates Blob request failure', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [], availability: { titles: {}, providers: {} }, episodes: { entries: [], status: 'ready', collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } });
  vi.mocked(fetch).mockRejectedValue(new Error('Storage invocation unavailable'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
    expect(await response.json()).toMatchObject({ revalidated: true, cached: true });
    await finishBackground();
    expect(fetch).toHaveBeenCalledOnce(); expect(log).toHaveBeenCalled();
    expect(primeWeeklyRatings).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it('schedules archiving even when the daily rating collectors fail', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockRejectedValue(new Error('Unavailable'));
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200);
  await finishBackground();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(new URL('https://example.test/api/revalidate?archive=2026-41&background=1'), expect.anything());
});

it('acknowledges authenticated cron archive dispatch before doing background work', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await GET(new Request('https://example.test/api/revalidate?archive=2026-41&background=1', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ week: '2026-41', status: 'scheduled' });
  await finishBackground();
  expect(writeWeekArchive).toHaveBeenCalledExactlyOnceWith({ year: 2026, week: 41 });
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
});

it('captures closed-week ratings before invalidation and carries them through the separate archive POST', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture'); vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
  const closed = { titles: { 'tv:1': { imdbRating: '8.1' } }, events: [{ id: 1, mediaId: 123, episode: 2, airingAt: 1791450000 }] };
  vi.mocked(readWeeklyRatingsSnapshot).mockImplementation(async slug => slug === '2026-41' ? closed : { titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ titles: {}, events: [], total: 0, storeHits: 0, store: { ratings: {}, sources: {} } });
  vi.mocked(fetch).mockImplementation(async (input, init) => POST(new Request(input, init)));
  await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(readWeeklyRatingsSnapshot).toHaveBeenNthCalledWith(1, '2026-41');
  expect(vi.mocked(readWeeklyRatingsSnapshot).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(revalidateTag).mock.invocationCallOrder[0]);
  await finishBackground();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string)).toEqual(closed);
  expect(writeWeekArchive).toHaveBeenCalledExactlyOnceWith({ year: 2026, week: 41 }, closed);
});

it('rejects malformed archive POST snapshots before scheduling or writing', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await POST(new Request('https://example.test/api/revalidate?archive=2026-41&background=1', {
    method: 'POST', headers: { authorization: 'Bearer fixture' }, body: JSON.stringify({ titles: [], events: [] }),
  }));
  expect(response.status).toBe(400); expect(after).not.toHaveBeenCalled(); expect(writeWeekArchive).not.toHaveBeenCalled();
});
async function finishBackground() {
  await vi.runAllTimersAsync();
  await Promise.all(background.tasks);
  background.tasks.length = 0;
}
afterEach(async () => {
  await finishBackground();
  vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});
it('requires the existing cron secret before doing work', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  expect((await GET(new Request('https://example.test/api/revalidate'))).status).toBe(401);
  expect(repairLegacyImdbRatingIndex).not.toHaveBeenCalled();
  expect(ensureImdbEpisodeIndex).not.toHaveBeenCalled();
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('computes ratings, invalidates their tag, then stores through a separate POST after the response', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const store = { ratings: { 'anilist:123': { values: { anilistScore: 81 }, fetchedAt: Date.now(), lastSeenAt: Date.now() } }, sources: { 'tv:1': { anilistId: 123, fetchedAt: Date.now(), lastSeenAt: Date.now() } } };
  const snapshot = { titles: { 'tv:1': { anilistId: 123, anilistScore: 81, malScore: 8, imdbRating: '8.1' } }, events: [], names: { 'tv:1': 'Ranma ½' } };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ total: 1, store, storeHits: 1, ...snapshot });
  vi.mocked(fetch).mockImplementation(async (input, init) => POST(new Request(input, init)));
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ revalidated: true, week: '2026-42', total: 1, populated: 1, unavailable: 0, complete: true, storeHits: 1 });
  expect(maxDuration).toBe(300);
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(revalidateTag).toHaveBeenNthCalledWith(1, 'anime-week', { expire: 0 });
  expect(revalidateTag).toHaveBeenNthCalledWith(2, 'weekly-ratings', { expire: 0 });
  expect(revalidateTag).toHaveBeenNthCalledWith(3, 'weekly-page-output', { expire: 0 });
  expect(vi.mocked(primeWeeklyRatings).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(revalidateTag).mock.invocationCallOrder[1]);
  expect(vi.mocked(revalidateTag).mock.invocationCallOrder[1]).toBeLessThan(vi.mocked(after).mock.invocationCallOrder[0]);
  expect(after).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  await finishBackground();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://example.test/api/revalidate?store=2026-42', {
    method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify({ snapshot, store }),
  });
  expect(storeWeeklyRatingsSnapshot).toHaveBeenCalledExactlyOnceWith('2026-42', snapshot);
  expect(storeRatingsStore).toHaveBeenCalledExactlyOnceWith(store);
  expect(revalidateTag).toHaveBeenNthCalledWith(4, 'weekly-page-output', { expire: 0 });
  expect(vi.mocked(storeWeeklyRatingsSnapshot).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(revalidateTag).mock.invocationCallOrder[3]);
});
it('keeps public snapshot reads independent of authentication and provider work', async () => {
  const snapshot = { titles: { 'tv:1': { malScore: 8 } }, events: [] };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(snapshot);
  const response = await GET(new Request('https://example.test/api/revalidate?ratings=2026-42'));
  expect(await response.json()).toEqual(snapshot);
  expect(response.headers.get('cache-control')).toBe('public, s-maxage=300');
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('reports incomplete snapshots including titles omitted by the job budget', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, events: [] };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ ...previous, total: 3, store: { ratings: {}, sources: {} }, storeHits: 0 });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ total: 3, populated: 1, unavailable: 2, complete: false });
  expect(primeWeeklyRatings).toHaveBeenCalledWith('2026-42', previous);
  expect(revalidateTag).toHaveBeenCalledTimes(3);
  await finishBackground();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ snapshot: previous, store: { ratings: {}, sources: {} } });
});
it('preserves the ratings tag and skips storage when computation fails', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(primeWeeklyRatings).mockRejectedValue(new Error('Weekly ratings unavailable'));
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ revalidated: true, unavailable: 1, complete: false });
  expect(revalidateTag).toHaveBeenCalledTimes(2);
  expect(revalidateTag).not.toHaveBeenCalledWith('weekly-ratings', expect.anything());
  expect(after).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
function storeRequest(store: string | null = '2026-42', body = JSON.stringify({ titles: {}, events: [] }), authorization?: string) {
  return new Request(`https://example.test/api/revalidate${store === null ? '' : `?store=${store}`}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorization === undefined ? {} : { authorization }) }, body,
  });
}
it.each([undefined, '', 'Basic fixture', 'Bearer wrong', 'Bearer fixture-extra'])('rejects POST authorization %s before reading or storing the snapshot', async authorization => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await POST(storeRequest(null, 'invalid JSON', authorization));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'unauthorized' });
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it.each(['', '   '])('rejects POST when the cron secret is missing or blank (%j)', async secret => {
  vi.stubEnv('CRON_SECRET', secret);
  expect((await POST(storeRequest('2026-42', undefined, `Bearer ${secret}`))).status).toBe(401);
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it.each([null, '', 'invalid', '2026-00', '2026-54', '2025-53'])('rejects invalid POST week %s', async slug => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await POST(storeRequest(slug, 'invalid JSON', 'Bearer fixture'));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid week' });
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it.each(['invalid JSON', 'null', '{}', '{"titles":null,"events":[]}', '{"titles":[],"events":[]}', '{"titles":"invalid","events":[]}', '{"titles":{}}', '{"titles":{},"events":null}', '{"titles":{},"events":{}}'])('rejects invalid POST snapshot %s', async body => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const response = await POST(storeRequest('2026-42', body, 'Bearer fixture'));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid snapshot' });
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
});
it('stores an authenticated POST snapshot and refreshes page output after storage', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const snapshot = { titles: { 'tv:1': { malScore: 8 } }, events: [{ id: 4, mediaId: 123, episode: 2, airingAt: 1791990000 }], names: { 'tv:1': 'Ranma ½' } };
  const response = await POST(storeRequest('2026-42', JSON.stringify(snapshot), 'Bearer fixture'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ stored: true, titles: 1 });
  expect(storeWeeklyRatingsSnapshot).toHaveBeenCalledExactlyOnceWith('2026-42', snapshot);
  expect(revalidateTag).toHaveBeenCalledExactlyOnceWith('weekly-page-output', { expire: 0 });
  expect(vi.mocked(storeWeeklyRatingsSnapshot).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(revalidateTag).mock.invocationCallOrder[0]);
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(readWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it('reads episode rankings without warming IMDb, and does not substitute series scores', async () => {
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: { 'tv:1': { imdbRating: '9.9', anilistScore: 95 } }, events: [] });
  const response = await GET(new Request('https://example.test/api/revalidate?episodes=2026-42'));
  expect(await response.json()).toEqual({ entries: [], status: 'pending' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(primeWeeklyEpisodes).not.toHaveBeenCalled();
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves series ratings and publishes episodes even when series warming fails', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, events: [] };
  const episodes = { entries: [], status: 'ready' as const, updatedAt: '2026-10-14T12:00:00Z' };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  vi.mocked(primeWeeklyRatings).mockRejectedValue(new Error('Quota'));
  vi.mocked(primeWeeklyEpisodes).mockResolvedValue(episodes);
  await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  await finishBackground();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).toEqual({ snapshot: { ...previous, episodes }, store: { ratings: {}, sources: {} } });
});
it.each([null, {}, { ratings: [], sources: {} }, { ratings: {}, sources: null }, { ratings: { 'imdb:tt123': { values: {}, fetchedAt: 'invalid', lastSeenAt: 0 } }, sources: {} }])('rejects an invalid cross-week store before writing either cache (%j)', async store => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const body = JSON.stringify({ snapshot: { titles: {}, events: [] }, store });
  const response = await POST(storeRequest('2026-42', body, 'Bearer fixture'));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid store' });
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(storeRatingsStore).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();

});

it('repairs a legacy episode failure without spending more series-rating quota', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, events: [], availability: { titles: { 'tv:1': { countries: {}, fetchedAt: Date.now() } }, providers: {} }, episodes: { entries: [], status: 'unavailable' as const, updatedAt: '2026-10-14T10:00:00Z' } };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  const episodes = { entries: [], status: 'ready' as const, collectorVersion: 4, updatedAt: '2026-10-14T12:00:00Z' };
  vi.mocked(primeWeeklyEpisodes).mockResolvedValue(episodes);
  await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  await finishBackground();
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).snapshot).toEqual({ ...previous, episodes });
});

it('reuses the completed daily job without invalidation, persistence or vendor calls on manual repeats', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [], availability: { titles: {}, providers: {} }, episodes: { entries: [], status: 'ready', collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ cached: true, indexReady: true, episodeIndexReady: true, episodeStatus: 'ready' });
  expect(repairLegacyImdbRatingIndex).toHaveBeenCalledOnce();
  expect(ensureImdbEpisodeIndex).toHaveBeenCalledOnce();
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(primeWeeklyEpisodes).not.toHaveBeenCalled();
  expect(revalidateTag).not.toHaveBeenCalled();
  expect(after).not.toHaveBeenCalled();
});

it('serves an exact cached IMDb score publicly without calling either writer or a rating vendor', async () => {
  vi.mocked(readSharedImdbScore).mockResolvedValue({ imdbId: 'tt2560140', imdbRating: '9.1', imdbStatus: 'ready' });
  const response = await GET(new Request('https://example.test/api/revalidate?imdb=tt2560140'));
  expect(await response.json()).toMatchObject({ imdbId: 'tt2560140', imdbRating: '9.1' });
  expect(response.headers.get('cache-control')).toContain('s-maxage=300');
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(primeWeeklyEpisodes).not.toHaveBeenCalled();
  expect(repairLegacyImdbRatingIndex).not.toHaveBeenCalled();
  expect(ensureImdbEpisodeIndex).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it('never caches a missing IMDb value or fills it on a public read', async () => {
  vi.mocked(readSharedImdbScore).mockResolvedValue({ imdbId: 'tt1', imdbStatus: 'unavailable' });
  const response = await GET(new Request('https://example.test/api/revalidate?imdb=tt1'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(fetch).not.toHaveBeenCalled();
  expect((await GET(new Request('https://example.test/api/revalidate?imdb=bad'))).status).toBe(400);
  expect(readSharedImdbScore).toHaveBeenCalledTimes(1);
});

it('roundtrips compact provider snapshots and cross-week availability through the cron storage request', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const availability = { titles: { 'tv:1': { countries: { IT: [8], US: [8] }, fetchedAt: Date.now() } }, providers: { 8: { name: 'Netflix', logo: '/logo.png' } } };
  const snapshot = { titles: { 'tv:1': { imdbRating: '8.1' } }, events: [], availability };
  const store = { ratings: {}, sources: {}, availability: { ...availability, titles: { 'tv:1': { ...availability.titles['tv:1'], lastSeenAt: Date.now() } } } };
  const response = await POST(storeRequest('2026-42', JSON.stringify({ snapshot, store }), 'Bearer fixture'));
  expect(response.status).toBe(200);
  expect(storeWeeklyRatingsSnapshot).toHaveBeenCalledExactlyOnceWith('2026-42', snapshot);
  expect(storeRatingsStore).toHaveBeenCalledExactlyOnceWith(store);
});

it('rejects broken provider references before writing any snapshot', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const snapshot = { titles: {}, events: [], availability: { titles: { 'tv:1': { countries: { US: [8] }, fetchedAt: 1 } }, providers: {} } };
  const response = await POST(storeRequest('2026-42', JSON.stringify(snapshot), 'Bearer fixture'));
  expect(response.status).toBe(400);
  expect(storeWeeklyRatingsSnapshot).not.toHaveBeenCalled();
  expect(storeRatingsStore).not.toHaveBeenCalled();
});

it('migrates a same-day snapshot that predates availability collection', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: {}, events: [], episodes: { entries: [], status: 'ready' as const, collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ ...previous, availability: { titles: {}, providers: {} }, total: 0, store: { ratings: {}, sources: {} }, storeHits: 0 });
  await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(primeWeeklyRatings).toHaveBeenCalledOnce();
  expect(after).toHaveBeenCalledOnce();
});

it('resumes incomplete availability even after same-day episode collection', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, names: { 'tv:1': 'Known', 'tv:2': 'Pending' }, events: [],
    availability: { titles: { 'tv:1': { countries: {}, fetchedAt: Date.now() } }, providers: {} },
    episodes: { entries: [], status: 'ready' as const, collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } };
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue(previous);
  vi.mocked(primeWeeklyRatings).mockResolvedValue({ ...previous, total: 2, store: { ratings: {}, sources: {} }, storeHits: 1 });
  await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(primeWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-42', previous);
  expect(after).toHaveBeenCalledOnce();
});

it('serves full-series episode charts from the collector cache without running any writer', async () => {
  vi.mocked(readImdbEpisodeChart).mockResolvedValue({ status: 'ready', episodes: [{ imdbId: 'tt1', season: 4, episode: 17, score: 9.1, votes: 100 }] });
  const response = await GET(new Request('https://example.test/api/revalidate?episodeChart=tt2560140'));
  expect(await response.json()).toMatchObject({ seriesId: 'tt2560140', status: 'ready', episodes: [{ season: 4, episode: 17 }] });
  expect(primeWeeklyEpisodes).not.toHaveBeenCalled(); expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(repairLegacyImdbRatingIndex).not.toHaveBeenCalled();
  expect(ensureImdbEpisodeIndex).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});

it('reports a missing chart index even when the weekly snapshot and title scores are complete', async () => {
  vi.stubEnv('CRON_SECRET', 'fixture');
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [], availability: { titles: {}, providers: {} }, episodes: { entries: [], status: 'ready', collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } });
  vi.mocked(ensureImdbEpisodeIndex).mockResolvedValue(false);
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ cached: true, indexReady: true, episodeIndexReady: false });
  expect(ensureImdbEpisodeIndex).toHaveBeenCalledOnce();
  expect(primeWeeklyRatings).not.toHaveBeenCalled();
  expect(primeWeeklyEpisodes).not.toHaveBeenCalled();
});
