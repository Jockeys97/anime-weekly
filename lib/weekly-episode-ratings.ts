import 'server-only';
import { getQuickWeekData, getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '@/lib/tmdb';
import { EpisodeLookupError, primeImdbEpisode } from '@/lib/imdb-episodes';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import { displayTitle } from '@/lib/title-text';
import { japanDate, EPISODE_COLLECTOR_VERSION, type WeeklyEpisodes } from '@/lib/weekly-episodes';

// Runs alongside the series-rating cron, with its own bounded budget. Public
// readers only read the stored snapshot and never call OMDb.
export async function primeWeeklyEpisodes(slug: string, previous?: WeeklyEpisodes): Promise<WeeklyEpisodes> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const deadline = Date.now() + 110000;
  const today = japanDate();
  // A successful, partial or failed daily run is still a completed attempt:
  // manual repeats read it until tomorrow rather than consuming more quota.
  if (previous?.collectorVersion === EPISODE_COLLECTOR_VERSION && previous.updatedAt && Number.isFinite(Date.parse(previous.updatedAt)) && japanDate(new Date(previous.updatedAt)) === today) return previous;
  const ratingLookups = new Map<string, ReturnType<typeof primeImdbEpisode>>();
  const maxRatingLookups = 30; // Up to two HTTP calls each: at most 60 per day.
  const coverage = { eligible: 0, matched: 0, rated: 0, unrated: 0, failed: 0 };
  let reason: WeeklyEpisodes['reason'];
  let catalog: Awaited<ReturnType<typeof getQuickWeekData>>;
  try {
    catalog = await withTimeout(getQuickWeekData(week, 'en'), 10000);
    if (catalog.status !== 'ready') throw new Error('Weekly source unavailable');
  } catch {
    // A discovery outage is also a completed daily attempt; don't repeatedly
    // warm unrelated scores or erase previously confirmed episode ratings.
    return { entries: previous?.entries ?? [], status: previous?.entries.length ? 'partial' : 'unavailable', reason: 'metadata', updatedAt: new Date().toISOString(), collectorVersion: EPISODE_COLLECTOR_VERSION, coverage };
  }
  const entries = new Map((previous?.entries ?? []).map(entry => [entry.imdbId, entry]));
  const sources = catalog.titles.filter(title => title.kind === 'tv');
  let index = 0, failed = Boolean(catalog.partial), vendorBlocked = false;
  await Promise.all(Array.from({ length: Math.min(3, sources.length) }, async () => {
    while (index < sources.length && !vendorBlocked) {
      const title = sources[index++];
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) { failed = true; break; }
        const dates = await withTimeout(getTMDBWeekEpisodes(title.id, week), Math.min(15000, remaining));
        if (dates.unavailable) { failed = true; reason ??= 'metadata'; }
        for (const date of dates.episodes) {
          if (date.date > today || vendorBlocked) continue;
          coverage.eligible++;
          const remaining = deadline - Date.now();
          if (remaining <= 0) { failed = true; break; }
          const identity = await withTimeout(getTMDBEpisodeIdentity(date), Math.min(13000, remaining));
          if (!identity) continue;
          coverage.matched++;
          let lookup = ratingLookups.get(identity.imdbId);
          if (!lookup) {
            if (ratingLookups.size >= maxRatingLookups) { failed = true; vendorBlocked = true; break; }
            if (Date.now() >= deadline) { failed = true; break; }
            lookup = primeImdbEpisode(identity.imdbId, identity.seriesImdbId, today, { season: date.season, episode: date.episode });
            ratingLookups.set(identity.imdbId, lookup);
          }
          const rating = await withTimeout(lookup, Math.max(1, Math.min(11000, deadline - Date.now())));
          if (rating) coverage.rated++; else coverage.unrated++;
          if (rating) entries.set(identity.imdbId, { ...rating, imdbId: identity.imdbId, seriesId: title.id, seriesName: displayTitle(title.name), poster: title.poster, date: date.date });
        }
      } catch (error) {
        failed = true; coverage.failed++;
        if (error instanceof EpisodeLookupError) {
          if (error.reason === 'quota' || error.reason === 'authentication') { reason = error.reason; vendorBlocked = true; }
          else if (reason !== 'quota' && reason !== 'authentication') reason = 'source';
        } else reason ??= 'metadata';
      }
    }
  }));
  return { entries: [...entries.values()], status: failed ? entries.size ? 'partial' : 'unavailable' : 'ready', updatedAt: new Date().toISOString(), collectorVersion: EPISODE_COLLECTOR_VERSION, coverage, ...(failed && reason ? { reason } : {}) };
}
