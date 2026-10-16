import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), getSeasonFamily: vi.fn(), animeName: (anime: { title: { english: string } }) => anime.title.english }));
vi.mock('../lib/imdb', async importOriginal => ({ ...await importOriginal<typeof import('../lib/imdb')>(), getImdbScore: vi.fn().mockResolvedValue({ imdbId: 'tt32766897', imdbRating: '7.9', imdbStatus: 'ready' }) }));
import { getSeasonFamily, type AniListAnime } from '../lib/anilist';
import { getDetailAvailability } from '../lib/detail-availability';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('resolves Ranma season 3 through its two verified prequels and fetches remake ratings and regional Netflix offers', async () => {
  const make = (id: number, year: number, suffix = '') => ({ id, format: 'TV', title: { english: `Ranma1/2 (2024)${suffix}`, romaji: null, native: null }, startDate: { year }, relations: { edges: [] } } as unknown as AniListAnime);
  const first = make(178533, 2024), second = make(185731, 2025, ' Season 2'), third = make(209872, 2026, ' Season 3');
  for (const [child, parent] of [[third, second], [second, first]]) child.relations!.edges.push({ relationType: 'PREQUEL', node: { ...parent, type: 'ANIME' } });
  vi.mocked(getSeasonFamily).mockResolvedValue([third, second, first]);
  vi.stubEnv('TMDB_API_KEY', 'test-key'); vi.stubEnv('TMDB_READ_TOKEN', '');
  const netflix = { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png' };
  const fetchMock = vi.fn(async (url: URL) => {
    if (url.pathname.endsWith('/search/tv')) return Response.json({ results: [
      { id: 1, name: 'Ranma ½', first_air_date: '1989-04-15', genre_ids: [16], origin_country: ['JP'] },
      { id: 2, name: 'Ranma ½', first_air_date: '2024-10-06', genre_ids: [16], origin_country: ['JP'] },
    ] });
    if (url.pathname.endsWith('/tv/2/external_ids')) return Response.json({ imdb_id: 'tt32766897' });
    if (url.pathname.endsWith('/tv/2/watch/providers')) return Response.json({ results: Object.fromEntries(['US', 'IT'].map(region => [region, { link: `https://www.themoviedb.org/tv/2/watch?locale=${region}`, flatrate: [netflix] }])) });
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  const result = await getDetailAvailability(third);
  expect(result.match).toBeNull();
  expect(result.ratings).toMatchObject({ imdbId: 'tt32766897', imdbRating: '7.9', imdbSeriesTitle: 'Ranma1/2 (2024)' });
  expect(result.seriesWatch).toMatchObject({ id: 2, name: 'Ranma1/2 (2024)', providers: { US: { providers: [netflix] }, IT: { providers: [netflix] } } });
  expect(fetchMock.mock.calls.some(([url]) => url.searchParams.get('query') === 'Ranma1/2')).toBe(true);
  expect(fetchMock.mock.calls.some(([url]) => url.pathname.startsWith('/3/tv/1/'))).toBe(false);
});
