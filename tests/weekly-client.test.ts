import { afterEach, beforeEach, expect, it, vi } from 'vitest';
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('bounds stalled fetches and queued lookups and allows an explicit retry', async () => {
  const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetchMock);
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  const requests = [1, 2, 3, 4, 5, 6, 7].map(id => loadWeeklyLookup(`/api/weekly-title?week=2026-42&kind=tv&id=${id}`, new AbortController().signal).catch(error => error));
  await vi.advanceTimersByTimeAsync(60001);
  expect((await Promise.all(requests)).every(result => result instanceof Error)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(6);
  fetchMock.mockImplementation(async () => Response.json({ id: 7, kind: 'tv', providers: {}, providersUnavailable: false, recommendation: null }));
  await vi.advanceTimersByTimeAsync(25000);
  expect(await loadWeeklyLookup('/api/weekly-title?week=2026-42&kind=tv&id=7', new AbortController().signal)).toMatchObject({ id: 7 });
});
it('rejects stale responses that would replace cached scores with per-visit ratings', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 1, providers: {}, providersUnavailable: false, ratings: {} })));
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  await expect(loadWeeklyLookup('/api/weekly-title?week=2026-42&kind=tv&id=1', new AbortController().signal)).rejects.toThrow('Invalid weekly lookup');
});

it('starts the full calendar even when both streaming slots are stalled', async () => {
  const fetchMock = vi.fn(async (input: string) => {
    if (input.startsWith('/api/weekly-calendar?')) return Response.json({ events: [], episodeDates: [{ seriesId: 1, season: 1, episode: 2, date: '2026-10-14' }], anilistIds: {}, unavailable: false });
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  const controller = new AbortController();
  const watch = [1, 2, 3].map(id => loadWeeklyLookup(`/api/weekly-title?week=2026-42&kind=tv&id=${id}`, controller.signal).catch(error => error));
  const calendar = await loadWeeklyLookup('/api/weekly-calendar?week=2026-42', controller.signal);
  expect(calendar).toMatchObject({ episodeDates: [{ seriesId: 1, episode: 2 }] });
  expect(fetchMock).toHaveBeenCalledTimes(3); // Two watch requests and one independent calendar request.
  controller.abort();
  await Promise.all(watch);
  await vi.runAllTimersAsync();
});

it('recovers anime scores independently of stalled streaming and calendar requests', async () => {
  const fetchMock = vi.fn(async (input: string) => {
    if (input.startsWith('/api/weekly-ratings?')) return Response.json({ titles: { 'tv:1': { anilistId: 101, anilistScore: 88 } }, unavailable: false });
    return new Promise<Response>(() => {});
  });
  vi.stubGlobal('fetch', fetchMock);
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  const controller = new AbortController();
  const stalled = ['/api/weekly-title?id=1', '/api/weekly-title?id=2', '/api/weekly-calendar?week=2026-42'].map(url => loadWeeklyLookup(url, controller.signal).catch(error => error));
  expect(await loadWeeklyLookup('/api/weekly-ratings?week=2026-42', controller.signal)).toMatchObject({ titles: { 'tv:1': { anilistScore: 88 } } });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  controller.abort(); await Promise.all(stalled); await vi.runAllTimersAsync();
});

it.each(['/api/season-providers?year=2026&season=fall&page=1', '/api/search-providers?sort=popular'])('accepts platform snapshots from %s', async url => {
  const snapshot = { titles: { 'anilist:21': { providers: { IT: { link: '', providers: [{ provider_id: 9, provider_name: 'Amazon Prime Video', logo_path: null }] } }, providersUnavailable: false } }, unavailable: false };
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(snapshot)));
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  expect(await loadWeeklyLookup(url, new AbortController().signal)).toEqual(snapshot);
});

it('loads provider filter metadata independently of stalled streaming cards', async () => {
  const fetchMock = vi.fn(async (url: string) => url.startsWith('/api/weekly-providers?')
    ? Response.json({ titles: { 'tv:1': { providers: { IT: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } }, providersUnavailable: false } }, unavailable: false })
    : new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const { loadWeeklyLookup } = await import('../lib/weekly-client');
  const controller = new AbortController();
  const stalled = [1, 2].map(id => loadWeeklyLookup(`/api/weekly-title?week=2026-42&kind=tv&id=${id}`, controller.signal).catch(error => error));
  expect(await loadWeeklyLookup('/api/weekly-providers?week=2026-42', controller.signal)).toMatchObject({ unavailable: false, titles: { 'tv:1': { providersUnavailable: false } } });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  controller.abort(); await Promise.all(stalled); await vi.runAllTimersAsync();
});
