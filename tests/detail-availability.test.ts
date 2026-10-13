import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), animeName: (anime: { title: { english: string } }) => anime.title.english }));
vi.mock('../lib/tmdb', () => ({ getAnimeAvailability: vi.fn() }));
import { getAnime, type AniListAnime } from '../lib/anilist';
import { getAnimeAvailability, type AnimeAvailability } from '../lib/tmdb';
import { findSeasonSeries, getDetailAvailability, seriesBaseTitle } from '../lib/detail-availability';

function anime(id: number, name: string, year: number): AniListAnime {
  return { id, idMal: null, title: { english: name, romaji: null, native: null }, format: 'TV', startDate: { year, month: null, day: null }, seasonYear: year, coverImage: null, bannerImage: null, description: null, episodes: null, status: null, genres: [], averageScore: 85, studios: null, season: null, relations: { edges: [] } };
}
function prequel(child: AniListAnime, parent: AniListAnime) {
  child.relations!.edges.push({ relationType: 'PREQUEL', node: { id: parent.id, type: 'ANIME', format: parent.format, title: parent.title, startDate: { year: parent.startDate!.year } } });
}
const empty: AnimeAvailability = { match: null, ratings: {}, providers: {}, providersUnavailable: false };
afterEach(() => vi.resetAllMocks());

