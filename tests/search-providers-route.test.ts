import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../lib/anilist', () => ({ discoverAnime: vi.fn() }));
vi.mock('../lib/platform-metadata', () => ({ getAnimePlatformMetadata: vi.fn() }));
import { discoverAnime } from '../lib/anilist';
import { getAnimePlatformMetadata } from '../lib/platform-metadata';
import { GET } from '../app/api/search-providers/route';
afterEach(() => { vi.resetAllMocks(); });

const anime = { id: 21, title: { english: 'One Piece' } } as Awaited<ReturnType<typeof discoverAnime>>['media'][number];

it('loads platforms for exactly the search page the visitor sees', async () => {
  vi.mocked(discoverAnime).mockResolvedValue({ media: [anime], pageInfo: { currentPage: 2, hasNextPage: true } });
  const snapshot = { unavailable: false, titles: { 'anilist:21': { providers: { IT: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } }, providersUnavailable: false } } };
  vi.mocked(getAnimePlatformMetadata).mockResolvedValue(snapshot as Awaited<ReturnType<typeof getAnimePlatformMetadata>>);
  const response = await GET(new Request('https://anime.example/api/search-providers?q=one&genre=Action&sort=score&page=2'));
  expect(discoverAnime).toHaveBeenCalledWith(expect.objectContaining({ q: 'one', genre: 'Action', sort: 'score', page: 2 }));
  expect(getAnimePlatformMetadata).toHaveBeenCalledWith([anime]);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
  expect(await response.json()).toEqual(snapshot);
});

it('never caches partial or failed lookups', async () => {
  vi.mocked(discoverAnime).mockResolvedValue({ media: [anime], pageInfo: { currentPage: 1, hasNextPage: false } });
  vi.mocked(getAnimePlatformMetadata).mockResolvedValue({ unavailable: true, titles: {} });
  expect((await GET(new Request('https://anime.example/api/search-providers?sort=popular'))).headers.get('cache-control')).toBe('no-store');
  vi.mocked(discoverAnime).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false }, unavailable: true });
  const failed = await GET(new Request('https://anime.example/api/search-providers?sort=popular'));
  expect(failed.status).toBe(503);
  expect(failed.headers.get('cache-control')).toBe('no-store');
});
