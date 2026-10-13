import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anime-ratings', () => ({ getAnimeRatings: async () => ({}) }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const candidate = { id: 21, name: 'Example', first_air_date: '2025-01-01', genre_ids: [16], origin_country: ['JP'] };

describe('localized TMDB synopses', () => {
  it('only uses the requested language after a conservative match', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test');
    const fetchMock = vi.fn(async (url: URL) => url.pathname.endsWith('/translations')
      ? Response.json({ translations: [
        { iso_639_1: 'en', data: { overview: 'English synopsis' } },
        { iso_639_1: 'it', iso_3166_1: 'IT', data: { overview: 'Trama italiana.' } },
        { iso_639_1: 'es', data: { overview: 'Sinopsis española.' } },
      ] })
      : Response.json({ results: [candidate] }));
    vi.stubGlobal('fetch', fetchMock);
    const { getLocalizedSynopsis } = await import('../lib/tmdb');
    expect(await getLocalizedSynopsis(['Example'], 2025, 'it', 'tv')).toBe('Trama italiana.');
    expect(fetchMock.mock.calls[1][0].pathname).toBe('/3/tv/21/translations');
  });
  it('does not substitute an English entry for an unavailable translation', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.pathname.endsWith('/translations')
      ? Response.json({ translations: [{ iso_639_1: 'en', data: { overview: 'English only' } }] })
      : Response.json({ results: [candidate] })));
    const { getLocalizedSynopsis } = await import('../lib/tmdb');
    expect(await getLocalizedSynopsis(['Example'], 2025, 'it', 'tv')).toBeNull();
  });
  it('refuses different adaptations or seasons rather than attaching a guessed synopsis', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test');
    const fetchMock = vi.fn(async () => Response.json({ results: [candidate] }));
    vi.stubGlobal('fetch', fetchMock);
    const { getLocalizedSynopsis } = await import('../lib/tmdb');
    expect(await getLocalizedSynopsis(['Example Season 3'], 2025, 'it', 'tv')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('skips lookups for the English source and contains network failures', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test');
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { getLocalizedSynopsis } = await import('../lib/tmdb');
    expect(await getLocalizedSynopsis(['Example'], 2025, 'en', 'tv')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getLocalizedSynopsis(['Example'], 2025, 'it', 'tv')).toBeNull();
  });
});
