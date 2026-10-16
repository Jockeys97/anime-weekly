import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const summary = (id: number) => Response.json({ ratings: { anilistId: id, anilistScore: 85 }, availability: { match: null, providers: {}, providersUnavailable: false } });
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
describe('visible card request queue', () => {
  it('deduplicates the same anime request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(summary(21)); vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    const first = loadCatalogCard(21), second = loadCatalogCard(21);
    expect(first).toBe(second);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('runs at most two card lookups simultaneously', async () => {
    const complete: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => complete.push(resolve))); vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    const first = loadCatalogCard(1), second = loadCatalogCard(2), third = loadCatalogCard(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    complete[0](summary(1));
    await first;
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    complete[1](summary(2)); complete[2](summary(3));
    await Promise.all([second, third]);
  });
  it('allows retry after a failure instead of retaining a rejected cache entry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(summary(21)); vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    await expect(loadCatalogCard(21)).rejects.toThrow('Catalog card unavailable');
    expect((await loadCatalogCard(21)).ratings.anilistId).toBe(21);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('cancels old-page requests and skips abandoned queued cards', async () => {
    const finish = new Map<number, (value: Response) => void>();
    const fetchMock = vi.fn((url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
      finish.set(Number(new URL(url, 'https://example.test').pathname.split('/').at(-1)), resolve);
      init.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once:true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const previous = controllers.map((controller, index) => loadCatalogCard(index + 1, controller.signal).catch(() => null));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    controllers.forEach(controller => controller.abort());
    const next = loadCatalogCard(4);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/anime-card/1?ratings=v3&watch=v3','/api/anime-card/2?ratings=v3&watch=v3','/api/anime-card/4?ratings=v3&watch=v3']);
    finish.get(4)!(summary(4));
    await next; await Promise.all(previous);
  });
  it('keeps a shared request alive when only one of its consumers leaves', async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    const first = new AbortController(), second = new AbortController();
    const leaving = loadCatalogCard(21, first.signal).catch(() => null);
    const staying = loadCatalogCard(21, second.signal);
    first.abort();
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(false);
    finish(summary(21));
    expect((await staying).ratings.anilistId).toBe(21);
    await leaving;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not retain n/a responses, but reuses confirmed scores', async () => {
    const rated = () => Response.json({ ratings: { anilistId:21, imdbRating:'8.4' }, availability:{ providers:{} } });
    const fetchMock = vi.fn().mockResolvedValueOnce(summary(21)).mockImplementation(rated);
    vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    await loadCatalogCard(21);
    expect((await loadCatalogCard(21)).ratings.imdbRating).toBe('8.4');
    await loadCatalogCard(21);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

});

it('allows a subsequent load to recover from a 200 response containing an IMDb error', async () => {
  vi.resetModules();
  const bad = Response.json({ ratings: { anilistId: 21, imdbStatus: 'error' }, availability: { match: null, providers: {}, providersUnavailable: false } });
  const good = Response.json({ ratings: { anilistId: 21, imdbStatus: 'ready', imdbRating: '8' }, availability: { match: null, providers: {}, providersUnavailable: false } });
  const fetchMock = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good); vi.stubGlobal('fetch', fetchMock);
  const { loadCatalogCard } = await import('../lib/catalog-card-client');
  expect((await loadCatalogCard(21)).ratings.imdbStatus).toBe('error');
  expect((await loadCatalogCard(21)).ratings.imdbRating).toBe('8');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('settles hung fetch/body readers and queued cards, then allows a retry', async () => {
  vi.useFakeTimers();
  try {
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetchMock);
    const { loadCatalogCard } = await import('../lib/catalog-card-client');
    const requests = [1, 2, 3, 4, 5].map(id => loadCatalogCard(id).catch(error => error));
    await vi.advanceTimersByTimeAsync(60001);
    const results = await Promise.all(requests);
    expect(results.every(result => result instanceof Error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4); // The fifth expired in the queue.
    fetchMock.mockImplementation(async () => summary(5));
    await vi.advanceTimersByTimeAsync(30000); // Existing slots finish their deadlines.
    expect((await loadCatalogCard(5)).ratings.anilistId).toBe(5);
  } finally { vi.useRealTimers(); }
});
