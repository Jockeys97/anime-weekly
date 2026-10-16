import { describe, expect, it } from 'vitest';
import { chooseAnimeMatch, chooseTMDBMatch, tmdbSearchTitles, normalizeTitle, type AnimeCandidate, type AnimeSearch } from '../lib/anime-match';

const search: AnimeSearch = { kind: 'tv', originalTitle: '進撃の巨人', title: 'Attack on Titan', year: 2013 };
const candidate: AnimeCandidate = { id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' }, startDate: { year: 2013 }, idMal: 16498, averageScore: 84 };
describe('TMDB remake identity', () => {
  const remake = { id: 2, name: 'Ranma ½', first_air_date: '2024-10-06', genre_ids: [16], origin_country: ['JP'] };
  const older = { ...remake, id: 1, first_air_date: '1989-04-15' };
  it('matches a parenthetical premiere label to the remake, never the old adaptation', () => {
    expect(chooseTMDBMatch([older, remake], ['Ranma1/2 (2024)'], 2024)).toEqual(remake);
    expect(chooseTMDBMatch([older], ['Ranma1/2 (2024)'], 2024)).toBeNull();
  });
  it('does not remove a year without a matching known premiere, or remove season and subtitle identity', () => {
    expect(tmdbSearchTitles(['Ranma1/2 (2024)'], 2024)).toEqual(['Ranma1/2']);
    for (const year of [undefined, 1989, 2026]) {
      expect(chooseTMDBMatch([remake], ['Ranma1/2 (2024)'], year)).toBeNull();
    }
    expect(chooseTMDBMatch([remake], ['Ranma1/2 (2024) Season 3'], 2024)).toBeNull();
    expect(chooseTMDBMatch([remake], ['Ranma1/2 (Special)'], 2024)).toBeNull();
    expect(chooseTMDBMatch([remake, { ...remake, id: 3 }], ['Ranma1/2 (2024)'], 2024)).toBeNull();
  });
});
describe('conservative anime matching', () => {
  it('normalizes case, punctuation, spacing and full-width text while retaining Unicode', () => {
    expect(normalizeTitle(' Ａttack: on TITAN! ')).toBe('attackontitan');
    expect(normalizeTitle('進撃 の 巨人')).toBe('進撃の巨人');
  });
  it.each(['romaji', 'english', 'native'] as const)('matches an exact %s alias', alias => {
    expect(chooseAnimeMatch([candidate], { kind: 'tv', title: candidate.title![alias]! })).toBe(candidate);
  });
  it('matches synonyms and normalized titles', () => {
    const synonym = { ...candidate, title: {}, synonyms: ['Attack-on-Titan!'] };
    expect(chooseAnimeMatch([synonym], search)).toBe(synonym);
  });
  it('requires an exact match rather than a substring or fuzzy similarity', () => {
    expect(chooseAnimeMatch([{ ...candidate, title: { english: 'Attack on Titan Season 2' } }], search)).toBeNull();
  });
  it.each(['TV', 'TV_SHORT', 'ONA'])('accepts TV format %s', format => {
    expect(chooseAnimeMatch([{ ...candidate, format }], search)?.format).toBe(format);
  });
  it.each(['MOVIE', 'OVA', 'SPECIAL', null])('rejects incompatible TV format %s', format => {
    expect(chooseAnimeMatch([{ ...candidate, format }], search)).toBeNull();
  });
  it('requires MOVIE for a TMDB movie and ANIME for any match', () => {
    expect(chooseAnimeMatch([candidate], { ...search, kind: 'movie' })).toBeNull();
    expect(chooseAnimeMatch([{ ...candidate, format: 'MOVIE' }], { ...search, kind: 'movie' })?.id).toBe(1);
    expect(chooseAnimeMatch([{ ...candidate, type: 'MANGA' }], search)).toBeNull();
  });
  it.each([2012, 2013, 2014])('accepts start year %s within one year', year => {
    expect(chooseAnimeMatch([{ ...candidate, startDate: { year } }], search)?.id).toBe(1);
  });
  it.each([2011, 2015, null, undefined])('rejects start year %s when TMDB year is known', year => {
    expect(chooseAnimeMatch([{ ...candidate, startDate: { year } }], search)).toBeNull();
  });
  it('allows exact titles without a known TMDB year', () => {
    expect(chooseAnimeMatch([{ ...candidate, startDate: null }], { ...search, year: undefined })?.id).toBe(1);
  });
  it('prefers original-title aliases over display-title aliases', () => {
    const display = { ...candidate, id: 2, title: { english: 'Attack on Titan' } };
    expect(chooseAnimeMatch([display, candidate], search)).toBe(candidate);
  });
  it('prefers the exact year over adjacent years', () => {
    expect(chooseAnimeMatch([{ ...candidate, id: 2, startDate: { year: 2012 } }, candidate], search)).toBe(candidate);
  });
  it('rejects ambiguous equally good matches regardless of ordering', () => {
    const duplicate = { ...candidate, id: 2 };
    expect(chooseAnimeMatch([candidate, duplicate], search)).toBeNull();
    expect(chooseAnimeMatch([duplicate, candidate], search)).toBeNull();
    expect(chooseAnimeMatch([candidate, candidate], search)).toBe(candidate);
  });
  it('returns no match for empty candidates or empty normalized input', () => {
    expect(chooseAnimeMatch([], search)).toBeNull();
    expect(chooseAnimeMatch([{ ...candidate, title: { english: '!!!' } }], { kind: 'tv', title: '???' })).toBeNull();
  });
});

// Representative upstream aliases; fixtures exercise title matching rather
// than hard-coding an AniList ID or depending on a live service.
describe('weekly title matching regressions', () => {
  const make = (title: AnimeCandidate['title'], year: number, synonyms: string[] = []): AnimeCandidate => ({ id: 100, type: 'ANIME', format: 'TV', title, synonyms, startDate: { year }, idMal: 200, averageScore: 80 });
  it.each([
    ['Nia Liston', 'Nia Liston: The Merciless Maiden', 2026],
    ['Pokémon Horizons', 'Pokemon Horizons: The Series', 2023],
    ['Magical Explorer', 'Magical Explorer: Reborn as a Side Character in a Fantasy Dating Sim', 2026],
    ['Ranma1/2', 'Ranma ½', 2024],
    ['Ranma ½', 'Ranma 1/2', 2024],
  ])('resolves %s to its unique English alias', (title, english, year) => {
    expect(chooseAnimeMatch([make({ english }, year)], { kind: 'tv', title, year })?.id).toBe(100);
  });
  it('resolves Ave Mujica using a synonym even when the English title has a brand prefix', () => {
    const anime = make({ english: 'BanG Dream! Ave Mujica', romaji: 'BanG Dream! Ave Mujica' }, 2025, ['Ave Mujica']);
    expect(chooseAnimeMatch([anime], { kind: 'tv', title: 'Ave Mujica', year: 2025 })?.id).toBe(100);
  });
  it('resolves JoJo using TMDB original_name and Japanese native title', () => {
    const anime = make({ english: "JoJo’s Bizarre Adventure", romaji: 'JoJo no Kimyou na Bouken', native: 'ジョジョの奇妙な冒険' }, 2012);
    expect(chooseAnimeMatch([anime], { kind: 'tv', title: 'JoJo', originalTitle: 'ジョジョの奇妙な冒険', year: 2013 })?.id).toBe(100);
  });
  it('matches Rascal Does Not Dream of a Dear Friend without inheriting another adaptation', () => {
    const movie = { ...make({ english: 'Rascal Does Not Dream of a Dear Friend', romaji: 'Seishun Buta Yarou wa Dear Friend no Yume wo Minai' }, 2026), format: 'MOVIE' };
    expect(chooseAnimeMatch([movie], { kind: 'movie', title: 'Rascal Does Not Dream of a Dear Friend', year: 2026 })?.id).toBe(100);
    expect(chooseAnimeMatch([movie], { kind: 'tv', title: 'Rascal Does Not Dream of a Dear Friend', year: 2026 })).toBeNull();
  });
  it('canonicalizes season wording and allows an explicit suffix against the same-year base title', () => {
    const anime = make({ english: 'Magical Explorer Season 2' }, 2026);
    expect(chooseAnimeMatch([anime], { kind: 'tv', title: 'Magical Explorer 2nd Season', year: 2026 })?.id).toBe(100);
    expect(chooseAnimeMatch([make({ english: 'Nia Liston' }, 2026)], { kind: 'tv', title: 'Nia Liston Season 1', year: 2026 })?.id).toBe(100);
  });
  it('does not conflate different subtitles, numbered seasons, distant remakes, or tied base matches', () => {
    const a = make({ english: 'Nia Liston: The Merciless Maiden' }, 2026);
    const b = { ...a, id: 101 };
    expect(chooseAnimeMatch([a, b], { kind: 'tv', title: 'Nia Liston', year: 2026 })).toBeNull();
    expect(chooseAnimeMatch([a], { kind: 'tv', title: 'Nia Liston', year: 2020 })).toBeNull();
    expect(chooseAnimeMatch([make({ english: 'Example Season 3' }, 2026)], { kind: 'tv', title: 'Example Season 2', year: 2026 })).toBeNull();
  });
});
