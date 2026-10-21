import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { episodeInSitemap, episodePath, episodeTitle, fill, genrePath, listVisibility, parseEpisode, rankGenre, rankSimilar, similarPath } from '@/lib/discovery';
import { discoveryInternalPath, languageAlternates, localePath } from '@/lib/locale-routing';
import { proxy } from '@/proxy';
import { getDictionary } from '@/lib/i18n';
import { locales } from '@/lib/locales';
import type { AniListAnime } from '@/lib/anilist';

const now = new Date('2026-10-21T12:00:00Z');
const anime = (id: number, genres = ['Action'], score = 80) => ({ id, idMal: id, genres, tags: [], averageScore: score, title: { english: `Anime ${id}` } }) as unknown as AniListAnime;

describe('discovery paths and localized proxy rewrites', () => {
  it('uses ASCII anime slugs and reciprocal localized episode and similar segments', () => {
    const episode = episodePath(21, 'Títolo: Anime!', 12);
    expect(episode).toBe('/anime/21-titolo-anime/episode-12');
    const segments = { it: 'episodio', en: 'episode', es: 'episodio', fr: 'episode', de: 'folge', pt: 'episodio' };
    for (const locale of locales) {
      const path = localePath(episode, locale);
      expect(path).toBe(`${locale === 'it' ? '' : `/${locale}`}/anime/21-titolo-anime/${segments[locale]}-12`);
      expect(discoveryInternalPath(path)).toBe(episode);
      expect(localePath(`${path}?x=1#date`, 'de')).toBe('/de/anime/21-titolo-anime/folge-12?x=1#date');
      expect(discoveryInternalPath(localePath(similarPath(21, 'Title'), locale))).toBe('/anime/21-title/similar');
      expect(discoveryInternalPath(localePath(genrePath('Slice of Life'), locale))).toBe('/best-this-season/slice-of-life');
      const response = proxy(new NextRequest(`https://example.com${path}?x=1`));
      expect(response.headers.get('x-middleware-rewrite')).toBe(`https://example.com/${locale}${episode}?x=1`);
    }
    expect(languageAlternates(episode, new URL('https://example.com'))['x-default']).toBe('https://example.com/anime/21-titolo-anime/episodio-12');
  });
  it('redirects alternate-language segments and Italian prefix, preserving query strings', () => {
    for (const [path, target] of [
      ['/anime/21-title/episode-3', '/anime/21-title/episodio-3'],
      ['/it/anime/21-title/simili', '/anime/21-title/simili'],
      ['/de/best-this-season/action', '/de/beste-der-saison/action'],
    ]) expect(proxy(new NextRequest(`https://example.com${path}?x=1`)).headers.get('location')).toBe(`https://example.com${target}?x=1`);
    expect(parseEpisode('folge-12')).toBe(12);
    for (const invalid of ['episode-0', 'episode--1', 'episode-01', 'episode-100001', 'episode-Infinity']) expect(parseEpisode(invalid)).toBeNull();
  });
});
it('includes real aired timestamps and the exact 14-day boundary, never undated or later episodes', () => {
  const seconds = now.getTime() / 1000;
  for (const at of [seconds - 86400 * 365, seconds, seconds + 14 * 86400]) expect(episodeInSitemap(at, now)).toBe(true);
  for (const at of [0, -1, NaN, Infinity, seconds + 14 * 86400 + 1]) expect(episodeInSitemap(at, now)).toBe(false);
});
it('applies list indexing thresholds at zero, one, four and five items', () => {
  expect([0, 1, 4, 5, 10].map(listVisibility)).toEqual(['not-found', 'noindex', 'noindex', 'index', 'index']);
});
it('composes metadata titles from translations and real values in every locale', () => {
  for (const locale of locales) {
    const d = getDictionary(locale).discovery;
    expect(episodeTitle('Frieren', 7, locale)).toBe(d.episodeTitle.replace('{title}', 'Frieren').replace('{n}', '7'));
    expect(fill(d.similarTitle, { title: 'Frieren' })).toContain('Frieren');
    expect(fill(d.genreTitle, { genre: 'Action', season: 'Fall 2026' })).toContain('Fall 2026');
  }
  expect(episodeTitle('Frieren', 7, 'en')).toBe('Frieren episode 7: release date, time and where to watch');
});
it('requires source-specific actual vote thresholds and uses only IMDb/MAL for genres', () => {
  const catalog = [anime(1), anime(2), anime(3), anime(4, ['Romance']), anime(5)];
  const ranked = rankGenre(catalog, 'Action', {
    1: { imdbRating: '9', imdbVotes: '999', malScore: 10, malId: 1, malScoredBy: 999 },
    2: { imdbRating: '8', imdbVotes: '1,000', malScore: 9, malId: 2, malScoredBy: 1000 },
    3: { imdbRating: '8.6', imdbVotes: '1,001' },
    4: { imdbRating: '10', imdbVotes: '100000' },
    5: { malScore: 10, malId: 99, malScoredBy: 10000 },
  });
  expect(ranked.map(row => row.anime.id)).toEqual([3, 2]);
  expect(ranked[1].score).toBe(8.5);
});
it('ranks by real genre/tag overlap, recommendations and score, excluding self and unrelated titles', () => {
  const source = { ...anime(1), tags: [{ name: 'Ninja', rank: 90 }], recommendations: { nodes: [{ rating: 10, mediaRecommendation: { id: 3 } }] } };
  const candidates = [source, anime(2), anime(3, ['Drama']), anime(4, ['Romance']), { ...anime(5), tags: [{ name: 'Ninja', rank: 70 }] }];
  expect(rankSimilar(source, candidates).map(row => row.anime.id)).toEqual([5, 2, 3]);
});
