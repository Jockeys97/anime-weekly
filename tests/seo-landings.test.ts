import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';
import { landingHeading, landingMetadata, rankSeason, ratingSources } from '@/lib/seo-landings';
import { locales } from '@/lib/locales';
import { localePath } from '@/lib/locale-routing';
import { buildPagesSitemap } from '@/lib/seo-sitemap';

const now = new Date('2026-10-20T12:00:00Z');
afterEach(() => vi.unstubAllEnvs());
describe('discovery landing SEO', () => {
  it('uses distinct reciprocal canonical and language URLs for all six locales', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
    for (const kind of ['week', 'best'] as const) {
      const path = kind === 'week' ? '/this-week' : '/best-this-season';
      const titles = new Set();
      for (const locale of locales) {
        const metadata = landingMetadata(kind, locale, now);
        titles.add(metadata.title);
        expect(metadata.alternates?.canonical).toBe(`https://weeklyanime.com${localePath(path, locale)}`);
        expect(metadata.alternates?.languages).toEqual(Object.fromEntries([...locales.map(language => [language, `https://weeklyanime.com${localePath(path, language)}`]), ['x-default', `https://weeklyanime.com${path}`]]));
        expect(metadata.title).toContain('2026');
        expect(metadata.description).toBeTruthy();
      }
      expect(titles.size).toBe(6);
    }
    expect(landingHeading('week', 'it', now)).toBe('Anime in onda questa settimana (19–25 ottobre 2026) · Autunno 2026');
  });
  it('adds both pages in every locale to the pages sitemap', () => {
    const entries = buildPagesSitemap(now, new URL('https://weeklyanime.com'));
    for (const path of ['/this-week', '/best-this-season']) for (const locale of locales) {
      expect(entries.find(entry => entry.url === `https://weeklyanime.com${localePath(path, locale)}`)?.alternates?.languages?.['x-default']).toBe(`https://weeklyanime.com${path}`);
    }
  });
});
function anime(id: number, averageScore: number | null, votes = 0) {
  return { id, averageScore, stats: { scoreDistribution: [{ amount: votes }] } } as AniListAnime;
}
it('averages all available normalized sources, skips unrated and breaks ties by votes', () => {
  const result = rankSeason([anime(1, 80), anime(2, 90, 50), anime(3, null), anime(4, 80, 20)], {
    1: { imdbRating: '6', malScore: 8, anilistScore: 100 },
    2: { imdbRating: '7' },
  });
  expect(result.map(entry => entry.anime.id)).toEqual([2, 4, 1]);
  expect(result[2].score).toBeCloseTo(22 / 3);
  expect(result[2].sources.map(source => source.score)).toEqual([6, 8, 8]);
  expect(ratingSources({ malScore: 0 })).toEqual([{ name: 'MyAnimeList', score: 0 }]);
  expect(ratingSources({ imdbRating: 'N/A', malScore: 11, anilistScore: NaN })).toEqual([]);
});
it('ranks the full input before taking 50 and deduplicates identities', () => {
  const media = Array.from({ length: 60 }, (_, index) => anime(index + 1, 50 + index));
  const result = rankSeason([...media, media[0]]);
  expect(result).toHaveLength(50);
  expect(result[0].anime.id).toBe(51); // Scores over 100 are invalid.
  expect(rankSeason([])).toEqual([]);
});
