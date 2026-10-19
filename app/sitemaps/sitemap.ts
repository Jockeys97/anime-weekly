import { currentSeason } from '@/lib/season';
import { buildAnimeSitemap, buildPagesSitemap, sitemapIds } from '@/lib/seo-sitemap';
import { getSitemapCatalog } from '@/lib/sitemap-catalog';

export const revalidate = 86400;

export function generateSitemaps() {
  return sitemapIds().map(id => ({ id }));
}

export default async function sitemap({ id }: { id: Promise<string> }) {
  const selected = await id;
  const date = new Date();
  if (selected === 'pages') return buildPagesSitemap(date);
  if (!sitemapIds(date).includes(selected)) return [];
  const data = await getSitemapCatalog(currentSeason(date).year);
  return buildAnimeSitemap(data.filter(anime => String(anime.year) === selected));
}