describe('season IMDb series fallback', () => {
  it('uses the confirmed first-season title and year for IMDb, keeping season availability separate', async () => {
    const first = anime(161645, 'The Apothecary Diaries', 2023);
    const second = anime(176301, 'The Apothecary Diaries Season 2', 2025);
    const third = anime(195516, 'The Apothecary Diaries Season 3', 2026);
    prequel(third, second); prequel(second, first);
    vi.mocked(getAnime).mockImplementation(async id => id === second.id ? second : id === first.id ? first : null);
    vi.mocked(getAnimeAvailability).mockResolvedValueOnce(empty).mockResolvedValueOnce({ ...empty, match: { id: 220542, kind: 'tv' }, ratings: { imdbId: 'tt26743760', imdbRating: '8.6', imdbVotes: '28,453' }, providers: { US: { link: 'https://www.themoviedb.org/tv/220542/watch?locale=US', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } } });
    expect(await getDetailAvailability(third)).toEqual({ ...empty, ratings: { imdbId: 'tt26743760', imdbRating: '8.6', imdbVotes: '28,453', imdbSeriesTitle: 'The Apothecary Diaries' }, seriesWatch: { id: 220542, kind: 'tv', name: 'The Apothecary Diaries', providers: { US: { link: 'https://www.themoviedb.org/tv/220542/watch?locale=US', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } }, providersUnavailable: false } });
    expect(getAnimeAvailability).toHaveBeenNthCalledWith(1, ['The Apothecary Diaries Season 3'], 2026);
    expect(getAnimeAvailability).toHaveBeenNthCalledWith(2, ['The Apothecary Diaries'], 2023);
  });
  it('retains a direct IMDb match without following prequels', async () => {
    const data = { ...empty, ratings: { imdbId: 'tt123' } };
    vi.mocked(getAnimeAvailability).mockResolvedValue(data);
    expect(await getDetailAvailability(anime(3, 'Example Season 3', 2026))).toEqual(data);
    expect(getAnime).not.toHaveBeenCalled();
  });
  it('also finds series watch options when the season already has IMDb and preserves direct regional offers', async () => {
    const first = anime(1, 'Attack on Titan', 2013);
    const middle = anime(2, 'Attack on Titan Season 3 Part 2', 2019);
    const final = anime(3, 'Attack on Titan Final Season', 2020);
    middle.title.native = '進撃の巨人 Season３ Part.2';
    prequel(final, middle); prequel(middle, first);
    vi.mocked(getAnime).mockImplementation(async id => id === 2 ? middle : first);
    const providers = { US: { link: 'https://example.com', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } };
    vi.mocked(getAnimeAvailability).mockResolvedValueOnce({ ...empty, match: { id: 99, kind: 'tv' }, ratings: { imdbId: 'tt123' }, providers })
      .mockResolvedValueOnce({ ...empty, match: { id: 1429, kind: 'tv' }, providers });
    const result = await getDetailAvailability(final);
    expect(result.match?.id).toBe(99);
    expect(result.ratings).toEqual({ imdbId: 'tt123' });
    expect(result.providers).toEqual(providers);
    expect(result.seriesWatch).toEqual({ id: 1429, kind: 'tv', name: 'Attack on Titan', providers, providersUnavailable: false });
  });
  it('starts following the season chain before the direct TMDB request completes', async () => {
    const current = anime(3, 'Example Season 2', 2026);
    const first = anime(1, 'Example', 2023); prequel(current, first);
    let finish!: (value: AnimeAvailability) => void;
    vi.mocked(getAnimeAvailability).mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(empty);
    vi.mocked(getAnime).mockResolvedValue(first);
    const result = getDetailAvailability(current);
    expect(getAnime).toHaveBeenCalledWith(1);
    finish(empty);
    expect(await result).toEqual(empty);
  });
  it('does not attach a different named series through a franchise prequel', async () => {
    const current = anime(3, 'Boruto', 2026); prequel(current, anime(1, 'Naruto', 2002));
    expect(await findSeasonSeries(current)).toBeNull();
    const numbered = anime(4, 'Boruto Season 2', 2026); prequel(numbered, anime(1, 'Naruto', 2002));
    expect(await findSeasonSeries(numbered)).toBeNull();
    expect(getAnime).not.toHaveBeenCalled();
  });
  it('rejects ambiguous prequels and cycles', async () => {
    const current = anime(3, 'Example Season 3', 2026);
    prequel(current, anime(1, 'Example', 2023)); prequel(current, anime(2, 'Example', 2024));
    expect(await findSeasonSeries(current)).toBeNull();
    const cycle = anime(5, 'Example Season 2', 2025); prequel(cycle, cycle);
    expect(await findSeasonSeries(cycle)).toBeNull();
    expect(getAnime).not.toHaveBeenCalled();
  });
  it('does not use a movie as the parent series', async () => {
    const current = anime(3, 'Example Season 3', 2026); const movie = anime(1, 'Example', 2023); movie.format = 'MOVIE'; prequel(current, movie);
    expect(await findSeasonSeries(current)).toBeNull();
  });
  it('leaves n/a when the parent lookup fails or has no IMDb ID', async () => {
    const current = anime(3, 'Example Season 2', 2026); const first = anime(1, 'Example', 2023); prequel(current, first);
    vi.mocked(getAnimeAvailability).mockResolvedValue(empty);
    vi.mocked(getAnime).mockResolvedValue(null);
    expect(await getDetailAvailability(current)).toEqual(empty);
    vi.mocked(getAnime).mockResolvedValue(first);
    expect(await getDetailAvailability(current)).toEqual(empty);
  });
  it('removes explicit multilingual season/cour suffixes and preserves digits in names', () => {
    expect(seriesBaseTitle('The Apothecary Diaries Season 3')).toBe('The Apothecary Diaries');
    expect(seriesBaseTitle('Kusuriya no Hitorigoto 3rd Season Part 2')).toBe('Kusuriya no Hitorigoto');
    expect(seriesBaseTitle('薬屋のひとりごと 第3期 第2クール')).toBe('薬屋のひとりごと');
    expect(seriesBaseTitle('86 Part 2')).toBe('86');
    expect(seriesBaseTitle('Mob Psycho 100')).toBe('Mob Psycho 100');
    expect(seriesBaseTitle('Example 3')).toBe('Example 3');
    expect(seriesBaseTitle('Shingeki no Kyojin: The Final Season Part 2')).toBe('Shingeki no Kyojin');
    expect(seriesBaseTitle('進撃の巨人 Season３ Part.2')).toBe('進撃の巨人');
  });
});
