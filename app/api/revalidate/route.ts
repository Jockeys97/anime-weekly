import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { CACHE_TAG } from '@/lib/config';
import { isWeeklyRatingComplete, primeWeeklyRatings, readWeeklyRatingsSnapshot, storeWeeklyRatingsSnapshot, WEEKLY_PAGE_TAG, WEEKLY_RATINGS_TAG, type WeeklyRatings } from '@/lib/weekly-ratings';
import { parseWeek } from '@/lib/week';
import { formatWeek, isoWeek } from '@/lib/week';
import { primeWeeklyEpisodes } from '@/lib/weekly-episode-ratings';
import { topWeeklyEpisodes } from '@/lib/weekly-episodes';
import { getDictionary } from '@/lib/i18n';
export const maxDuration = 300;
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return false;
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Second step of the cron: persist the merged snapshot in a fresh request,
// after the GET invalidated the previous entry's tag.
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const slug = new URL(request.url).searchParams.get('store');
  if (!slug || !parseWeek(slug)) return Response.json({ error: 'invalid week' }, { status: 400 });
  const snapshot = await request.json().catch(() => null) as WeeklyRatings | null;
  if (!snapshot || !snapshot.titles || typeof snapshot.titles !== 'object' || Array.isArray(snapshot.titles) || !Array.isArray(snapshot.events)) return Response.json({ error: 'invalid snapshot' }, { status: 400 });
  await storeWeeklyRatingsSnapshot(slug, snapshot);
  revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
  return Response.json({ stored: true, titles: Object.keys(snapshot.titles).length });
}

export async function GET(request: Request) {
  // Public read-only mode: serve the cron-written snapshot from this same
  // bundle (unstable_cache entries are only reliably readable here). Never
  // calls rating APIs; a cold cache returns an empty snapshot.
  const episodeWeek = new URL(request.url).searchParams.get('episodes');
  if (episodeWeek !== null) {
    if (!parseWeek(episodeWeek)) return Response.json({ error: 'invalid week' }, { status: 400 });
    const snapshot = await readWeeklyRatingsSnapshot(episodeWeek);
    const episodes = snapshot.episodes ?? { entries: [], status: 'pending' as const };
    return Response.json({ ...episodes, entries: topWeeklyEpisodes(episodes.entries, episodeWeek) }, {
      headers: { 'cache-control': episodes.status === 'ready' ? 'public, max-age=60, s-maxage=300' : 'no-store' },
    });
  }
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
    const [ratings, episodes] = await Promise.allSettled([
      primeWeeklyRatings(formatWeek(week), previous),
      primeWeeklyEpisodes(formatWeek(week), previous.episodes),
    ]);
    if (ratings.status === 'rejected' && (episodes.status === 'rejected' || !episodes.value)) throw new Error('Weekly updates unavailable');
    const snapshot = ratings.status === 'fulfilled' ? ratings.value : { ...previous, total: Object.keys(previous.titles).length };
    if (episodes.status === 'fulfilled' && episodes.value) snapshot.episodes = episodes.value;
    else if (previous.episodes) snapshot.episodes = { ...previous.episodes, status: previous.episodes.entries.length ? 'partial' : 'unavailable' };
    const slug = formatWeek(week);
    const { total: _total, ...toStore } = snapshot;
    void _total;
    revalidateTag(WEEKLY_RATINGS_TAG, { expire: 0 });
    const origin = new URL(request.url).origin;
    after(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await fetch(`${origin}/api/revalidate?store=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { authorization: request.headers.get('authorization') || '', 'content-type': 'application/json' }, body: JSON.stringify(toStore),
      }).catch(() => undefined);
    });
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
