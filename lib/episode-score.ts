import 'server-only';
import type { DetailAvailability } from '@/lib/detail-availability';
import type { AiringEvent } from '@/lib/airing-schedule';
import { getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '@/lib/tmdb';
import { isoWeek } from '@/lib/week';
import { japanDate } from '@/lib/weekly-episodes';
import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { withTimeout } from '@/lib/async-timeout';

// AniList episode N is not necessarily IMDb S1E<N>. Resolve the unique real
// TMDB episode on the Japanese airing date, then verify both IMDb identities.
export async function getEpisodeIndexedScore(watch: DetailAvailability, event: AiringEvent) {
  const series = watch.episodeSeries?.imdbId || watch.ratings.imdbId;
  if (!series || watch.match?.kind !== 'tv' || event.airingAt * 1000 > Date.now()) return null;
  return withTimeout((async () => {
    const chart = await getImdbEpisodeChart(series);
    if (chart.status !== 'ready' || !chart.episodes.length) return null;
    const day = japanDate(new Date(event.airingAt * 1000));
    const dates = await getTMDBWeekEpisodes(watch.match!.id, isoWeek(new Date(`${day}T12:00:00Z`)));
    const matches = dates.episodes.filter(e => e.date === day);
    if (dates.unavailable || matches.length !== 1) return null;
    const identity = await getTMDBEpisodeIdentity(matches[0]);
    if (identity?.seriesImdbId !== series) return null;
    return chart.episodes.find(e => e.imdbId === identity.imdbId) ?? null;
  })(), 5000).catch(() => null);
}
