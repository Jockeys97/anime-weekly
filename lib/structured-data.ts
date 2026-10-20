import type { AniListAnime } from '@/lib/anilist';
import { animeHeading, nextAnimeEpisode } from '@/lib/anime-seo';
import { animePath } from '@/lib/anime-url';
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
    name: items.at(-1)?.name ?? 'Weekly Anime', url: new URL(localePath(items.at(-1)?.path ?? '/', locale), siteUrl()).href,
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
  return breadcrumbList([homeBreadcrumb, ...(season ? [seasonBreadcrumb(season, locale)] : []), { name, path: animePath(anime.id, name) }], locale);
}

export function animeItemList(items: readonly { name: string; anilistId?: number | null }[], locale: Locale = 'it', page: Breadcrumb = { name: 'Weekly Anime', path: '/' }) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList', name: page.name, url: new URL(localePath(page.path, locale), siteUrl()).href,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name,
      ...(Number.isSafeInteger(item.anilistId) && item.anilistId! > 0 && item.anilistId! <= 2147483647
        ? { url: new URL(localePath(animePath(item.anilistId!, item.name), locale), siteUrl()).href } : {}),
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

// Partial AniList dates stay partial: never manufacture a month or a day.
export function animeStartDate(date: AniListAnime['startDate']): string | undefined {
  if (!date || !Number.isInteger(date.year) || date.year! < 1 || date.year! > 9999 || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return;
  const iso = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : undefined;
}

export function animeStructuredData(anime: AniListAnime, name: string, description: string, locale: Locale = 'it') {
  const url = new URL(localePath(animePath(anime.id, name), locale), siteUrl()).href;
  const start = animeStartDate(anime.startDate);
  const next = nextAnimeEpisode(anime);
  const buckets = anime.stats?.scoreDistribution;
  const ratingCount = buckets?.length && buckets.every(bucket => Number.isSafeInteger(bucket.amount) && bucket.amount >= 0)
    ? buckets.reduce((sum, bucket) => sum + bucket.amount, 0) : undefined;
  return {
    '@context': 'https://schema.org', '@type': anime.format === 'MOVIE' ? 'Movie' : 'TVSeries', name, url, description,
    image: anime.coverImage?.extraLarge || anime.coverImage?.large || undefined, genre: anime.genres,
    ...(start ? { datePublished: start, ...(anime.format !== 'MOVIE' ? { startDate: start } : {}) } : {}),
    ...(Number.isSafeInteger(anime.episodes) && anime.episodes! > 0 && anime.format !== 'MOVIE' ? { numberOfEpisodes: anime.episodes } : {}),
    ...(anime.format !== 'MOVIE' && next ? { episode: {
      '@type': 'TVEpisode', name: animeHeading(name, anime, locale), url,
      episodeNumber: next.episode, datePublished: next.date.toISOString().slice(0, 10),
    } } : {}),
    ...(typeof anime.averageScore === 'number' && Number.isFinite(anime.averageScore) && anime.averageScore > 0 && anime.averageScore <= 100 ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: anime.averageScore, bestRating: 100, worstRating: 0,
        ...(Number.isSafeInteger(ratingCount) && ratingCount! > 0 ? { ratingCount } : {}) },
    } : {}),
  };
}

export function organization() {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: 'Weekly Anime', url: siteUrl().href, logo: new URL('/icon.svg', siteUrl()).href };
}
