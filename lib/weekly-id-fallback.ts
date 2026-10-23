import 'server-only';
import { getWeeklyRatings, type WeeklyRatings } from '@/lib/weekly-ratings';
import { readWeekArchive } from '@/lib/week-archive';
import { formatWeek, parseWeek, shiftWeek } from '@/lib/week';
import type { Ratings } from '@/lib/ratings';

const LOOKBACK_WEEKS = 4;

/** Keep only the stable identity fields; never carry old scores into a new week. */
export function identityOnly(ratings: Ratings): Ratings {
  const ids: Ratings = {};
  if (ratings.anilistId) ids.anilistId = ratings.anilistId;
  if (ratings.malId) ids.malId = ratings.malId;
  if (ratings.imdbId) ids.imdbId = ratings.imdbId;
  return ids;
}

/** Merge ids from older snapshots under titles the current snapshot is missing. */
export function mergeIdentityFallback(current: WeeklyRatings, older: readonly WeeklyRatings[]): WeeklyRatings {
  const titles: Record<string, Ratings> = { ...current.titles };
  let added = 0;
  for (const snapshot of older) {
    for (const [key, ratings] of Object.entries(snapshot.titles ?? {})) {
      if (titles[key]?.anilistId) continue;
      const ids = identityOnly(ratings);
      if (!ids.anilistId) continue;
      titles[key] = { ...ids, ...titles[key] };
      added++;
    }
  }
  return added ? { ...current, titles } : current;
}

/**
 * When the current week's cron snapshot is empty (e.g. the cron failed), detail
 * links would fall back to search. Borrow only the TMDB->AniList identity map
 * from the most recent weeks that have data. Read-only: cached snapshots or the
 * existing archive; nothing new is stored.
 */
export async function withIdentityFallback(slug: string, snapshot: WeeklyRatings): Promise<WeeklyRatings> {
  if (Object.keys(snapshot.titles ?? {}).length) return snapshot;
  const week = parseWeek(slug);
  if (!week) return snapshot;
  const older: WeeklyRatings[] = [];
  for (let offset = 1; offset <= LOOKBACK_WEEKS; offset++) {
    const previous = shiftWeek(week, -offset);
    try {
      const archived = await readWeekArchive(previous);
      const ratings = archived?.ratings ?? await getWeeklyRatings(formatWeek(previous));
      if (Object.keys(ratings.titles ?? {}).length) older.push(ratings);
    } catch (e) { console.error('[weekly-id-fallback] read failed', formatWeek(previous), (e as Error)?.message); }
    if (older.length) break;
  }
  return mergeIdentityFallback(snapshot, older);
}
