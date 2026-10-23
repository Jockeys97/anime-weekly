import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { unstable_cache } from 'next/cache';
import { getPopularCatalogBatch, getSeason, type AniListAnime } from '@/lib/anilist';
import { POPULAR_CATALOG_PAGES, POPULAR_PAGES_PER_BATCH, discoveryCandidate } from '@/lib/anilist-discovery-query';
import { currentSeason, shiftSeason } from '@/lib/season';
import { SIMILAR_CATALOG_TAG } from '@/lib/similar-catalog-client';

function compactCandidate(anime: AniListAnime) {
  const { id, idMal, title, coverImage, genres, averageScore, format, status,
    season, seasonYear, popularity, isAdult, tags, relations } = anime;
  return discoveryCandidate({ id, idMal, title, coverImage, genres, averageScore,
    format, status, season, seasonYear, popularity, isAdult, tags, relations });
}

// Cache only a successful crawl, never raw HTTP/GraphQL error responses. This
// catalog is shared by lists, detail blocks and sitemap across all locales.
const MAX_CATALOG_PAGES = 40;
const warmDeadline = new AsyncLocalStorage<number>();
function remainingBudget() {
  const remaining = (warmDeadline.getStore() ?? 0) - Date.now();
  if (remaining <= 0) throw new Error('Catalog warm budget exhausted');
  return Math.min(15000, remaining);
}
async function crawlCatalog(year: number, season: ReturnType<typeof currentSeason>['season']) {
  const seasons = [shiftSeason({ year, season }, -1), { year, season }];
  const media = new Map<number, AniListAnime>();
  for (const selected of seasons) {
    const seen = new Set<number>();
    for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
      const result = await getSeason(selected.year, selected.season, page, { fresh: true, maxWaitMs: remainingBudget() });
      if (result.unavailable) throw new Error('Discovery catalog unavailable');
      const previousSize = seen.size;
      for (const anime of result.media) {
        seen.add(anime.id);
        media.set(anime.id, compactCandidate(anime));
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
function seasonalCache(canCrawl: boolean) {
  const loader = (year: number, season: ReturnType<typeof currentSeason>['season']) => {
    if (!canCrawl) throw new Error('Discovery catalog unavailable');
    const key = `${year}-${season}`;
    let pending = pendingCatalogs.get(key);
    if (!pending) {
      pending = crawlCatalog(year, season).finally(() => pendingCatalogs.delete(key));
      pendingCatalogs.set(key, pending);
    }
    return pending;
  };
  // The read and warm closures share a cache key even after bundler minification.
  // Authorization is enforced by the API before selecting the warm closure.
  Object.defineProperty(loader, 'toString', { value: () => 'cron-seasonal-catalog-read-write-v1' });
  return unstable_cache(loader, ['cron-seasonal-catalog-v1'], { revalidate: 86400, tags: [SIMILAR_CATALOG_TAG] });
}
export async function readSeasonalCatalog() {
  const { year, season } = currentSeason();
  return seasonalCache(false)(year, season);
}
// Catalogs have their own tag and refresh only in the authorized warm path.

// Independent of year, locale and source anime: one all-time crawl per week.
let pendingPopular: Promise<AniListAnime[]> | undefined;
function popularCache(canCrawl: boolean) {
  const loader = () => {
    if (!canCrawl) throw new Error('Similar catalog unavailable');
    if (!pendingPopular) pendingPopular = (async () => {
      const media = new Map<number, AniListAnime>();
      for (let page = 1; page <= POPULAR_CATALOG_PAGES; page += POPULAR_PAGES_PER_BATCH) {
        const batch = await getPopularCatalogBatch(page, remainingBudget());
        for (const result of batch) for (const anime of result.media) media.set(anime.id, compactCandidate(anime));
        if (batch.some(result => !result.pageInfo.hasNextPage)) break;
      }
      return [...media.values()];
    })().finally(() => { pendingPopular = undefined; });
    return pendingPopular;
  };
  Object.defineProperty(loader, 'toString', { value: () => 'cron-popular-catalog-read-write-v1' });
  return unstable_cache(loader, ['cron-popular-catalog-v1'], { revalidate: 604800, tags: [SIMILAR_CATALOG_TAG] });
}
export async function readSimilarCatalog() {
  // Read mode throws on a cold cache; it never crawls.
  const seasonal = await readSeasonalCatalog();
  const popular = await popularCache(false)();
  return [...new Map([...popular, ...seasonal].map(anime => [anime.id, anime])).values()];
}
// Called only by the authorized cron in the API bundle, which also owns
// authenticated catalog reads. A stale unstable_cache read starts the loader before returning
// its old value: also await that loader so counts describe the completed crawl.
// Failed refreshes leave the previous successful Next data cache entry intact.
export async function warmSimilarCatalogs() {
  const started = Date.now();
  return warmDeadline.run(started + 240000, async () => {
    const { year, season } = currentSeason();
    const cachedSeasonal = await seasonalCache(true)(year, season);
    const seasonal = await (pendingCatalogs.get(`${year}-${season}`) ?? cachedSeasonal);
    const seasonalMs = Date.now() - started;
    const cachedPopular = await popularCache(true)();
    const popular = await (pendingPopular ?? cachedPopular);
    return { seasonal: seasonal.length, popular: popular.length, seasonalMs, popularMs: Date.now() - started - seasonalMs };
  });
}

