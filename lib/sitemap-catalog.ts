import 'server-only';
import { unstable_cache } from 'next/cache';
import { animeName, getSeason } from '@/lib/anilist';
import { CACHE_TAG } from '@/lib/config';
import { sitemapSeasons, type SitemapAnime } from '@/lib/seo-sitemap';

// Share the complete crawl across year shards. Underlying season requests are
// identical to the catalog pages: daily fetch cache and the shared AniList queue.
const getCachedSitemapCatalog = unstable_cache(async (year: number) => {
  const anime = new Map<number, SitemapAnime & { year: number }>();
  for (const value of sitemapSeasons(new Date(Date.UTC(year, 0, 1)))) {
    try {
      for (let page = 1; ; page++) {
        const data = await getSeason(value.year, value.season, page);
        for (const item of data.media) {
          const previous = anime.get(item.id);
          anime.set(item.id, { id: item.id, name: animeName(item), updatedAt: item.updatedAt ?? previous?.updatedAt,
            year: previous?.year ?? value.year });
        }
        // The loader returns an empty terminal page on upstream errors. Preserve
        // prior pages and continue with the other seasons, including on throws.
        if (!data.pageInfo.hasNextPage || !data.media.length) break;
      }
    } catch { /* A failed season must never discard the rest of the sitemap. */ }
  }
  return [...anime.values()];
}, ['sitemap-season-catalog-v2'], { revalidate: 86400, tags: [CACHE_TAG] });

// Next may render the year shards concurrently on a cold build. Coalesce those
// misses as well so they do not each start a separate twelve-season crawl.
const pending = new Map<number, ReturnType<typeof getCachedSitemapCatalog>>();
export async function getSitemapCatalog(year: number) {
  let request = pending.get(year);
  if (!request) {
    request = getCachedSitemapCatalog(year);
    pending.set(year, request);
  }
  try { return await request; }
  finally { if (pending.get(year) === request) pending.delete(year); }
}
