import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { primeWeeklyRatings, WEEKLY_PAGE_TAG } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import { getDictionary } from '@/lib/i18n';
export const maxDuration = 300;
export async function GET(request: Request) {
  const d = getDictionary(); const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return Response.json({ error: d.api.missingSecret }, { status: 500 });
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: d.api.unauthorized }, { status: 401 });
  revalidateTag(CACHE_TAG, { expire: 0 });
  revalidatePath('/');
  const week = isoWeek(new Date());
  let populated = 0;
  let unavailable = 0;
  try {
    const snapshot = await primeWeeklyRatings(formatWeek(week));
    populated = Object.values(snapshot.titles).filter(ratings => ratings.imdbRating || ratings.anilistScore != null || ratings.malScore != null).length;
    unavailable = Object.keys(snapshot.titles).length - populated;
  } catch {
    // Still refresh discovery/page paths if optional rating services fail.
    // Failed loaders never replace a successful snapshot with an error.
    unavailable = 1;
  }
  // The ratings snapshot has its own tag: discovery invalidation must never
  // delete the values just computed by this job.
  revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
  return Response.json({ revalidated: true, week: formatWeek(week), populated, unavailable });
}
