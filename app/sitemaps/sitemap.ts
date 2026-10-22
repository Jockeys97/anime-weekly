import { getDiscoverySitemap } from '@/lib/discovery-sitemap';
import { buildAnimeSitemap, buildPagesSitemap, sitemapIds } from '@/lib/seo-sitemap';
import { getSitemapCatalog } from '@/lib/sitemap-catalog';
import { getSeoWeeks } from '@/lib/weekly-seo-data';
import { siteUrl } from '@/lib/seo';

// Successful shards revalidate hourly. Discovery errors must propagate so ISR
// retains a previous success and retries, rather than caching an empty urlset.
export const revalidate = 3600;

export function generateSitemaps() {
  return sitemapIds().map(id => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  const selected = await id;
  const date = new Date();
  if (selected === 'discovery') return getDiscoverySitemap(date);
  if (selected === 'pages') return buildPagesSitemap(date, siteUrl(), await getSeoWeeks());
  if (!sitemapIds(date).includes(selected)) return [];
  return buildAnimeSitemap(await getSitemapCatalog(Number(selected)));
}
