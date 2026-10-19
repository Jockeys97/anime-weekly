import 'server-only';
import { BlobNotFoundError, get, head, list, put } from '@vercel/blob';
import { revalidateTag, unstable_cache } from 'next/cache';
import { getQuickWeekData, type WeekData } from '@/lib/tmdb';
import { getWeeklyRatings, WEEKLY_PAGE_TAG, type WeeklyRatings } from '@/lib/weekly-ratings';
import { readRatingsStore } from '@/lib/ratings-store';
import { getWeeklyCalendarSchedule } from '@/lib/weekly-enrichment';
import type { WeeklyCalendarSchedule } from '@/lib/weekly-details';
import { formatWeek, isoWeek, parseWeek, type ISOWeek } from '@/lib/week';

export const WEEK_ARCHIVE_TAG = 'week-archive';
export const WEEK_ARCHIVE_LIST_TAG = 'week-archive-list';
const DAY = 86400;
export interface WeekArchive {
  version: 1;
  week: string;
  language: 'en';
  savedAt: string;
  titleCount: number;
  data: WeekData;
  ratings: WeeklyRatings;
  calendar: WeeklyCalendarSchedule;
}
export interface ArchivedWeek { week: string; titleCount: number; uploadedAt: string }

export function isClosedWeek(week: ISOWeek, now = new Date()): boolean {
  const slug = formatWeek(week);
  return Boolean(parseWeek(slug)) && slug < formatWeek(isoWeek(now));
}
const archiveKey = (slug: string) => `weeks/${slug}.json`;
const archiveTag = (slug: string) => `${WEEK_ARCHIVE_TAG}:${slug}`;
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());

// Reject incompatible/empty files before they can enter HTML or the sitemap.
function validArchive(value: unknown, slug: string): value is WeekArchive {
  if (!value || typeof value !== 'object') return false;
  const archive = value as WeekArchive;
  return archive.version === 1 && archive.week === slug && archive.language === 'en'
    && Number.isFinite(Date.parse(archive.savedAt))
    && Number.isSafeInteger(archive.titleCount) && archive.titleCount > 0
    && archive.data?.status === 'ready' && Array.isArray(archive.data.titles)
    && archive.data.titles.length === archive.titleCount
    && Boolean(archive.ratings?.titles) && !Array.isArray(archive.ratings.titles)
    && Array.isArray(archive.ratings.events)
    && Array.isArray(archive.calendar?.events) && Array.isArray(archive.calendar.episodeDates)
    && Boolean(archive.calendar.anilistIds) && typeof archive.calendar.unavailable === 'boolean';
}

export async function readWeekArchive(week: ISOWeek): Promise<WeekArchive | null> {
  if (!configured() || !isClosedWeek(week)) return null;
  const slug = formatWeek(week);
  try {
    return await unstable_cache(async () => {
      const result = await get(archiveKey(slug), { access: 'private', abortSignal: AbortSignal.timeout(10000) });
      if (!result || result.statusCode !== 200) return null;
      const payload: unknown = await new Response(result.stream).json();
      return validArchive(payload, slug) ? payload : null;
    }, ['week-archive-v1', slug], { revalidate: 7 * DAY, tags: [WEEK_ARCHIVE_TAG, archiveTag(slug)] })();
  } catch (error) {
    // Catch outside the cache: transient Blob errors must not cache a miss.
    console.error('[week-archive] read failed', slug, error);
    return null;
  }
}

