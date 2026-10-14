import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildPersonalReleases, inRomeWeek, matchMal, matchTrakt, romeWeek, weekCandidates, type TraktRelease, type WeekCandidate } from '../lib/my-anime-week';
import { getDictionary, locales } from '../lib/i18n';
const week = { year: 2026, week: 43 }; // Rome switches to winter time on Sunday.
const candidates: WeekCandidate[] = [{ id: 21, malId: 123, names: ['Example Anime'], tmdbKeys: ['tv:42'] }];

describe('personal calendar week and matching', () => {
  it('selects the Rome Monday even when UTC is still Sunday', () => {
    expect(romeWeek(new Date('2026-10-18T22:30:00Z'))).toMatchObject({ week, start: '2026-10-19', end: '2026-10-25' });
  });
  it('filters exact Monday/Sunday edges across the DST transition', () => {
    expect(inRomeWeek(Date.parse('2026-10-18T21:59:59Z'), week)).toBe(false);
    expect(inRomeWeek(Date.parse('2026-10-18T22:00:00Z'), week)).toBe(true);
    expect(inRomeWeek(Date.parse('2026-10-25T22:59:59Z'), week)).toBe(true);
    expect(inRomeWeek(Date.parse('2026-10-25T23:00:00Z'), week)).toBe(false);
    expect(inRomeWeek(NaN, week)).toBe(false);
  });
  it('prefers confirmed MAL IDs and refuses conflicting or ambiguous aliases', () => {
    expect(matchMal({ id: 123, title: 'Different local title' }, candidates)?.id).toBe(21);
    expect(matchMal({ id: 999, title: 'Example Anime' }, candidates)).toBeUndefined();
    const unknown = [{ ...candidates[0], malId: undefined }];
    expect(matchMal({ id: 999, title: 'Example: Anime!' }, unknown)?.id).toBe(21);
    expect(matchMal({ id: 999, title: 'Different', alternative_titles: { synonyms: ['Example Anime'] } }, unknown)?.id).toBe(21);
    expect(matchMal({ id: 999, title: 'Example Anime' }, [...unknown, { ...unknown[0], id: 22 }])).toBeUndefined();
    expect(matchMal({ id: 999, title: 'Example Anime Season 2' }, unknown)).toBeUndefined();
  });
  it('maps snapshot names/IDs with AniList idMal and prioritizes Trakt TMDB IDs', () => {
    const mapped = weekCandidates({ titles: { 'tv:42': { anilistId: 21 } }, names: { 'tv:42': 'Local name' }, events: [] },
      [{ id: 21, idMal: 123, title: { romaji: 'Example', english: 'Example Anime', native: null } }]);
    expect(mapped).toEqual([{ id: 21, malId: 123, names: ['Local name', 'Example', 'Example Anime'], tmdbKeys: ['tv:42'] }]);
    expect(matchTrakt({ title: 'Different', ids: { trakt: 7, tmdb: 42 } }, mapped)?.id).toBe(21);
    expect(matchTrakt({ title: 'Unknown', ids: { trakt: 7 } }, mapped)).toBeUndefined();
  });
  it('keeps direct Trakt entries, filters to followed MAL anime and deduplicates matched episodes', () => {
    const firstAired = '2026-10-20T12:00:00Z';
    const trakt: TraktRelease = { first_aired: firstAired, episode: { season: 1, number: 2 }, show: { title: 'Example Anime', ids: { trakt: 7, tmdb: 42 } } };
    const events = [
      { id: 1, mediaId: 21, episode: 2, airingAt: Date.parse(firstAired) / 1000 },
      { id: 2, mediaId: 21, episode: 3, airingAt: Date.parse('2026-10-22T12:00:00Z') / 1000 },
      { id: 3, mediaId: 999, episode: 1, airingAt: Date.parse(firstAired) / 1000 },
      { id: 4, mediaId: 21, episode: 4, airingAt: Date.parse('2026-10-26T12:00:00Z') / 1000 },
    ];
    const result = buildPersonalReleases([trakt, trakt, { ...trakt, show: { title: 'Unmatched Trakt title', ids: { trakt: 99 } } }],
      [{ id: 123, title: 'Example Anime' }, { id: 456, title: 'Unmatched MAL title' }], candidates, events, week);
    expect(result.releases).toHaveLength(3); expect(result.unmatched).toBe(1);
    expect(result.releases.find(release => release.anilistId === 21 && release.episode === 2)?.sources).toEqual(['trakt', 'mal']);
    expect(result.releases.find(release => release.title === 'Unmatched Trakt title')?.anilistId).toBeUndefined();
  });
  it.each(locales)('includes all personalized copy keys in %s', locale => {
    const d = getDictionary(locale).myAnime;
    expect(Object.keys(d).sort()).toEqual(Object.keys(getDictionary('it').myAnime).sort());
    expect(Object.values(d).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
    if (locale === 'it') expect(d.title).toBe('I miei anime');
  });
});
