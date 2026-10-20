import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { getSeason, type AniListAnime } from '@/lib/anilist';
import { getQuickWeekData, getWeeklyProviders } from '@/lib/tmdb';
import { getDetailProviders } from '@/lib/detail-availability';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import type { Season } from '@/lib/season';
import type { PlatformMetadata, PlatformSnapshot } from '@/lib/platform-data';
class MissingProviders extends Error {}
const weeklyProviders = unstable_cache(async (kind: 'tv' | 'movie', id: number): Promise<PlatformMetadata> => {
  const result = await getWeeklyProviders(kind, id);
  if (result.providersUnavailable) throw new MissingProviders();
  return result;
}, ['weekly-filter-providers-v1'], { revalidate: 3600, tags: [CACHE_TAG] });
const seasonProviders = unstable_cache(async (anime: AniListAnime): Promise<PlatformMetadata> => {
  const result = await getDetailProviders(anime);
  if ((!result.match && !result.seriesWatch && !Object.keys(result.providers).length) || result.providersUnavailable || result.seriesWatch?.providersUnavailable
    || result.ratings.imdbStatus === 'error' || result.ratings.imdbStatus === 'unconfigured') throw new MissingProviders();
  return { match: result.match, providers: result.providers, providersUnavailable: false, ...(result.seriesWatch ? { seriesWatch: result.seriesWatch } : {}) };
}, ['season-filter-providers-v3-series-identity'], { revalidate: 3600, tags: [CACHE_TAG] });

async function collect(entries: { key: string; load: () => Promise<PlatformMetadata> }[], deadline: number, partial = false): Promise<PlatformSnapshot> {
  const result: PlatformSnapshot = { titles: {}, unavailable: partial };
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (index < entries.length) {
      const entry = entries[index++];
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new MissingProviders();
        result.titles[entry.key] = await withTimeout(entry.load(), remaining);
      } catch {
        result.titles[entry.key] = { providers: {}, providersUnavailable: true };
        result.unavailable = true;
      }
    }
  }));
  return result;
}
export async function getWeeklyPlatformMetadata(slug: string): Promise<PlatformSnapshot> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const deadline = Date.now() + 23000;
  const catalog = await withTimeout(getQuickWeekData(week, 'en'), 10000);
  if (catalog.status !== 'ready') throw new MissingProviders();
  return collect(catalog.titles.map(title => ({ key: `${title.kind}:${title.id}`, load: () => weeklyProviders(title.kind, title.id) })), deadline, catalog.partial);
}
export async function getSeasonPlatformMetadata(year: number, season: Season, page: number): Promise<PlatformSnapshot> {
  const deadline = Date.now() + 23000;
  // Seed the canonical season catalog once; avoid 50 parallel exact-ID AniList
  // requests just to populate a filter. Neither path calls IMDb or Jikan.
  const catalog = await withTimeout(getSeason(year, season, page), 10000);
  if (!catalog.media.length) throw new MissingProviders();
  return collect(catalog.media.map(anime => ({ key: `anilist:${anime.id}`, load: () => seasonProviders(anime) })), deadline);
}
/** Real TMDB watch providers for specific AniList titles (cached per title, bounded concurrency/deadline). */
export async function getAnimePlatformMetadata(media: readonly AniListAnime[], budgetMs = 23000): Promise<PlatformSnapshot> {
  return collect(media.map(anime => ({ key: `anilist:${anime.id}`, load: () => seasonProviders(anime) })), Date.now() + budgetMs);
}
