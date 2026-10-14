import type { MetadataRoute } from 'next';
import { platformPaths } from '@/lib/platforms';
import { currentSeason, SEASONS, seasonPath } from '@/lib/season';
import { formatWeek, isoWeek, shiftWeek } from '@/lib/week';
import { siteUrl } from '@/lib/seo';

export function buildSitemap(ids: readonly number[], date = new Date(), base = siteUrl()): MetadataRoute.Sitemap {
  const week = isoWeek(date);
  const { year } = currentSeason(date);
  const paths = ['/', '/season', '/piattaforma', ...[-1, 0, 1].map(offset => `/week/${formatWeek(shiftWeek(week, offset))}`),
    ...[year - 2, year - 1, year].flatMap(year => SEASONS.map(season => seasonPath({ year, season }))),
    ...platformPaths(), ...ids.slice(0, 50).filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647).map(id => `/anime/${id}`)];
  return [...new Set(paths)].map(path => ({ url: new URL(path, base).href, changeFrequency: 'daily' }));
}
