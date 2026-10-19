import { getDictionary } from '@/lib/i18n';
import { parseSeason, seasonPath, type AnimeSeason } from '@/lib/season';
import { siteUrl } from '@/lib/seo';

type Breadcrumb = { name: string; path: string };
export const homeBreadcrumb: Breadcrumb = { name: 'Home', path: '/' };

export function breadcrumbList(items: readonly Breadcrumb[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name,
      item: new URL(item.path, siteUrl()).href,
    })),
  };
}

export function seasonBreadcrumb(value: AnimeSeason): Breadcrumb {
  return { name: `Stagione ${getDictionary('it').catalog.seasonNames[value.season]} ${value.year}`, path: seasonPath(value) };
}

export function animeBreadcrumbs(anime: { id: number; season: string | null; seasonYear: number | null }, name: string) {
  const season = parseSeason(String(anime.seasonYear ?? '').padStart(4, '0'), anime.season?.toLowerCase() ?? '');
  return breadcrumbList([homeBreadcrumb, ...(season ? [seasonBreadcrumb(season)] : []), { name, path: `/anime/${anime.id}` }]);
}

export function animeItemList(items: readonly { name: string; anilistId?: number | null }[]) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name,
      ...(Number.isSafeInteger(item.anilistId) && item.anilistId! > 0 && item.anilistId! <= 2147483647
        ? { url: new URL(`/anime/${item.anilistId}`, siteUrl()).href } : {}),
    })),
  };
}

export function websiteSearch() {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'Weekly Anime', url: siteUrl().href,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${new URL('/search', siteUrl()).href}?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}
