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

const node = (id: number, status: string, format = 'TV', next?: { episode: number; airingAt: number }) => ({ id, status, format, title: { english: `Show ${id}`, romaji: null, native: null }, nextAiringEpisode: next ?? null });
const finished = (id: number, sequels: ReturnType<typeof node>[]) => ({ ...node(id, 'FINISHED'), coverImage: { large: `https://s4.anilist.co/${id}.jpg` }, episodes: 12, relations: { edges: sequels.map(sequel => ({ relationType: 'SEQUEL', node: sequel })) } });

it('follows a finished favourite to its airing season: status, next episode and link of the sequel', async () => {
  vi.mocked(getFavoriteAnime).mockResolvedValueOnce({ unavailable: false, media: [{ ...finished(97940, [node(195604, 'RELEASING', 'TV', { episode: 4, airingAt: 1792850400 })]), title: { english: 'Black Clover', romaji: null, native: null } }] } as never);
  const body = await (await GET(new Request('https://example.com/api/favorites?ids=anilist:97940'))).json();
  expect(body.items[0]).toMatchObject({ id: 'anilist:97940', name: 'Black Clover', poster: 'https://s4.anilist.co/97940.jpg', current: 'Show 195604', status: 'RELEASING', next: { episode: 4, airingAt: 1792850400 }, href: expect.stringMatching(/^\/anime\/195604-/) });
  expect(getFavoriteAnime).toHaveBeenCalledTimes(1);
});
it('walks finished sequels in batched hops, ignoring films, and keeps "finished" when nothing airs', async () => {
  vi.mocked(getFavoriteAnime)
    .mockResolvedValueOnce({ unavailable: false, media: [finished(1, [node(2, 'FINISHED'), node(9, 'RELEASING', 'MOVIE')]), finished(5, [])] } as never)
    .mockResolvedValueOnce({ unavailable: false, media: [finished(2, [node(3, 'NOT_YET_RELEASED')])] } as never);
  const body = await (await GET(new Request('https://example.com/api/favorites?ids=anilist:1,anilist:5'))).json();
  expect(vi.mocked(getFavoriteAnime).mock.calls[1][0]).toEqual([2]);
  expect(body.items.find((item: { id: string }) => item.id === 'anilist:1')).toMatchObject({ current: 'Show 3', status: 'NOT_YET_RELEASED', href: expect.stringMatching(/^\/anime\/3-/) });
  expect(body.items.find((item: { id: string }) => item.id === 'anilist:5')).toMatchObject({ status: 'FINISHED' });
  expect(body.items.find((item: { id: string }) => item.id === 'anilist:5')).not.toHaveProperty('current');
});
