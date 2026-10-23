import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getPopularCatalogBatch, getSeason, type AniListAnime } from '@/lib/anilist';
import { POPULAR_CATALOG_PAGES, POPULAR_PAGES_PER_BATCH } from '@/lib/anilist-discovery-query';
import { currentSeason, shiftSeason } from '@/lib/season';
import { CACHE_TAG } from '@/lib/config';
import { rankGenre, rankSimilar } from '@/lib/discovery';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
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
}, ['discovery-catalog-v3-tag-safety-popularity'], { revalidate: 86400, tags: [CACHE_TAG] });
export const getDiscoveryCatalog = cache(async () => {
  const { year, season } = currentSeason();
  return catalog(year, season);
});
// Own tag: the daily CACHE_TAG expiry in /api/revalidate must not wipe this
// weekly catalog (a cold read crawls AniList for minutes). The daily
// /api/similar-catalog cron refreshes it with stale-while-revalidate instead.
export const SIMILAR_CATALOG_TAG = 'similar-catalog';
// Independent of year, locale and source anime: one all-time crawl per week.
let pendingPopular: Promise<AniListAnime[]> | undefined;
const popularCatalog = unstable_cache(() => {
  if (!pendingPopular) pendingPopular = (async () => {
    const media = new Map<number, AniListAnime>();
    for (let page = 1; page <= POPULAR_CATALOG_PAGES; page += POPULAR_PAGES_PER_BATCH) {
      const batch = await getPopularCatalogBatch(page);
      for (const result of batch) for (const anime of result.media) media.set(anime.id, anime);
      if (batch.some(result => !result.pageInfo.hasNextPage)) break;
    }
    return [...media.values()];
  })().finally(() => { pendingPopular = undefined; });
  return pendingPopular;
}, ['discovery-popular-catalog-v1-top500'], { revalidate: 604800, tags: [SIMILAR_CATALOG_TAG] });
export const getSimilarCatalog = cache(async () => {
  // Sequential crawls keep the shared AniList queue bounded on a cold build.
  const seasonal = await getDiscoveryCatalog();
  const popular = await popularCatalog();
  return [...new Map([...popular, ...seasonal].map(anime => [anime.id, anime])).values()];
});
const getSimilarAnimeFull = cache(async (anime: AniListAnime) => rankSimilar(anime, await getSimilarCatalog()));

// Page path: never wait minutes for a cold all-time catalog. After maxWaitMs,
// rank against the seasonal catalog only (kept warm daily); the full crawl
// keeps running and the daily cron populates it for later requests.
export const SIMILAR_PAGE_WAIT_MS = 4000;
export async function getSimilarAnime(anime: AniListAnime, maxWaitMs = SIMILAR_PAGE_WAIT_MS) {
  const full = getSimilarAnimeFull(anime);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), maxWaitMs); });
  try {
    const result = await Promise.race([full, timeout]);
    if (result) return result;
  } finally { clearTimeout(timer); }
  full.catch(() => undefined);
  console.warn('[discovery] Similar catalog cold; using seasonal fallback', { id: anime.id });
  return rankSimilar(anime, await getDiscoveryCatalog());
}

// Daily cron: mark the all-time catalog stale (old entry keeps serving and is
// kept if the refresh fails), trigger its background refresh, and warm the
// seasonal catalog. Nothing is persisted outside the Next data cache.
export async function refreshSimilarCatalogs(revalidate: (tag: string) => void) {
  revalidate(SIMILAR_CATALOG_TAG);
  const seasonal = await getDiscoveryCatalog();
  const popular = await popularCatalog();
  return { seasonal: seasonal.length, popular: popular.length };
}

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
