import { getSeason } from '@/lib/anilist';
import { currentSeason } from '@/lib/season';
import { buildSitemap } from '@/lib/seo-sitemap';
export const revalidate = 86400;
export default async function sitemap() {
  const date = new Date();
  const season = currentSeason(date);
  // Exactly one cached, throttled AniList catalog query; no rating enrichment.
  const data = await getSeason(season.year, season.season);
  return buildSitemap(data.media.map(anime => anime.id), date);
}
