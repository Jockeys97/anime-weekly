import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getSeason, type AniListAnime } from '@/lib/anilist';
import { currentSeason, shiftSeason } from '@/lib/season';
import { CACHE_TAG } from '@/lib/config';
import { rankGenre, rankSimilar } from '@/lib/discovery';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek, weekRange } from '@/lib/week';
import type { Ratings } from '@/lib/ratings';

// Cache only a successful crawl, never raw HTTP/GraphQL error responses. This
// catalog is shared by lists, detail blocks and sitemap across all locales.
const MAX_CATALOG_PAGES = 40;
async function crawlCatalog(year: number, season: ReturnType<typeof currentSeason>['season']) {
  const seasons = [shiftSeason({ year, season }, -1), { year, season }];
  const media = new Map<number, AniListAnime>();
  for (const selected of seasons) {
    const seen = new Set<number>();
    for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
      const result = await getSeason(selected.year, selected.season, page, { fresh: true });
      if (result.unavailable) throw new Error('Discovery catalog unavailable');
      const previousSize = seen.size;
      for (const anime of result.media) {
        seen.add(anime.id);
        media.set(anime.id, anime);
      }
      if (!result.pageInfo.hasNextPage) break;
      // A large season (or bad pagination upstream) must not discard all the
      // candidates already collected. Keep a bounded recommendation pool.
      if (seen.size === previousSize || page === MAX_CATALOG_PAGES) {
        console.warn('[discovery] Catalog pagination bounded', { ...selected, page, count: media.size });
        break;
      }
    }
  }
  return [...media.values()];
}
// Share the actual crawl, including background revalidation of a stale entry.
// Coalescing outside unstable_cache would only share its immediate stale return,
// leaving simultaneous background refreshes to repeat the same upstream work.
const pendingCatalogs = new Map<string, Promise<AniListAnime[]>>();
const catalog = unstable_cache((year: number, season: ReturnType<typeof currentSeason>['season']) => {
  const key = `${year}-${season}`;
  let pending = pendingCatalogs.get(key);
  if (!pending) {
    pending = crawlCatalog(year, season).finally(() => pendingCatalogs.delete(key));
    pendingCatalogs.set(key, pending);
  }
  return pending;
}, ['discovery-catalog-v2'], { revalidate: 86400, tags: [CACHE_TAG] });
export const getDiscoveryCatalog = cache(async () => {
  const { year, season } = currentSeason();
  return catalog(year, season);
});
export const getSimilarAnime = cache(async (anime: AniListAnime) => rankSimilar(anime, await getDiscoveryCatalog()));

// Read the cron-populated schedule only: a cold snapshot must never trigger
// schedule fetching or per-title enrichment from a detail-page request.
export const getAiringThisWeekAnime = cache(async () => {
  const week = isoWeek(new Date());
  const snapshot = await readWeeklyRatingsSnapshot(formatWeek(week));
  const start = weekRange(week).monday.getTime() / 1000;
  const events = snapshot.events.filter(event => Number.isSafeInteger(event.airingAt)
    && Number.isSafeInteger(event.episode) && event.episode > 0
    && event.airingAt >= start && event.airingAt < start + 7 * 86400)
    .sort((a, b) => a.airingAt - b.airingAt || a.mediaId - b.mediaId);
  if (!events.length) return [];
  const catalog = new Map((await getDiscoveryCatalog()).map(anime => [anime.id, anime]));
  return [...new Set(events.map(event => event.mediaId))].flatMap(id => {
    const anime = catalog.get(id);
    return anime ? [anime] : [];
  });
});

export const getGenreLists = cache(async (providedCatalog?: AniListAnime[]) => {
  const season = currentSeason();
  const [catalog, store, snapshot] = await Promise.all([providedCatalog ?? getDiscoveryCatalog(), readRatingsStore(), readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date())))]);
  const media = catalog.filter(anime => anime.seasonYear === season.year && anime.season?.toLowerCase() === season.season);
  const ratings: Record<number, Ratings> = {};
  const weekly = new Map(Object.values(snapshot.titles).map(r => [r.anilistId, r]));
  for (const anime of media) {
    const r = { ...weekly.get(anime.id) };
    const mapping = Object.values(store.sources).find(s => s.anilistId === anime.id && Date.now() - s.fetchedAt <= 120 * 86400000);
    for (const key of [mapping?.imdbId ? `imdb:${mapping.imdbId}` : '', `anilist:${anime.id}`, anime.idMal ? `mal:${anime.idMal}` : '']) {
      const entry = store.ratings[key];
      if (entry && Date.now() - entry.fetchedAt <= 120 * 86400000) {
        Object.assign(r, entry.values);
        // Stored provider values contain scores, not identity fields. The exact
        // MAL cache key establishes the identity required by rankGenre.
        if (key === `mal:${anime.idMal}`) r.malId = anime.idMal!;
      }
    }
    ratings[anime.id] = r;
  }
  const genres = [...new Set(media.flatMap(anime => anime.genres))].sort();
  return { season, media, lists: genres.map(genre => ({ genre, items: rankGenre(media, genre, ratings) })) };
});
