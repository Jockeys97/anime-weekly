import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', async () => ({ ...(await vi.importActual<object>('../lib/anilist')), getFavoriteAnime: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getTmdbTitleCard: vi.fn() }));
import { getFavoriteAnime } from '../lib/anilist';
import { getTmdbTitleCard } from '../lib/tmdb';
import { favoriteIds, sortFavorites } from '../lib/favorites';
import { GET } from '../app/api/favorites/route';
afterEach(() => vi.resetAllMocks());

it('accepts only valid, unique watchlist ids', () => {
  expect(favoriteIds('anilist:1,anilist:1,tv:2,bad,anilist:0,movie:3')).toEqual(['anilist:1', 'tv:2', 'movie:3']);
  expect(favoriteIds(null)).toEqual([]);
});
it('puts upcoming episodes first, soonest first, then the rest by name', () => {
  const items = [{ id: 'a', name: 'Zeta', poster: null, href: '/' }, { id: 'b', name: 'Beta', poster: null, href: '/', next: { episode: 3, airingAt: 200 } }, { id: 'c', name: 'Alpha', poster: null, href: '/' }, { id: 'd', name: 'Delta', poster: null, href: '/', next: { episode: 9, airingAt: 100 } }];
  expect(sortFavorites(items, 'it').map(item => item.id)).toEqual(['d', 'b', 'c', 'a']);
});
it('resolves AniList and TMDB-only favourites to cards with the next episode', async () => {
  vi.mocked(getFavoriteAnime).mockResolvedValue({ unavailable: false, media: [{ id: 185874, title: { english: 'BLEACH: Thousand-Year Blood War - The Calamity', romaji: null, native: null }, coverImage: { large: 'https://s4.anilist.co/x.jpg' }, format: 'TV', status: 'RELEASING', episodes: 10, nextAiringEpisode: { episode: 10, airingAt: 1793026800 } }] } as never);
  vi.mocked(getTmdbTitleCard).mockResolvedValue({ name: 'Doraemon', poster: null });
  const response = await GET(new Request('https://example.com/api/favorites?ids=anilist:185874,tv:57911'));
  const body = await response.json();
  expect(body.unavailable).toBe(false);
  expect(body.items).toEqual([
    { id: 'anilist:185874', name: 'BLEACH: Thousand-Year Blood War - The Calamity', poster: 'https://s4.anilist.co/x.jpg', href: expect.stringMatching(/^\/anime\/185874-/), status: 'RELEASING', next: { episode: 10, airingAt: 1793026800 } },
    { id: 'tv:57911', name: 'Doraemon', poster: null, href: '/search?q=Doraemon' },
  ]);
  expect(response.headers.get('cache-control')).toContain('s-maxage=600');
});
it('reports partial results and does not cache an AniList outage', async () => {
  vi.mocked(getFavoriteAnime).mockResolvedValue({ unavailable: true, media: [] });
  const response = await GET(new Request('https://example.com/api/favorites?ids=anilist:1'));
  expect((await response.json()).unavailable).toBe(true);
  expect(response.headers.get('cache-control')).toBe('no-store');
});
