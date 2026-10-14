import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const background = vi.hoisted(() => ({ tasks: [] as Promise<void>[] }));
vi.mock('server-only', () => ({}));
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
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ stored: true })));
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
  const previous = { titles: { 'tv:1': { anilistScore: 81 } }, events: [], episodes: { entries: [], status: 'unavailable' as const, updatedAt: '2026-10-14T10:00:00Z' } };
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
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [], episodes: { entries: [], status: 'ready', collectorVersion: 4, updatedAt: '2026-10-14T06:00:00Z' } });
  const response = await GET(new Request('https://example.test/api/revalidate', { headers: { Authorization: 'Bearer fixture' } }));
  expect(await response.json()).toMatchObject({ cached: true, episodeStatus: 'ready' });
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
