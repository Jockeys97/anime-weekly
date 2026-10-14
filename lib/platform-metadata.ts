import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { getSeason } from '@/lib/anilist';
import { getAnimeAvailability, getQuickWeekData, getWeeklyProviders } from '@/lib/tmdb';
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
const seasonProviders = unstable_cache(async (aliases: string[], year?: number, kind?: 'tv' | 'movie'): Promise<PlatformMetadata> => {
  const result = await getAnimeAvailability(aliases, year, kind, false, true);
  if (result.providersUnavailable || result.ratings.imdbStatus === 'error' || result.ratings.imdbStatus === 'unconfigured') throw new MissingProviders();
  return { match: result.match, providers: result.providers, providersUnavailable: false };
}, ['season-filter-providers-v2-card-source'], { revalidate: 3600, tags: [CACHE_TAG] });

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
  return collect(catalog.media.map(anime => {
    const premiere = anime.startDate?.year ?? anime.seasonYear ?? undefined;
    const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((name): name is string => Boolean(name))
      .map(name => premiere == null ? name : name.replace(/\s*\((?:19|20)\d{2}\)\s*$/u, ''));
    const kind = anime.format === 'MOVIE' ? 'movie' : ['TV', 'TV_SHORT', 'ONA'].includes(anime.format ?? '') ? 'tv' : undefined;
    return { key: `anilist:${anime.id}`, load: () => seasonProviders(aliases, premiere, kind) };
  }), deadline);
}
