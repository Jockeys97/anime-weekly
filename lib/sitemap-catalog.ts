import 'server-only';
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { get, put } from '@vercel/blob';
import { unstable_cache } from 'next/cache';
import { animeName, getSeason } from '@/lib/anilist';
import { CACHE_TAG } from '@/lib/config';
import { currentSeason, SEASONS, type Season } from '@/lib/season';
import type { SitemapAnime } from '@/lib/seo-sitemap';

const DAY_MS = 86400000;
// Ended seasons barely change: reuse their saved list for a month instead of
// re-crawling AniList (30 requests/minute when degraded) every day.
const PAST_SEASON_MAX_AGE = 30 * DAY_MS;
interface StoredSeason { version: 1; year: number; season: Season; savedAt: string; anime: SitemapAnime[] }
type SeasonResult = { anime: SitemapAnime[]; complete: boolean };

const seasonKey = (year: number, season: Season) => `sitemap/seasons/${year}-${season}.json`;
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

class IncompleteCatalog extends Error {
  constructor(readonly anime: SitemapAnime[]) { super('Sitemap catalog incomplete'); }
}

function isPastSeason(year: number, season: Season, now: Date): boolean {
  const current = currentSeason(now);
  return year < current.year || (year === current.year && SEASONS.indexOf(season) < SEASONS.indexOf(current.season));
}

function validStoredSeason(value: unknown, year: number, season: Season): value is StoredSeason {
  if (!value || typeof value !== 'object') return false;
  const stored = value as StoredSeason;
  return stored.version === 1 && stored.year === year && stored.season === season
    && Number.isFinite(Date.parse(stored.savedAt)) && Array.isArray(stored.anime) && stored.anime.length > 0
    && stored.anime.every(item => item && Number.isSafeInteger(item.id) && item.id > 0);
}

async function readStoredSeason(year: number, season: Season): Promise<StoredSeason | null> {
  if (!configured()) return null;
  try {
    const result = await get(seasonKey(year, season), { access: 'private', abortSignal: AbortSignal.timeout(10000) });
    if (!result || result.statusCode !== 200) return null;
    const payload: unknown = await new Response(result.stream).json();
    return validStoredSeason(payload, year, season) ? payload : null;
  } catch { return null; }
}

async function storeSeason(year: number, season: Season, anime: SitemapAnime[]): Promise<void> {
  if (!configured() || !anime.length) return;
  const payload: StoredSeason = { version: 1, year, season, savedAt: new Date().toISOString(), anime };
  try {
    await put(seasonKey(year, season), JSON.stringify(payload), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', abortSignal: AbortSignal.timeout(15000),
    });
  } catch (error) { console.error('[sitemap] season save failed', year, season, error); }
}

// Requests go through the shared AniList queue and fetch cache of the catalog
// pages. Any unavailable page marks the season incomplete.
async function crawlSeason(year: number, season: Season): Promise<SeasonResult> {
  const anime: SitemapAnime[] = [];
  try {
    for (let page = 1; ; page++) {
      const data = await getSeason(year, season, page);
      if (data.unavailable) return { anime, complete: false };
      for (const item of data.media) anime.push({ id: item.id, name: animeName(item), updatedAt: item.updatedAt ?? null });
      if (!data.pageInfo.hasNextPage || !data.media.length) return { anime, complete: true };
    }
  } catch { return { anime, complete: false }; }
}

async function loadSeason(year: number, season: Season, now: Date): Promise<SeasonResult> {
  const stored = await readStoredSeason(year, season);
  if (stored && isPastSeason(year, season, now) && now.getTime() - Date.parse(stored.savedAt) < PAST_SEASON_MAX_AGE) {
    return { anime: stored.anime, complete: true };
  }
  const crawled = await crawlSeason(year, season);
  if (crawled.complete) {
    await storeSeason(year, season, crawled.anime);
    return crawled;
  }
  console.error('[sitemap] AniList season incomplete, using saved list', year, season, Boolean(stored));
  // The saved list is a full season: prefer it to a partial crawl.
  return { anime: stored?.anime ?? crawled.anime, complete: false };
}

// One shard per year. An incomplete crawl throws inside the cache so it is
// never stored as the day's result; the caller still serves what it has.
const getCachedYearCatalog = unstable_cache(async (year: number) => {
  const anime = new Map<number, SitemapAnime>();
  let complete = true;
  for (const season of SEASONS) {
    const result = await loadSeason(year, season, new Date());
    complete &&= result.complete;
    for (const item of result.anime) if (!anime.has(item.id)) anime.set(item.id, item);
  }
  if (!complete) throw new IncompleteCatalog([...anime.values()]);
  return [...anime.values()];
}, ['sitemap-year-catalog-v3'], { revalidate: 86400, tags: [CACHE_TAG] });

// Coalesce concurrent cold misses of the same shard into one crawl.
const pending = new Map<number, Promise<SitemapAnime[]>>();
export async function getSitemapCatalog(year: number): Promise<SitemapAnime[]> {
  let request = pending.get(year);
  if (!request) {
    request = getCachedYearCatalog(year).catch(error => error instanceof IncompleteCatalog ? error.anime : []);
    pending.set(year, request);
  }
  try {
    const catalog = await request;
    const localized: SitemapAnime[] = [];
    for (let offset = 0; offset < catalog.length; offset += 4) {
      localized.push(...await Promise.all(catalog.slice(offset, offset + 4).map(async item => ({
        ...item, localizedNames: await getAnimeLocalizedTitles(item.id, item.name || ''),
      }))));
    }
    return localized;
  }
  finally { if (pending.get(year) === request) pending.delete(year); }
}
