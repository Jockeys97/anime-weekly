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
});
