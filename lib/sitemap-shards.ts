import { getDiscoverySitemap } from '@/lib/discovery-sitemap';
import { buildAnimeSitemap, buildPagesSitemap, sitemapIds } from '@/lib/seo-sitemap';
import { getSitemapCatalog } from '@/lib/sitemap-catalog';
import { getSeoWeeks } from '@/lib/weekly-seo-data';
import { siteUrl } from '@/lib/seo';
import { platformIndexable, platformMapping, platformPaths } from '@/lib/platforms';
import { getPlatformAnime } from '@/lib/tmdb';

// Cached TMDB platform lists (never AniList), four at a time. An unavailable
// list is left out of the sitemap rather than listed as a possibly thin page.
async function indexedPlatformPaths(): Promise<string[]> {
  const paths = platformPaths(), kept: string[] = [];
  for (let offset = 0; offset < paths.length; offset += 4) {
    const checked = await Promise.all(paths.slice(offset, offset + 4).map(async path => {
      const [, , provider, country] = path.split('/');
      const mapping = platformMapping(provider, country);
      if (!mapping) return null;
      const data = await getPlatformAnime(mapping.provider.id, mapping.country.region, 'it');
      return data.status === 'ready' && platformIndexable(data.titles.length) ? path : null;
    }));
    kept.push(...checked.filter((path): path is string => Boolean(path)));
  }
  return kept;
}

// The runtime sitemap handler caches successful shards and returns uncached
// HTTP errors when a complete discovery shard cannot be produced.
export function generateSitemaps() {
  return sitemapIds().map(id => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  const selected = await id;
  const date = new Date();
  if (selected === 'discovery') return getDiscoverySitemap(date);
  if (selected === 'pages') {
    const [weeks, platforms] = await Promise.all([getSeoWeeks(), indexedPlatformPaths()]);
    return buildPagesSitemap(date, siteUrl(), weeks, platforms);
  }
  if (!sitemapIds(date).includes(selected)) return [];
  return buildAnimeSitemap(await getSitemapCatalog(Number(selected)));
}
