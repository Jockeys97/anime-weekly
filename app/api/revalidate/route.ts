import { repairLegacyImdbRatingIndex, ensureImdbEpisodeIndex } from '@/lib/imdb-datasets';
import { readSharedImdbScore, hasImdbScore } from '@/lib/imdb';
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { CACHE_TAG } from '@/lib/config';
import { isWeeklyRatingComplete, primeWeeklyRatings, readWeeklyRatingsSnapshot, storeWeeklyRatingsSnapshot, storeRatingsStore, readRatingsStore, WEEKLY_PAGE_TAG, WEEKLY_RATINGS_TAG, type WeeklyRatings, type RatingsStore } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek, parseWeek, shiftWeek, type ISOWeek } from '@/lib/week';
import { isClosedWeek, writeWeekArchive } from '@/lib/week-archive';
import { primeWeeklyEpisodes } from '@/lib/weekly-episode-ratings';
import { topWeeklyEpisodes, needsEpisodeRepair, japanDate, EPISODE_COLLECTOR_VERSION, type WeeklyEpisodes } from '@/lib/weekly-episodes';
import { getDictionary } from '@/lib/i18n';
import { PROVIDER_MAX_AGE, validProviderSnapshot } from '@/lib/provider-snapshot';
import { readImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { validImdbId } from '@/lib/episode-chart';
export const maxDuration = 300;
// Runtime Cache is regional: collector and shared read endpoints use one region.
export const preferredRegion = 'iad1';
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
  if (new URL(request.url).searchParams.has('archive')) {
    const snapshot: unknown = await request.json().catch(() => null);
    if (!validArchiveRatings(snapshot)) return Response.json({ error: 'invalid snapshot' }, { status: 400 });
    return archiveResponse(request, snapshot);
  }
  const slug = new URL(request.url).searchParams.get('store');
  if (!slug || !parseWeek(slug)) return Response.json({ error: 'invalid week' }, { status: 400 });
  const body = await request.json().catch(() => null) as (WeeklyRatings & { snapshot?: WeeklyRatings; store?: RatingsStore }) | null;
  const snapshot = body?.snapshot ?? body;
  if (!snapshot || !snapshot.titles || typeof snapshot.titles !== 'object' || Array.isArray(snapshot.titles) || !Array.isArray(snapshot.events)) return Response.json({ error: 'invalid snapshot' }, { status: 400 });
  if (snapshot.availability !== undefined && !validProviderSnapshot(snapshot.availability)) return Response.json({ error: 'invalid availability' }, { status: 400 });
  const store = body?.store;
  if (store !== undefined && !validStore(store)) return Response.json({ error: 'invalid store' }, { status: 400 });
  await storeWeeklyRatingsSnapshot(slug, snapshot);
  if (store) await storeRatingsStore(store);
  revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
  return Response.json({ stored: true, titles: Object.keys(snapshot.titles).length });
}

function validArchiveRatings(value: unknown): value is WeeklyRatings {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as WeeklyRatings;
  return Boolean(snapshot.titles && typeof snapshot.titles === 'object' && !Array.isArray(snapshot.titles))
    && Array.isArray(snapshot.events)
    && (snapshot.availability === undefined || validProviderSnapshot(snapshot.availability));
}

async function archiveResponse(request: Request, capturedRatings?: WeeklyRatings) {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const archive = new URL(request.url).searchParams.get('archive')!;
  const week = parseWeek(archive);
  if (!week || !isClosedWeek(week)) return Response.json({ error: 'archive requires a closed ISO week' }, { status: 400 });
  const write = () => capturedRatings ? writeWeekArchive(week, capturedRatings) : writeWeekArchive(week);
  if (new URL(request.url).searchParams.get('background') === '1') {
    // Acknowledge dispatch immediately; the archive now has its own function
    // budget even if the calling daily cron is near its deadline.
    after(async () => { await write(); });
    return Response.json({ week: archive, status: 'scheduled' }, { status: 202, headers: { 'cache-control': 'no-store' } });
  }
  const result = await write();
  return Response.json(result, { status: result.status === 'failed' ? 503 : 200, headers: { 'cache-control': 'no-store' } });
}

