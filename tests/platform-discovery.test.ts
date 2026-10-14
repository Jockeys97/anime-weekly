import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { getPlatformAnime } from '../lib/tmdb';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('discovers two pages per kind with regional filters and daily caching, without enrichment', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test-key'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const fetchMock = vi.fn(async (url: URL) => Response.json({ results: [{ id: 1, name: 'Anime', title: 'Film', popularity: url.pathname.endsWith('movie') ? 99 : 1 }], total_pages: 2 }));
  vi.stubGlobal('fetch', fetchMock);
  const data = await getPlatformAnime(8, 'IT');
  expect(data.titles.map(anime => anime.kind)).toEqual(['movie', 'tv']);
  expect(fetchMock).toHaveBeenCalledTimes(4);
  for (const [url, init] of fetchMock.mock.calls as unknown as [URL, RequestInit & { next: { revalidate: number } }][]) {
    expect(url.pathname).toMatch(/\/discover\/(tv|movie)$/);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ with_watch_providers: '8', watch_region: 'IT', with_genres: '16', with_origin_country: 'JP', sort_by: 'popularity.desc', language: 'it-IT' });
    expect(init.next.revalidate).toBe(86400);
  }
  expect(data.titles.every(anime => Object.keys(anime.ratings).length === 0)).toBe(true);
});
it('returns a retryable unavailable state when discovery fails', async () => {
  vi.stubEnv('TMDB_API_KEY', 'test-key'); vi.stubEnv('TMDB_READ_TOKEN', '');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(await getPlatformAnime(8, 'IT')).toEqual({ status: 'error', titles: [] });
});
