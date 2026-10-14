import 'server-only';
import { getQuickWeekData, getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '@/lib/tmdb';
import { primeImdbDatasetEpisodes } from '@/lib/imdb-datasets';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import { displayTitle } from '@/lib/title-text';
import { japanDate, topWeeklyEpisodes, EPISODE_COLLECTOR_VERSION, type WeeklyEpisode, type WeeklyEpisodes } from '@/lib/weekly-episodes';

// Public readers only read the small stored snapshot. No OMDb requests are
// used for episode ranking; the daily job streams two official IMDb datasets.
export async function primeWeeklyEpisodes(slug: string, previous?: WeeklyEpisodes): Promise<WeeklyEpisodes> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const today = japanDate();
  if (previous?.collectorVersion === EPISODE_COLLECTOR_VERSION && previous.updatedAt && Number.isFinite(Date.parse(previous.updatedAt)) && japanDate(new Date(previous.updatedAt)) === today) return previous;
  // Reserve another 45 seconds for the dataset streams, within the 110-second
  // episode collection budget, regardless of how many titles have no IDs.
  const deadline = Date.now() + 60000;
  const coverage = { eligible: 0, matched: 0, rated: 0, unrated: 0, failed: 0 };
  const entries = new Map((previous?.entries ?? []).map(entry => [entry.imdbId, entry]));
  let reason: WeeklyEpisodes['reason'];
  const finish = (failed: boolean, dataUpdatedAt: string | null | undefined = previous?.dataUpdatedAt): WeeklyEpisodes => ({
    entries: topWeeklyEpisodes([...entries.values()], slug, today), status: failed ? entries.size ? 'partial' : 'unavailable' : 'ready',
    updatedAt: new Date().toISOString(), collectorVersion: EPISODE_COLLECTOR_VERSION,
    source: 'imdb-datasets', coverage, ...(dataUpdatedAt ? { dataUpdatedAt } : {}), ...(failed && reason ? { reason } : {}),
  });
  let catalog: Awaited<ReturnType<typeof getQuickWeekData>>;
  try {
    catalog = await withTimeout(getQuickWeekData(week, 'en'), 10000);
    if (catalog.status !== 'ready') throw new Error('Weekly source unavailable');
  } catch { reason = 'metadata'; coverage.failed++; return finish(true); }
  const candidates = new Map<string, { seriesImdbId: string; entry: Omit<WeeklyEpisode, 'score' | 'votes'> }>();
  const ambiguous = new Set<string>();
  const sources = catalog.titles.filter(title => title.kind === 'tv');
  let index = 0, failed = Boolean(catalog.partial), lookups = 0;
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
    while (index < sources.length) {
      const title = sources[index++];
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0 || candidates.size >= 60 || lookups >= 120) { failed = true; reason ??= 'metadata'; break; }
        const dates = await withTimeout(getTMDBWeekEpisodes(title.id, week), Math.min(15000, remaining));
        if (dates.unavailable) { failed = true; reason ??= 'metadata'; }
        for (const date of dates.episodes) {
          if (date.date > today) continue;
          coverage.eligible++;
          const remaining = deadline - Date.now();
          if (remaining <= 0 || candidates.size >= 60 || lookups >= 120) { failed = true; reason ??= 'metadata'; break; }
          lookups++;
          const identity = await withTimeout(getTMDBEpisodeIdentity(date), Math.min(13000, remaining));
          if (!identity || ambiguous.has(identity.imdbId)) continue;
          const existing = candidates.get(identity.imdbId);
          if (existing && existing.seriesImdbId !== identity.seriesImdbId) {
            candidates.delete(identity.imdbId); entries.delete(identity.imdbId); ambiguous.add(identity.imdbId);
            failed = true; reason ??= 'metadata'; continue;
          }
          if (!existing && candidates.size >= 60) { failed = true; reason ??= 'metadata'; break; }
          if (!existing) candidates.set(identity.imdbId, {
            seriesImdbId: identity.seriesImdbId,
            entry: { imdbId: identity.imdbId, seriesId: title.id, seriesName: displayTitle(title.name), poster: title.poster,
              title: date.title ?? entries.get(identity.imdbId)?.title ?? '', season: date.season, episode: date.episode, date: date.date },
          });
        }
      } catch { failed = true; reason ??= 'metadata'; coverage.failed++; }
    }
  }));
  coverage.matched = candidates.size;
  if (candidates.size) {
    let dataset: Awaited<ReturnType<typeof primeImdbDatasetEpisodes>>;
    try { dataset = await primeImdbDatasetEpisodes([...candidates].map(([imdbId, candidate]) => ({ imdbId, seriesImdbId: candidate.seriesImdbId })), today); }
    catch { reason = 'source'; coverage.failed += candidates.size; return finish(true); }
    if (dataset.status === 'unavailable') { reason = 'source'; coverage.failed += candidates.size; return finish(true); }
    for (const [id, candidate] of candidates) {
      const rating = dataset.ratings[id];
      if (!rating) { coverage.unrated++; entries.delete(id); continue; }
      coverage.rated++;
      entries.set(id, { ...candidate.entry, ...rating, source: 'imdb-datasets' });
    }
    return finish(failed, dataset.dataUpdatedAt ?? null);
  }
  return finish(failed);
}
