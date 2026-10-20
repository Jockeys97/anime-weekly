import { buildAnimeSitemap, buildPagesSitemap, sitemapIds } from '@/lib/seo-sitemap';
import { getSitemapCatalog } from '@/lib/sitemap-catalog';
import { listArchivedWeeks } from '@/lib/week-archive';
import { siteUrl } from '@/lib/seo';

export const revalidate = 86400;

export function generateSitemaps() {
  return sitemapIds().map(id => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  const selected = await id;
  const date = new Date();
  if (selected === 'pages') return buildPagesSitemap(date, siteUrl(), await listArchivedWeeks());
  if (!sitemapIds(date).includes(selected)) return [];
  return buildAnimeSitemap(await getSitemapCatalog(Number(selected)));
}