function validStore(store: RatingsStore): boolean {
  const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  if (!record(store) || !record(store.ratings) || !record(store.sources)) return false;
  if (store.availability !== undefined && !validProviderSnapshot(store.availability, true)) return false;
  const timestamps = (entry: Record<string, unknown>) => typeof entry.fetchedAt === 'number' && Number.isFinite(entry.fetchedAt) && typeof entry.lastSeenAt === 'number' && Number.isFinite(entry.lastSeenAt);
  return Object.entries(store.ratings).every(([key, entry]) => /^(imdb:tt\d+|anilist:[1-9]\d*|mal:[1-9]\d*)$/.test(key) && record(entry) && timestamps(entry) && record(entry.values))
    && Object.entries(store.sources).every(([key, entry]) => /^(tv|movie):[1-9]\d*$/.test(key) && record(entry) && timestamps(entry));
}

// Use a fresh invocation after the daily collectors: they can consume nearly
// the full 300-second budget. No Blob token means no additional request.
async function archiveLastClosedWeek(request: Request, closedWeek: ISOWeek, capturedRatings: WeeklyRatings) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) return;
  const url = new URL(request.url);
  url.search = new URLSearchParams({ archive: formatWeek(closedWeek), background: '1' }).toString();
  try {
    const response = await fetch(url, {
      method: 'POST', body: JSON.stringify(capturedRatings),
      headers: { authorization: request.headers.get('authorization') || '', 'content-type': 'application/json' },
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.error('[week-archive] cron archive request failed', response.status);
  } catch (error) { console.error('[week-archive] cron archive request failed', error); }
}

export async function GET(request: Request) {
  const archive = new URL(request.url).searchParams.get('archive');
  if (archive !== null) {
    // Handle before all public read modes, even if their parameters coexist.
    return archiveResponse(request);
  }
  // Public read-only mode: serve the cron-written snapshot from this same
  // bundle (unstable_cache entries are only reliably readable here). Never
  // calls rating APIs; a cold cache returns an empty snapshot.
  const chart = new URL(request.url).searchParams.get('episodeChart');
  if (chart !== null) {
    if (!validImdbId(chart)) return Response.json({ error: 'invalid IMDb series ID' }, { status: 400 });
    const result = await readImdbEpisodeChart(chart);
    return Response.json({ ...result, seriesId: chart }, { headers: { 'cache-control': result.status === 'ready' ? 'public, max-age=60, s-maxage=300' : 'no-store' } });
  }
  const imdb = new URL(request.url).searchParams.get('imdb');
  if (imdb !== null) {
    if (!/^tt\d+$/.test(imdb) || imdb.length > 32) return Response.json({ error: 'invalid IMDb ID' }, { status: 400 });
    const rating = await readSharedImdbScore(imdb);
    return Response.json(rating, { headers: { 'cache-control': hasImdbScore(rating) ? 'public, max-age=60, s-maxage=300' : 'no-store' } });
  }
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
  const week = isoWeek(new Date());
  // The global ratings tag below also expires last week's entry. Capture it
  // first, then deliver it to the archive invocation after the current work.
  const closedRatings = process.env.BLOB_READ_WRITE_TOKEN?.trim()
    ? await readWeeklyRatingsSnapshot(formatWeek(shiftWeek(week, -1))).catch(() => ({ titles: {}, events: [] }))
    : { titles: {}, events: [] };
  const previous = await readWeeklyRatingsSnapshot(formatWeek(week));
  const providersReady = Boolean(previous.availability && [...new Set([...Object.keys(previous.titles), ...Object.keys(previous.names ?? {})])].every(key => {
    const entry = previous.availability!.titles[key];
    return entry && Date.now() - entry.fetchedAt < PROVIDER_MAX_AGE;
  }));
  if (providersReady && previous.episodes?.collectorVersion === EPISODE_COLLECTOR_VERSION && previous.episodes.updatedAt && Number.isFinite(Date.parse(previous.episodes.updatedAt)) && japanDate(new Date(previous.episodes.updatedAt)) === japanDate()) {
    const indexReady = await repairLegacyImdbRatingIndex();
    const episodeIndexReady = await ensureImdbEpisodeIndex().catch(() => false);
    console.info('[imdb-index] daily indexes verified', { ready: indexReady, episodeIndexReady });
    if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) after(() => archiveLastClosedWeek(request, shiftWeek(week, -1), closedRatings));
    return Response.json({ revalidated: true, cached: true, indexReady, episodeIndexReady, week: formatWeek(week), episodeStatus: previous.episodes.status, episodeCoverage: previous.episodes.coverage, episodeReason: previous.episodes.reason });
  }
  revalidateTag(CACHE_TAG, { expire: 0 });
  let total = 0;
  let complete = false;
  let populated = 0;
  let unavailable = 0;
  let storeHits = 0;
  let episodeSnapshot: WeeklyEpisodes | undefined;
  try {
    const [ratings, episodes] = await Promise.allSettled([
      // Repair a pre-fix episode snapshot once without warming series scores again.
      providersReady && needsEpisodeRepair(previous.episodes)
        ? Promise.resolve({ ...previous, total: Object.keys(previous.titles).length, store: await readRatingsStore(), storeHits: 0 })
        : primeWeeklyRatings(formatWeek(week), previous),
      primeWeeklyEpisodes(formatWeek(week), previous.episodes),
    ]);
    if (ratings.status === 'rejected' && (episodes.status === 'rejected' || !episodes.value)) throw new Error('Weekly updates unavailable');
    const snapshot = ratings.status === 'fulfilled' ? ratings.value : { ...previous, total: Object.keys(previous.titles).length, store: await readRatingsStore(), storeHits: 0 };
    if (episodes.status === 'fulfilled' && episodes.value) snapshot.episodes = episodes.value;
    else if (previous.episodes) snapshot.episodes = { ...previous.episodes, status: previous.episodes.entries.length ? 'partial' : 'unavailable' };
    episodeSnapshot = snapshot.episodes;
    const slug = formatWeek(week);
    const { total: _total, store, storeHits: hits, ...toStore } = snapshot;
    void _total;
    storeHits = hits;
    revalidateTag(WEEKLY_RATINGS_TAG, { expire: 0 });
    const origin = new URL(request.url).origin;
    after(async () => {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await fetch(`${origin}/api/revalidate?store=${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { authorization: request.headers.get('authorization') || '', 'content-type': 'application/json' }, body: JSON.stringify({ snapshot: toStore, store }),
      }).catch(() => undefined);
      await archiveLastClosedWeek(request, shiftWeek(week, -1), closedRatings);
    });
    total = snapshot.total;
    complete = Object.keys(snapshot.titles).length >= total && Object.values(snapshot.titles).every(isWeeklyRatingComplete);
    populated = Object.values(snapshot.titles).filter(ratings => ratings.imdbRating || ratings.anilistScore != null || ratings.malScore != null).length;
    unavailable = Math.max(0, total - populated);
  } catch {
    // Still refresh discovery/page paths if optional rating services fail.
    // Failed loaders never replace a successful snapshot with an error.
    unavailable = 1;
    if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) after(() => archiveLastClosedWeek(request, shiftWeek(week, -1), closedRatings));
  }
  // The ratings snapshot has its own tag: discovery invalidation must never
  // delete the values just computed by this job.
  revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
  const episodeIndexReady = await ensureImdbEpisodeIndex().catch(() => false);
  console.info('[episode-chart] daily index checked', { ready: episodeIndexReady });
  return Response.json({ revalidated: true, week: formatWeek(week), total, populated, unavailable, complete, storeHits, episodeIndexReady, episodeStatus: episodeSnapshot?.status, episodeCoverage: episodeSnapshot?.coverage, episodeReason: episodeSnapshot?.reason });
}
