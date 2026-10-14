import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS } from '@/lib/config';
import { lookupAnimeRatings } from '@/lib/anime-ratings';
import { getRatings, getWeeklyRatingSources } from '@/lib/tmdb';
import { primeImdbScore } from '@/lib/imdb';
import { getWeekAirings, type AiringEvent } from '@/lib/airing-schedule';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import type { Ratings } from '@/lib/ratings';

export const WEEKLY_RATINGS_TAG = 'weekly-ratings';
export const WEEKLY_PAGE_TAG = 'weekly-page-output';
// Invalidate HTML after warming without expiring the ratings it just read.
// revalidatePath would also expire Data Cache entries via implicit path tags.
export const trackWeeklyPage = unstable_cache(async () => null, ['weekly-page-output-v1'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_PAGE_TAG] });
export interface WeeklyRatings {
  titles: Record<string, Ratings>;
  events: AiringEvent[];
}
class ColdWeeklyRatings extends Error {}
const empty = (): WeeklyRatings => ({ titles: {}, events: [] });

// The closure is deliberately absent from the cache key: readers and cron use
// identical function source, key parts and arguments. Only cron may populate a
// miss. A reader throws instead of persisting an empty snapshot or calling APIs.
function snapshotCache(canPopulate: boolean) {
  const loader = async (slug: string): Promise<WeeklyRatings> => {
    if (!canPopulate) throw new ColdWeeklyRatings();
    const week = parseWeek(slug);
    if (!week) throw new Error('Invalid week');
    const deadline = Date.now() + 260000; // Leave room within Hobby's 300s limit.
    const sources = await getWeeklyRatingSources(week);
    const snapshot = empty();
    let completed = 0;
    let omdbAvailable = true;
    const imdb = new Map<string, Ratings>();
    for (const source of sources) {
      if (Date.now() > deadline - 18000) break;
      const [external, anime] = await Promise.all([
        withTimeout(getRatings(source.kind, source.id), 13000).catch(() => ({} as Ratings)),
        withTimeout(lookupAnimeRatings(source, { weekly: true }), 16000).catch(() => ({ ratings: {}, unavailable: true })),
      ]);
      let score: Ratings = {};
      if (external.imdbId) {
        score = imdb.get(external.imdbId) || {};
        if (!imdb.has(external.imdbId) && omdbAvailable) {
          score = await primeImdbScore(external.imdbId, slug);
          imdb.set(external.imdbId, score);
          if (score.imdbErrorReason === 'quota' || score.imdbErrorReason === 'authentication' || score.imdbStatus === 'unconfigured') omdbAvailable = false;
        }
      }
      // Store confirmed matches and successful scores only, never upstream
      // error bodies/statuses. Missing sources render as neutral n/a.
      const ratings: Ratings = { ...anime.ratings };
      if (!anime.unavailable || score.imdbStatus === 'ready') completed++;
      if (external.imdbId) ratings.imdbId = external.imdbId;
      if (score.imdbStatus === 'ready') {
        ratings.imdbRating = score.imdbRating;
        ratings.imdbVotes = score.imdbVotes;
        ratings.imdbStatus = 'ready';
      }
      snapshot.titles[`${source.kind}:${source.id}`] = ratings;
    }
    const ids = Object.values(snapshot.titles).flatMap(rating => rating.anilistId ? [rating.anilistId] : []);
    const airings = await withTimeout(getWeekAirings(ids, week, Math.max(0, Math.min(12000, deadline - Date.now())), true, true), 12000)
      .catch(() => ({ events: [], unavailable: true }));
    snapshot.events = airings.events;
    // A wholly failed job must remain retryable rather than cache an outage.
    if (sources.length && !completed) throw new Error('Weekly ratings unavailable');
    return snapshot;
  };
  // unstable_cache keys include cb.toString(), which differs between the cron
  // route bundle and page bundles after minification. Pin it so the page reads
  // exactly the entry the cron wrote.
  Object.defineProperty(loader, 'toString', { value: () => 'weekly-ratings-snapshot-loader' });
  return unstable_cache(loader, ['weekly-ratings-snapshot-v1'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_RATINGS_TAG] });
}

export async function getWeeklyRatings(slug: string): Promise<WeeklyRatings> {
  try { return await snapshotCache(false)(slug); }
  catch (e) { console.error("[weekly-ratings] read miss", slug, (e as Error)?.constructor?.name); return empty(); }
}
// Authenticated cron only. The shared cache also deduplicates repeat cron runs.
export function primeWeeklyRatings(slug: string): Promise<WeeklyRatings> {
  return snapshotCache(true)(slug);
}
