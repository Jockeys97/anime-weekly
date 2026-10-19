import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';
import { getQuickWeekData, getWeeklySource, getWeeklyRelated, getTMDBWeekEpisodes, type WeekData } from '@/lib/tmdb';
import { expandAvailability } from '@/lib/provider-snapshot';
import { getWeeklyRatings, type WeeklyRatings } from '@/lib/weekly-ratings';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import type { WeeklyTitleDetails, WeeklySchedule, WeeklyCalendarSchedule } from '@/lib/weekly-details';
import { buildWeeklyCalendar } from '@/lib/weekly-calendar';
const cachedTitle = unstable_cache(async (week: string, kind: 'tv' | 'movie', id: number): Promise<WeeklyTitleDetails | null> => {
  const raw = await getWeeklySource(parseWeek(week)!, kind, id);
  if (!raw) return null;
  // Only recommendations need live TMDB data. Providers and ratings use cron
  // snapshots, including when an older browser calls this enrichment endpoint.
  const [recommendation, snapshot] = await withTimeout(Promise.all([
    getWeeklyRelated(kind, id), getWeeklyRatings(week),
  ]), 18000);
  const result: WeeklyTitleDetails = { id, kind, recommendation, providers: expandAvailability(snapshot.availability, `${kind}:${id}`), providersUnavailable: false };
  return result;
}, ['weekly-title-watch-v3-snapshot'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
export async function getWeeklyTitleDetails(week: string, kind: 'tv' | 'movie', id: number): Promise<WeeklyTitleDetails | null> {
  return cachedTitle(week, kind, id);
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

// Resolve the whole calendar without waiting for viewport-based watch lookups
// or a successful ratings cron. Cached TMDB episode dates remain available
// when the AniList snapshot is cold; no rating provider is called here.
export async function getWeeklyCalendarSchedule(slug: string, sources?: { catalog: WeekData; snapshot: WeeklyRatings }): Promise<WeeklyCalendarSchedule> {
  const deadline = Date.now() + 23000;
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const [catalog, snapshot] = sources ? [sources.catalog, sources.snapshot]
    : await withTimeout(Promise.all([getQuickWeekData(week, 'en'), getWeeklyRatings(slug)]), 10000);
  if (catalog.status !== 'ready') throw new Error('Weekly source unavailable');
  const anilistIds: Record<string, number> = {};
  const titles = catalog.titles.map(title => {
    const key = `${title.kind}:${title.id}`;
    const id = snapshot.titles[key]?.anilistId;
    if (title.kind === 'tv' && Number.isSafeInteger(id) && id! > 0) anilistIds[key] = id!;
    return { ...title, ratings: snapshot.titles[key] ?? title.ratings };
  });
  const ids = new Set(Object.values(anilistIds));
  const result: WeeklyCalendarSchedule = {
    anilistIds, events: snapshot.events.filter(event => ids.has(event.mediaId)), episodeDates: [], unavailable: Boolean(catalog.partial),
  };
  // Check all timezone edges: a cached event outside Rome can still fall in
  // this week for another visitor, who needs the TMDB date fallback as well.
  const zones = ['UTC', 'Pacific/Kiritimati', 'Etc/GMT+12'];
  const missing = new Map(zones.flatMap(zone => buildWeeklyCalendar(titles, result.events, week, [], zone).undated)
    .filter(title => title.kind === 'tv').map(title => [title.id, title]));
  const pending = [...missing.values()];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) {
      const title = pending[cursor++];
      const remaining = deadline - Date.now();
      if (remaining <= 0) { result.unavailable = true; break; }
      try {
        const schedule = await withTimeout(cachedEpisodes(slug, title.id), remaining);
        result.episodeDates.push(...schedule.episodeDates);
        result.unavailable ||= schedule.unavailable;
      } catch (error) {
        if (error instanceof PartialSchedule) result.episodeDates.push(...error.result.episodeDates);
        result.unavailable = true;
      }
    }
  }));
  return result;
}
