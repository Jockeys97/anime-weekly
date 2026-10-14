import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';
import { getWeeklySource, getWeeklyRelated, getWeeklyProviders, getTMDBWeekEpisodes } from '@/lib/tmdb';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import type { WeeklyTitleDetails, WeeklySchedule } from '@/lib/weekly-details';
class PartialDetails extends Error { constructor(readonly result: WeeklyTitleDetails) { super('Weekly enrichment incomplete'); } }
const cachedTitle = unstable_cache(async (week: string, kind: 'tv' | 'movie', id: number): Promise<WeeklyTitleDetails | null> => {
  const raw = await getWeeklySource(parseWeek(week)!, kind, id);
  if (!raw) return null;
  // This endpoint only enriches streaming/recommendations. Ratings and detail
  // IDs arrive in the static catalog from the cron snapshot, never from clients.
  const [recommendation, watch] = await withTimeout(Promise.all([
    getWeeklyRelated(kind, id), getWeeklyProviders(kind, id),
  ]), 18000);
  const result: WeeklyTitleDetails = { id, kind, recommendation, ...watch };
  if (watch.providersUnavailable) throw new PartialDetails(result);
  return result;
}, ['weekly-title-watch-v2'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
export async function getWeeklyTitleDetails(week: string, kind: 'tv' | 'movie', id: number): Promise<WeeklyTitleDetails | null> {
  try { return await cachedTitle(week, kind, id); }
  catch (error) { if (error instanceof PartialDetails) return error.result; throw error; }
}
class PartialSchedule extends Error { constructor(readonly result: WeeklySchedule) { super('Weekly schedule incomplete'); } }
const cachedEpisodes = unstable_cache(async (week: string, id: number) => {
  const tmdb = await withTimeout(getTMDBWeekEpisodes(id, parseWeek(week)!), 14000);
  const result = { events: [], episodeDates: tmdb.episodes, unavailable: tmdb.unavailable };
  if (result.unavailable) throw new PartialSchedule(result);
  return result;
}, ['weekly-title-episodes-v2'], { revalidate: 3600, tags: [CACHE_TAG] });
export async function getWeeklyTitleSchedule(week: string, kind: 'tv' | 'movie', id: number): Promise<WeeklySchedule | null> {
  if (kind === 'movie') return { events: [], episodeDates: [], unavailable: false };
  if (!await getWeeklySource(parseWeek(week)!, kind, id)) return null;
  const snapshot = await getWeeklyRatings(week);
  const anilistId = snapshot.titles[`${kind}:${id}`]?.anilistId;
  const events = snapshot.events.filter(event => event.mediaId === anilistId);
  if (events.length) return { events, episodeDates: [], unavailable: false };
  // Preserve real episode dates for titles with no AniList broadcast schedule.
  // Do not cache a cold ratings snapshot inside the hourly schedule cache.
  try { return await cachedEpisodes(week, id); }
  catch (error) { if (error instanceof PartialSchedule) return error.result; throw error; }
}
