import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/tmdb', () => ({ getAnimeSeriesMetadata: vi.fn() }));
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
import { getAnimeSeriesMetadata } from '../lib/tmdb';
import { anilistFetch } from '../lib/rate-limited-fetch';
import { personalPoster, resolvePersonalAnime } from '../lib/my-anime-identity';
const show = { title: 'Example Anime', year: 2020, genres: ['animation'], ids: { trakt: 7, tmdb: 42 } };
const candidate = { id: 21, type: 'ANIME', format: 'TV', title: { english: 'Example Anime' }, startDate: { year: 2020 }, coverImage: { large: 'https://s4.anilist.co/file/example.jpg' } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAnimeSeriesMetadata).mockResolvedValue({ title: 'Example Anime', year: 2020, poster: 'https://image.tmdb.org/t/p/w342/example.jpg' });
  vi.mocked(anilistFetch).mockImplementation(async (_url, init) => {
    const { variables } = JSON.parse(init!.body as string);
    return Response.json({ data: Object.fromEntries(Object.keys(variables).map(key => [key, { media: [candidate] }])) });
  });
});
afterEach(() => vi.unstubAllGlobals());
it('resolves anime outside the weekly snapshot with public metadata, exact aliases and a cover', async () => {
  const result = await resolvePersonalAnime([show]);
  expect(result.identities.get(7)).toEqual({ id: 21, title: 'Example Anime', poster: 'https://s4.anilist.co/file/example.jpg', tmdbId: 42 });
  expect(result.unavailable).toBe(false); expect(result.unmatched).toBe(0);
});
it('excludes live action and non-Japanese animation without treating a name as proof', async () => {
  const result = await resolvePersonalAnime([{ ...show, country: 'us', genres: ['drama'], title: 'The Diplomat' }]);
  expect(result.identities.size).toBe(0); expect(result.excluded).toBe(1);
  expect(getAnimeSeriesMetadata).not.toHaveBeenCalled(); expect(anilistFetch).not.toHaveBeenCalled();
  vi.mocked(getAnimeSeriesMetadata).mockResolvedValue(null);
  expect((await resolvePersonalAnime([show])).excluded).toBe(1);
});
it('accepts confirmed weekly TMDB identities and their cover without another lookup', async () => {
  const result = await resolvePersonalAnime([show], [{ id: 21, names: ['Other local title'], tmdbKeys: ['tv:42'], poster: 'https://s4.anilist.co/file/cover.jpg' }]);
  expect(result.identities.get(7)?.id).toBe(21);
  expect(getAnimeSeriesMetadata).not.toHaveBeenCalled(); expect(anilistFetch).not.toHaveBeenCalled();
});
it('rejects ambiguous matches and remakes with a different year', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { a0: { media: [candidate, { ...candidate, id: 22 }] } } }));
  expect((await resolvePersonalAnime([show])).unmatched).toBe(1);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { a0: { media: [{ ...candidate, startDate: { year: 1989 } }] } } }));
  expect((await resolvePersonalAnime([show])).identities.size).toBe(0);
});
it('can verify a Japanese animated series without a TMDB ID but never assumes missing metadata means anime', async () => {
  const result = await resolvePersonalAnime([{ ...show, country: 'jp', ids: { trakt: 7 } }, { title: 'Unknown', ids: { trakt: 8 } }]);
  expect(result.identities.get(7)?.id).toBe(21); expect(result.identities.has(8)).toBe(false); expect(result.unmatched).toBe(1);
});
it('batches distinct public catalog lookups and does not send account history', async () => {
  const result = await resolvePersonalAnime(Array.from({ length: 5 }, (_, i) => ({ ...show, ids: { trakt: i + 1, tmdb: i + 42 } })));
  expect(result.identities.size).toBe(5); expect(anilistFetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(vi.mocked(anilistFetch).mock.calls[0][1]!.body as string).variables).toEqual({ a0: 'Example Anime', a1: 'Example Anime', a2: 'Example Anime', a3: 'Example Anime', a4: 'Example Anime' });
});
it('reports catalog outages without inventing negative identities and respects a zero work budget', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(new Response(null, { status: 429 }));
  expect(await resolvePersonalAnime([show])).toMatchObject({ unavailable: true, unmatched: 1 });
  vi.clearAllMocks();
  expect(await resolvePersonalAnime([show], [], 0)).toMatchObject({ unavailable: true, unmatched: 1 });
  expect(getAnimeSeriesMetadata).not.toHaveBeenCalled();
});
it.each(['http://s4.anilist.co/x', 'https://attacker.example/x', 'https://user:pw@s4.anilist.co/x', 'javascript:alert(1)'])('rejects unexpected poster URLs: %s', value => {
  expect(personalPoster(value)).toBeNull();
});