export type ArchiveWriteResult = { week: string; status: 'disabled' | 'exists' | 'empty' | 'written' | 'failed'; titleCount?: number };
export async function writeWeekArchive(week: ISOWeek, capturedRatings?: WeeklyRatings): Promise<ArchiveWriteResult> {
  if (!isClosedWeek(week)) throw new RangeError('Only closed ISO weeks can be archived');
  const slug = formatWeek(week);
  if (!configured()) return { week: slug, status: 'disabled' };
  try {
    try {
      await head(archiveKey(slug), { abortSignal: AbortSignal.timeout(10000) });
      return { week: slug, status: 'exists' };
    } catch (error) {
      // Permission/network errors are not evidence that the archive is absent.
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
    const [data, savedRatings, store] = await Promise.all([
      getQuickWeekData(week, 'en'), capturedRatings ?? getWeeklyRatings(slug), readRatingsStore(),
    ]);
    if (data.status !== 'ready' || !data.titles.length) return { week: slug, status: 'empty' };
    // Do not permanently freeze a failed discovery request's partial catalog.
    if (data.partial) throw new Error('Incomplete weekly catalog');
    // A manual backfill may outlive the weekly cache. Fill gaps from the
    // existing cross-week store, retaining the closed week's exact values.
    const ratings: WeeklyRatings = { ...savedRatings, titles: { ...savedRatings.titles } };
    if (store.availability || ratings.availability) ratings.availability = {
      titles: { ...ratings.availability?.titles },
      providers: { ...store.availability?.providers, ...ratings.availability?.providers },
    };
    for (const title of data.titles) {
      const key = `${title.kind}:${title.id}`;
      const source = store.sources[key];
      const identity = source ? { imdbId: source.imdbId, anilistId: source.anilistId, malId: source.malId } : {};
      const fallback = { ...title.ratings, ...identity,
        ...store.ratings[`imdb:${source?.imdbId}`]?.values,
        ...store.ratings[`anilist:${source?.anilistId}`]?.values,
        ...store.ratings[`mal:${source?.malId}`]?.values,
      };
      ratings.titles[key] = { ...fallback, ...ratings.titles[key] };
      const availability = store.availability?.titles[key];
      if (ratings.availability && !ratings.availability.titles[key] && availability) {
        ratings.availability.titles[key] = { countries: availability.countries, fetchedAt: availability.fetchedAt };
      }
    }
    const calendar = await getWeeklyCalendarSchedule(slug, { catalog: data, snapshot: ratings });
    const payload: WeekArchive = { version: 1, week: slug, language: 'en', savedAt: new Date().toISOString(), titleCount: data.titles.length, data, ratings, calendar };
    await put(archiveKey(slug), JSON.stringify(payload), {
      access: 'private', addRandomSuffix: false, allowOverwrite: false,
      contentType: 'application/json', abortSignal: AbortSignal.timeout(15000),
    });
    revalidateTag(archiveTag(slug), { expire: 0 });
    revalidateTag(WEEK_ARCHIVE_LIST_TAG, { expire: 0 });
    revalidateTag(WEEKLY_PAGE_TAG, { expire: 0 });
    return { week: slug, status: 'written', titleCount: payload.titleCount };
  } catch (error) {
    console.error('[week-archive] write failed', slug, error);
    return { week: slug, status: 'failed' };
  }
}

const cachedArchivedWeeks = unstable_cache(async (): Promise<ArchivedWeek[]> => {
  const weeks: ArchivedWeek[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: 'weeks/', limit: 1000, cursor, abortSignal: AbortSignal.timeout(10000) });
    // Read through the seven-day cache, never fetch every payload on each crawl.
    // Listing metadata alone cannot prove a JSON file has a non-empty catalog.
    for (const blob of page.blobs) {
      const slug = /^weeks\/(\d{4}-\d{2})\.json$/.exec(blob.pathname)?.[1];
      const week = slug ? parseWeek(slug) : null;
      if (!week || !isClosedWeek(week)) continue;
      const archive = await readWeekArchive(week);
      if (archive) weeks.push({ week: archive.week, titleCount: archive.titleCount, uploadedAt: blob.uploadedAt.toISOString() });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return weeks.sort((a, b) => b.week.localeCompare(a.week));
}, ['week-archive-list-v1'], { revalidate: DAY, tags: [WEEK_ARCHIVE_LIST_TAG] });

export async function listArchivedWeeks(): Promise<ArchivedWeek[]> {
  if (!configured()) return [];
  try { return await cachedArchivedWeeks(); }
  catch (error) { console.error('[week-archive] list failed', error); return []; }
}
