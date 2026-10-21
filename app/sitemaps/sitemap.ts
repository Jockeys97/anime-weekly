import { buildAnimeSitemap, buildPagesSitemap, sitemapIds } from '@/lib/seo-sitemap';
import { getSitemapCatalog } from '@/lib/sitemap-catalog';
import { getSeoWeeks } from '@/lib/weekly-seo-data';
import { siteUrl } from '@/lib/seo';

// Builds often run with the AniList budget already spent by other pages, so
// a shard may be prerendered empty. Retry hourly: complete year catalogs stay
// in the data cache for a day and ended seasons in Blob, so this adds no calls.
export const revalidate = 3600;

export function generateSitemaps() {
  return sitemapIds().map(id => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  const selected = await id;
  const date = new Date();
  if (selected === 'pages') return buildPagesSitemap(date, siteUrl(), await getSeoWeeks());
  if (!sitemapIds(date).includes(selected)) return [];
  return buildAnimeSitemap(await getSitemapCatalog(Number(selected)));
}
