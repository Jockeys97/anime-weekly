import { describe, expect, it } from 'vitest';
import { chooseAnimeMatch, normalizeTitle, type AnimeCandidate, type AnimeSearch } from '../lib/anime-match';

const search: AnimeSearch = { kind: 'tv', originalTitle: '進撃の巨人', title: 'Attack on Titan', year: 2013 };
const candidate: AnimeCandidate = { id: 1, type: 'ANIME', format: 'TV', title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' }, startDate: { year: 2013 }, idMal: 16498, averageScore: 84 };
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
