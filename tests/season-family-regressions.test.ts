import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fixture from './fixtures/season-families.json';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), getSeasonFamily: vi.fn(), animeName: (a: { title: { english: string } }) => a.title.english }));
vi.mock('../lib/imdb', async original => ({ ...await original<typeof import('../lib/imdb')>(), getImdbScore: vi.fn(async (id: string) => ({ imdbId: id, imdbRating: '8.0', imdbStatus: 'ready' })) }));
import { getAnime, getSeasonFamily, type AniListAnime } from '../lib/anilist';
import { findSeasonSeries, getDetailAvailability, getDetailProviders } from '../lib/detail-availability';
import { getImdbScore } from '../lib/imdb';
import { tmdbSearchTitles } from '../lib/anime-match';

const media = fixture.media as unknown as AniListAnime[];
const catalog = new Map(media.map(a => [a.id, a]));
beforeEach(() => {
  vi.mocked(getAnime).mockImplementation(async id => catalog.get(id) ?? null);
  vi.mocked(getSeasonFamily).mockResolvedValue(media);
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(fixture.cases)('resolves the reviewed season identity: $title', async ({ id, rootId }) => {
  expect((await findSeasonSeries(catalog.get(id)!))?.id ?? null).toBe(rootId);
});

it('follows AoT Final Season Part 2 through every archived prequel to the 2013 series', async () => {
  const final = catalog.get(110277)!;
  const part = { ...final, id: 131681, title: { english: 'Attack on Titan Final Season Part 2', romaji: 'Shingeki no Kyojin: The Final Season Part 2', native: null }, startDate: { year: 2022, month: 1, day: 10 },
    relations: { edges: [{ relationType: 'PREQUEL', node: { id: final.id, type: 'ANIME', format: final.format, title: final.title, startDate: { year: 2020 } } }] } };
  expect((await findSeasonSeries(part))?.id).toBe(16498);
});

it.each([
  { id: 209872, rootId: 178533, imdbId: 'tt32766897' }, // Ranma remake
  { id: 178789, rootId: 108465, imdbId: 'tt13293588' }, // Mushoku, including Cour 2
  { id: 129874, rootId: 101922, imdbId: 'tt9335498' }, // TV Mugen Train
  { id: 185874, rootId: 116674, imdbId: 'tt14986406' }, // TYBW, not Bleach 2004
  { id: 131942, rootId: 14719, imdbId: 'tt2359704' }, // Stone Ocean, not Steel Ball Run
])('shares the same root for IMDb and provider-only metadata ($id)', async ({ id, rootId, imdbId }) => {
  const root = catalog.get(rootId)!, anime = catalog.get(id)!;
  const premiere = root.startDate!.year!;
  const name = tmdbSearchTitles([root.title.english!], premiere, 'tv')[0];
  vi.stubEnv('TMDB_API_KEY', 'test-key'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const us = { provider_id: 8, provider_name: 'Fixture US service', logo_path: '/us.png' };
  const itOffer = { provider_id: 283, provider_name: 'Fixture Italy service', logo_path: '/it.png' };
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname.endsWith('/search/tv')) return Response.json({ results: [
      { id: 900, name, first_air_date: '1989-01-01', genre_ids: [16], origin_country: ['JP'] },
      { id: 901, name, first_air_date: `${premiere}-01-01`, genre_ids: [16], origin_country: ['JP'] },
    ] });
    if (url.pathname.endsWith('/tv/901/external_ids')) return Response.json({ imdb_id: imdbId });
    if (url.pathname.endsWith('/tv/901/watch/providers')) return Response.json({ results: {
      US: { link: 'https://www.themoviedb.org/tv/901/watch?locale=US', flatrate: [us] },
      IT: { link: 'https://www.themoviedb.org/tv/901/watch?locale=IT', flatrate: [itOffer] },
    } });
    throw new Error(`Unexpected fixture URL: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const detail = await getDetailAvailability(anime);
  expect(detail.ratings).toMatchObject({ imdbId, imdbSeriesTitle: root.title.english });
  expect(detail.seriesWatch).toMatchObject({ id: 901, providers: { US: { providers: [us] }, IT: { providers: [itOffer] } } });
  expect(detail.seriesWatch!.providers.JP).toBeUndefined();
  vi.mocked(getImdbScore).mockClear(); fetchMock.mockClear();
  const filters = await getDetailProviders(anime);
  expect(filters.seriesWatch).toEqual(detail.seriesWatch);
  expect(filters.ratings).toEqual({ imdbStatus: 'unmatched' });
  expect(getImdbScore).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.every(([url]) => !url.pathname.endsWith('/external_ids') && url.hostname === 'api.themoviedb.org')).toBe(true);
});

it('requires the real chain and the correct root premiere for named groups', async () => {
  const jojo = catalog.get(131942)!;
  expect(await findSeasonSeries({ ...jojo, relations: { edges: [] } })).toBeNull();
  vi.mocked(getSeasonFamily).mockResolvedValue(media.map(a => a.id === 14719 ? { ...a, startDate: { year: 1993, month: null, day: null } } : a));
  expect(await findSeasonSeries(jojo)).toBeNull();
  expect(await findSeasonSeries({ ...jojo, format: 'MOVIE' })).toBeNull();
});
