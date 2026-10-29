import { animeLanguageAlternates, animePath } from '@/lib/anime-url';
import { locales, type Locale } from '@/lib/locales';
import { languageAlternates } from '@/lib/locale-routing';
import type { MetadataRoute } from 'next';
import { platformPaths } from '@/lib/platforms';
import { currentSeason, SEASONS, seasonPath } from '@/lib/season';
import { formatWeek, isoWeek, parseWeek } from '@/lib/week';
import type { ArchivedWeek } from '@/lib/week-archive';
import { siteUrl } from '@/lib/seo';

export interface SitemapWeek extends ArchivedWeek { rankingCount?: number }

export interface SitemapAnime { id: number; name?: string; hasSynopsis?: boolean; localizedNames?: Partial<Record<import('@/lib/locales').Locale, string>>; updatedAt?: number | null }

// Indexation policy: anime detail and similar pages are indexable and listed
// in every locale. The 25/10 change that noindexed es/fr/de/pt pages without a
// native synopsis wiped out organic traffic (mostly /es), so it was reverted.
export const SITEMAP_ANIME_LOCALES = ['it', 'en', 'es', 'fr', 'de', 'pt'] as const satisfies readonly Locale[];
export const MIN_PLATFORM_TITLES = 5;

export function animeLocaleIndexable(locale: Locale, synopsisLanguage: Locale | null | undefined): boolean {
  return (SITEMAP_ANIME_LOCALES as readonly Locale[]).includes(locale) || synopsisLanguage === locale;
}

export function sitemapSeasons(date = new Date()) {
  const { year } = currentSeason(date);
  return [year - 2, year - 1, year].flatMap(year => SEASONS.map(season => ({ year, season })));
}

export function sitemapIds(date = new Date()): string[] {
  return ['pages', 'discovery', ...new Set(sitemapSeasons(date).map(value => String(value.year)))];
}

export function sitemapUrls(date = new Date(), base = siteUrl()): string[] {
  return sitemapIds(date).map(id => new URL(`/sitemaps/sitemap/${id}.xml`, base).href);
}

// `indexedPlatforms`: platform paths with at least MIN_PLATFORM_TITLES titles.
// Omitted (tests, offline) means none are listed: thin catalogs stay out.
export function buildPagesSitemap(date = new Date(), base = siteUrl(), archivedWeeks: readonly SitemapWeek[] = [], indexedPlatforms: readonly string[] = []): MetadataRoute.Sitemap {
  const week = isoWeek(date);
  const paths = ['/', '/season', '/piattaforma', '/this-week', '/best-this-season', '/search/hentai', '/search/mild-nudity',
    ...sitemapSeasons(date).map(seasonPath), ...platformPaths().filter(path => indexedPlatforms.includes(path))];
  // No invented lastmod: these hubs have no reliable modification date.
  const entries: MetadataRoute.Sitemap = paths.map(path => ({
    url: new URL(path, base).href, alternates: { languages: languageAlternates(path, base) },
  }));
  const seen = new Set<string>();
  for (const archived of archivedWeeks) {
    if (!parseWeek(archived.week) || archived.week > formatWeek(week) || (!Number.isSafeInteger(archived.titleCount) || archived.titleCount <= 0)
      || !Number.isFinite(Date.parse(archived.uploadedAt)) || seen.has(archived.week)) continue;
    seen.add(archived.week);
    const paths = [`/week/${archived.week}`];
    if (Number.isSafeInteger(archived.rankingCount) && archived.rankingCount! > 0) {
      paths.push(`/rankings/${archived.week}`);
      if (archived.week === formatWeek(week)) paths.push('/rankings/this-week');
    }
    for (const path of paths) entries.push({ url: new URL(path, base).href, alternates: { languages: languageAlternates(path, base) },
      lastModified: archived.uploadedAt });
  }
  return localizedEntries(entries);
}

export function buildAnimeSitemap(anime: readonly SitemapAnime[], base = siteUrl()): MetadataRoute.Sitemap {
  const unique = new Map<number, SitemapAnime>();
  for (const item of anime) {
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || item.id > 2147483647) continue;
    // Known-empty AniList description: a page with no synopsis is thin.
    if (item.hasSynopsis === false) continue;
    const existing = unique.get(item.id);
    if (!existing || (item.updatedAt ?? 0) > (existing.updatedAt ?? 0)) unique.set(item.id, item);
  }
  const entries: MetadataRoute.Sitemap = [...unique.values()].map(item => {
    const modified = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) && item.updatedAt > 0
      ? new Date(item.updatedAt * 1000) : null;
    return { url: new URL(animePath(item.id, item.name), base).href, alternates: { languages: animeLanguageAlternates(item.id, item.name || '', item.localizedNames || {}, base) },
      ...(modified && !Number.isNaN(modified.getTime()) ? { lastModified: modified } : {}) };
  });
  return localizedEntries(entries, SITEMAP_ANIME_LOCALES);
}

// Reuse one catalog fetch and one alternates map per translation group. Year
// shards bound XML size; expanding URLs never starts additional API calls.
export function localizedEntries(entries: MetadataRoute.Sitemap, only: readonly Locale[] = locales): MetadataRoute.Sitemap {
  return entries.flatMap(entry => only.map(locale => ({ ...entry, url: entry.alternates!.languages![locale] as string })));
}

export function buildSitemap(ids: readonly number[], date = new Date(), base = siteUrl(), archivedWeeks: readonly SitemapWeek[] = []): MetadataRoute.Sitemap {
  return [...buildPagesSitemap(date, base, archivedWeeks), ...buildAnimeSitemap(ids.map(id => ({ id })), base)];
}
