import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { isWeeklyRatingComplete, primeWeeklyRatings, readWeeklyRatingsSnapshot, WEEKLY_PAGE_TAG } from '@/lib/weekly-ratings';
import { parseWeek } from '@/lib/week';
import { formatWeek, isoWeek } from '@/lib/week';
import { getDictionary } from '@/lib/i18n';
export const maxDuration = 300;
export async function GET(request: Request) {
  // Public read-only mode: serve the cron-written snapshot from this same
  // bundle (unstable_cache entries are only reliably readable here). Never
  // calls rating APIs; a cold cache returns an empty snapshot.
  const read = new URL(request.url).searchParams.get('ratings');
  if (read !== null) {
    if (!parseWeek(read)) return Response.json({ error: 'invalid week' }, { status: 400 });
    const snapshot = await readWeeklyRatingsSnapshot(read);
    return Response.json(snapshot, { headers: { 'cache-control': 'public, s-maxage=300' } });
  }
  const d = getDictionary(); const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return Response.json({ error: d.api.missingSecret }, { status: 500 });
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: d.api.unauthorized }, { status: 401 });
  revalidateTag(CACHE_TAG, { expire: 0 });
  const week = isoWeek(new Date());
  let total = 0;
  let complete = false;
  let populated = 0;
  let unavailable = 0;
  try {
    const previous = await readWeeklyRatingsSnapshot(formatWeek(week));
    const snapshot = await primeWeeklyRatings(formatWeek(week), previous);
    total = snapshot.total;
    complete = Object.keys(snapshot.titles).length >= total && Object.values(snapshot.titles).every(isWeeklyRatingComplete);
    populated = Object.values(snapshot.titles).filter(ratings => ratings.imdbRating || ratings.anilistScore != null || ratings.malScore != null).length;
    unavailable = Math.max(0, total - populated);
  } catch {
    // Still refresh discovery/page paths if optional rating services fail.
    // Failed loaders never replace a successful snapshot with an error.
    unavailable = 1;
  }
  // The ratings snapshot has its own tag: discovery invalidation must never
  // delete the values just computed by this job.
  revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
  return Response.json({ revalidated: true, week: formatWeek(week), total, populated, unavailable, complete });
}
