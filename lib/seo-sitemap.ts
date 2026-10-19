import { animePath } from '@/lib/anime-url';
import { locales } from '@/lib/locales';
import { languageAlternates } from '@/lib/locale-routing';
import type { MetadataRoute } from 'next';
import { platformPaths } from '@/lib/platforms';
import { currentSeason, SEASONS, seasonPath } from '@/lib/season';
import { formatWeek, isoWeek, shiftWeek, weekRange } from '@/lib/week';
import { siteUrl } from '@/lib/seo';

export interface SitemapAnime { id: number; name?: string; updatedAt?: number | null }

export function sitemapSeasons(date = new Date()) {
  const { year } = currentSeason(date);
  return [year - 2, year - 1, year].flatMap(year => SEASONS.map(season => ({ year, season })));
}

export function sitemapIds(date = new Date()): string[] {
  return ['pages', ...new Set(sitemapSeasons(date).map(value => String(value.year)))];
}

export function sitemapUrls(date = new Date(), base = siteUrl()): string[] {
  return sitemapIds(date).map(id => new URL(`/sitemaps/sitemap/${id}.xml`, base).href);
}

export function buildPagesSitemap(date = new Date(), base = siteUrl()): MetadataRoute.Sitemap {
  const week = isoWeek(date);
  const paths = ['/', '/season', '/piattaforma',
    ...sitemapSeasons(date).map(seasonPath), ...platformPaths()];
  const entries: MetadataRoute.Sitemap = paths.map(path => ({
    url: new URL(path, base).href, alternates: { languages: languageAlternates(path, base) }, changeFrequency: 'daily', lastModified: date,
  }));
  for (const offset of [-1, 0, 1]) {
    const value = shiftWeek(week, offset);
    entries.push({ url: new URL(`/week/${formatWeek(value)}`, base).href, alternates: { languages: languageAlternates(`/week/${formatWeek(value)}`, base) },
      changeFrequency: 'daily', lastModified: offset < 0 ? weekRange(value).end : date });
  }
  return localizedEntries(entries);
}

export function buildAnimeSitemap(anime: readonly SitemapAnime[], base = siteUrl()): MetadataRoute.Sitemap {
  const unique = new Map<number, SitemapAnime>();
  for (const item of anime) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || item.id > 2147483647) continue;
    const existing = unique.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) unique.set(item.id, item);
  }
  const entries: MetadataRoute.Sitemap = [...unique.values()].map(item => {
    const modified = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && item.updatedAt > 0
      ? new Date(item.updatedAt * 1000) : null;
    return { url: new URL(animePath(item.id, item.name), base).href, alternates: { languages: languageAlternates(animePath(item.id, item.name), base) }, changeFrequency: 'daily',
      ...(modified && !Number.isNaN(modified.getTime()) ? { lastModified: modified } : {}) };
  });
  return localizedEntries(entries);
}

// Reuse one catalog fetch and one alternates map per translation group. Year
// shards bound XML size; expanding URLs never starts additional API calls.
function localizedEntries(entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  return entries.flatMap(entry => locales.map(locale => ({ ...entry, url: entry.alternates!.languages![locale] as string })));
}

export function buildSitemap(ids: readonly number[], date = new Date(), base = siteUrl()): MetadataRoute.Sitemap {
  return [...buildPagesSitemap(date, base), ...buildAnimeSitemap(ids.map(id => ({ id })), base)];
}
