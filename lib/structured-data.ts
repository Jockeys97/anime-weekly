import { localePath } from '@/lib/locale-routing';
import type { Locale } from '@/lib/locales';
import { getDictionary } from '@/lib/i18n';
import { parseSeason, seasonPath, type AnimeSeason } from '@/lib/season';
import { siteUrl } from '@/lib/seo';

type Breadcrumb = { name: string; path: string };
export const homeBreadcrumb: Breadcrumb = { name: 'Home', path: '/' };

export function breadcrumbList(items: readonly Breadcrumb[], locale: Locale = 'it') {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name,
      item: new URL(localePath(item.path, locale), siteUrl()).href,
    })),
  };
}

export function seasonBreadcrumb(value: AnimeSeason, locale: Locale = 'it'): Breadcrumb {
  return { name: `${getDictionary(locale).catalog.season} ${getDictionary(locale).catalog.seasonNames[value.season]} ${value.year}`, path: seasonPath(value) };
}

export function animeBreadcrumbs(anime: { id: number; season: string | null; seasonYear: number | null }, name: string, locale: Locale = 'it') {
  const season = parseSeason(String(anime.seasonYear ?? '').padStart(4, '0'), anime.season?.toLowerCase() ?? '');
  return breadcrumbList([homeBreadcrumb, ...(season ? [seasonBreadcrumb(season, locale)] : []), { name, path: `/anime/${anime.id}` }], locale);
}

export function animeItemList(items: readonly { name: string; anilistId?: number | null }[], locale: Locale = 'it') {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name,
      ...(Number.isSafeInteger(item.anilistId) && item.anilistId! > 0 && item.anilistId! <= 2147483647
        ? { url: new URL(localePath(`/anime/${item.anilistId}`, locale), siteUrl()).href } : {}),
    })),
  };
}

export function websiteSearch(locale: Locale = 'it') {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Weekly Anime', url: new URL(localePath('/', locale), siteUrl()).href,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${new URL(localePath('/search', locale), siteUrl()).href}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
