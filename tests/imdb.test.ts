import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
beforeEach(() => { vi.resetModules(); vi.stubEnv('OMDB_API_KEY', 'fixture'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('validated IMDb scores', () => {
  it('deduplicates parallel lookups for the series IMDb ID and marks only valid scores ready', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ Response:'True', imdbRating:'9.1', imdbVotes:'746,262' }));
    vi.stubGlobal('fetch', fetchMock);
    const { getImdbScore } = await import('../lib/imdb');
    const first = getImdbScore('tt2560140'), second = getImdbScore('tt2560140');
    expect(first).toBe(second);
    expect(await first).toEqual({ imdbId:'tt2560140', imdbRating:'9.1', imdbVotes:'746,262', imdbStatus:'ready' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache:'no-store' });
  });
  it('keeps a quota error retryable and distinct from a missing score', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ Response:'False', Error:'Request limit reached!' }));
    vi.stubGlobal('fetch', fetchMock);
    const { getImdbScore } = await import('../lib/imdb');
    expect(await getImdbScore('tt123')).toEqual({ imdbId:'tt123', imdbStatus:'error' });
    await getImdbScore('tt123');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('honors a long Retry-After without a second request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status:429, headers:{'Retry-After':'60'} }));
    vi.stubGlobal('fetch', fetchMock);
    const { getImdbScore } = await import('../lib/imdb');
    expect((await getImdbScore('tt123')).imdbStatus).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not label an explicit N/A score ready', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ Response:'True', imdbRating:'N/A' })));
    const { getImdbScore } = await import('../lib/imdb');
    expect(await getImdbScore('tt123')).toEqual({ imdbId:'tt123', imdbStatus:'unavailable' });
  });
  it('rejects invalid IDs and detects missing configuration before making requests', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); vi.stubEnv('OMDB_API_KEY','');
    const { getImdbScore } = await import('../lib/imdb');
    expect((await getImdbScore('../tt123')).imdbStatus).toBe('unmatched');
    expect((await getImdbScore('tt123')).imdbStatus).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
