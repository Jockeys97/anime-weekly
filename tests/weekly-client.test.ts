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
