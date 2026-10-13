export interface EpisodeDate { seriesId: number; season: number; episode: number; date: string }
export interface EpisodeDetails { seasons?: { season_number?: number; air_date?: string | null }[]; last_episode_to_air?: unknown; next_episode_to_air?: unknown }
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function selectEpisodeSeasons(seasons: EpisodeDetails['seasons'], end: string): number[] {
  if (!Array.isArray(seasons)) return [];
  // Include undated announced seasons as well as the most recently started ones.
  // The response must still contain an actual episode date inside the chosen week.
  return [...new Set(seasons.filter(season => Number.isSafeInteger(season?.season_number) && season.season_number! >= 0 && (!validDate(season.air_date) || season.air_date <= end))
    .sort((a, b) => b.season_number! - a.season_number!).map(season => season.season_number!))].slice(0, 3);
}
export function readEpisodeDates(seriesId: number, values: unknown, start: string, end: string): EpisodeDate[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const episode = value as { season_number?: number; episode_number?: number; air_date?: unknown; show_id?: number };
    if (episode.show_id != null && episode.show_id !== seriesId) return [];
    if (!Number.isSafeInteger(episode.season_number) || episode.season_number! < 0 || !Number.isSafeInteger(episode.episode_number) || episode.episode_number! <= 0
      || !validDate(episode.air_date) || episode.air_date < start || episode.air_date > end) return [];
    return [{ seriesId, season: episode.season_number!, episode: episode.episode_number!, date: episode.air_date }];
  });
}
