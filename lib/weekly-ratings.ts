import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS } from '@/lib/config';
import { lookupAnimeRatings } from '@/lib/anime-ratings';
import { getRatings, getWeeklyRatingSources } from '@/lib/tmdb';
import { primeImdbScore } from '@/lib/imdb';
import { getWeekAirings, type AiringEvent } from '@/lib/airing-schedule';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import { displayTitle } from '@/lib/title-text';
import type { Ratings } from '@/lib/ratings';
import type { WeeklyEpisodes } from '@/lib/weekly-episodes';

export const WEEKLY_RATINGS_TAG = 'weekly-ratings';
export const WEEKLY_PAGE_TAG = 'weekly-page-output';
// Invalidate HTML after warming without expiring the ratings it just read.
// revalidatePath would also expire Data Cache entries via implicit path tags.
export const trackWeeklyPage = unstable_cache(async () => null, ['weekly-page-output-v1'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_PAGE_TAG] });
export interface WeeklyRatings {
  titles: Record<string, Ratings>;
  events: AiringEvent[];
  names?: Record<string, string>;
  episodes?: WeeklyEpisodes;
}
class ColdWeeklyRatings extends Error {}
const empty = (): WeeklyRatings => ({ titles: {}, events: [] });

// Only the cron writer can expose a precomputed value to the shared loader.
let pendingSnapshot: { slug: string; snapshot: WeeklyRatings } | undefined;
function snapshotCache(canPopulate: boolean) {
  const loader = async (slug: string): Promise<WeeklyRatings> => {
    if (!canPopulate || pendingSnapshot?.slug !== slug) throw new ColdWeeklyRatings();
    return pendingSnapshot.snapshot;
  };
  // unstable_cache keys include cb.toString(), which differs between the cron
  // route bundle and page bundles after minification. Pin it so the page reads
  // exactly the entry the cron wrote.
  Object.defineProperty(loader, 'toString', { value: () => 'weekly-ratings-snapshot-loader' });
  return unstable_cache(loader, ['weekly-ratings-snapshot-v2'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_RATINGS_TAG] });
}

export async function readWeeklyRatingsSnapshot(slug: string): Promise<WeeklyRatings> {
  try { return await snapshotCache(false)(slug); }
  catch { return empty(); }
}

export async function getWeeklyRatings(slug: string): Promise<WeeklyRatings> {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host && process.env.VERCEL_ENV === 'production') {
    try {
      const res = await fetch(`https://${host}/api/revalidate?ratings=${encodeURIComponent(slug)}`, { next: { revalidate: 900, tags: [WEEKLY_RATINGS_TAG] }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json() as WeeklyRatings;
        if (data && data.titles && (Object.keys(data.titles).length || data.episodes)) return data;
        console.error('[weekly-ratings] endpoint empty', slug);
      } else console.error('[weekly-ratings] endpoint status', res.status);
    } catch (e) { console.error('[weekly-ratings] endpoint error', (e as Error)?.message); }
  }
  try { return await snapshotCache(false)(slug); }
  catch (e) { console.error("[weekly-ratings] read miss", slug, (e as Error)?.constructor?.name); return empty(); }
}
export function isWeeklyRatingComplete(rating: Ratings): boolean {
  return rating.malScore != null && Boolean(rating.imdbRating) && rating.anilistScore != null;
}

// Compute before invalidating: provider failures must never erase a good snapshot.
export async function primeWeeklyRatings(slug: string, previous?: WeeklyRatings): Promise<WeeklyRatings & { total: number }> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const old = previous ?? await readWeeklyRatingsSnapshot(slug);
  const deadline = Date.now() + 260000;
  const sources = await getWeeklyRatingSources(week);
  const names = { ...old.names };
  const snapshot: WeeklyRatings = { ...old, titles: { ...old.titles }, events: [...old.events], names };
  // Populate every source before completed ratings or the time budget skip it.
  for (const source of sources) {
    const name = displayTitle(source.title);
    if (name) names[`${source.kind}:${source.id}`] = name;
  }
  let omdbAvailable = true;
  let jikanAvailable = true;
  let completed = Object.values(old.titles).filter(rating => rating.imdbRating || rating.anilistScore != null || rating.malScore != null).length;
  const imdb = new Map<string, Ratings>();
  for (const source of sources) {
    const key = `${source.kind}:${source.id}`;
    const existing = snapshot.titles[key] ?? {};
    if (isWeeklyRatingComplete(existing)) continue;
    if (Date.now() > deadline - 18000) break;
    const [external, anime] = await Promise.all([
      !existing.imdbRating && omdbAvailable && !existing.imdbId
        ? withTimeout(getRatings(source.kind, source.id), 13000).catch(() => ({} as Ratings))
        : Promise.resolve({} as Ratings),
      existing.anilistScore == null || (existing.malScore == null && jikanAvailable)
        ? withTimeout(lookupAnimeRatings(source, {
          weekly: true, existing, skipJikan: !jikanAvailable,
          onJikanTimeout: () => { jikanAvailable = false; },
        }), 16000).catch(() => ({ ratings: {}, unavailable: true }))
        : Promise.resolve({ ratings: {}, unavailable: false }),
    ]);
    const imdbId = existing.imdbId ?? external.imdbId;
    let score: Ratings = {};
    if (!existing.imdbRating && imdbId && omdbAvailable) {
      score = imdb.get(imdbId) ?? await primeImdbScore(imdbId, slug);
      imdb.set(imdbId, score);
      if (score.imdbErrorReason === 'quota' || score.imdbErrorReason === 'authentication' || score.imdbStatus === 'unconfigured') omdbAvailable = false;
    }
    const ratings: Ratings = { ...existing };
    // Never merge null/undefined fallbacks or upstream error statuses.
    for (const [field, value] of Object.entries(anime.ratings)) {
      if (value != null && existing[field as keyof Ratings] == null) Object.assign(ratings, { [field]: value });
    }
    if (imdbId) ratings.imdbId = imdbId;
    if (score.imdbStatus === 'ready') {
      ratings.imdbRating = score.imdbRating ?? existing.imdbRating;
      ratings.imdbVotes = score.imdbVotes ?? existing.imdbVotes;
      ratings.imdbStatus = 'ready';
    }
    if (!anime.unavailable || score.imdbStatus === 'ready') completed++;
    snapshot.titles[key] = ratings;
  }
  const ids = Object.values(snapshot.titles).flatMap(rating => rating.anilistId ? [rating.anilistId] : []);
  const airings = await withTimeout(getWeekAirings(ids, week, Math.max(0, Math.min(12000, deadline - Date.now())), true, true), 12000)
    .catch(() => ({ events: [], unavailable: true }));
  const events = new Map(old.events.map(event => [event.id, event]));
  for (const event of airings.events) events.set(event.id, event);
  snapshot.events = [...events.values()];
  if (sources.length && !completed) throw new Error('Weekly ratings unavailable');

  // Storage happens in a separate request (storeWeeklyRatingsSnapshot):
  // an entry rewritten in the same request that invalidated its tag is
  // treated as stale and lost.
  return { ...snapshot, total: sources.length };
}

// Called from a fresh request after the cron invalidated WEEKLY_RATINGS_TAG.
export async function storeWeeklyRatingsSnapshot(slug: string, snapshot: WeeklyRatings): Promise<void> {
  pendingSnapshot = { slug, snapshot };
  try { await snapshotCache(true)(slug); }
  finally { pendingSnapshot = undefined; }
}
