import type { WeeklyRatings } from '@/lib/weekly-ratings';
import { topWeeklyEpisodes } from '@/lib/weekly-episodes';
export function snapshotTopFive(snapshot: WeeklyRatings, slug: string) {
  return topWeeklyEpisodes(snapshot.episodes?.entries ?? [], slug).map(episode => ({ ...episode, key: episode.imdbId, name: `${episode.seriesName} · S${episode.season} E${episode.episode}` }));
}
