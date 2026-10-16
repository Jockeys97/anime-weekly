export interface ChartEpisode { imdbId: string; season: number; episode: number; score: number; votes: number }
export interface EpisodeChartData {
  status: 'ready' | 'unavailable';
  episodes: ChartEpisode[];
  updatedAt?: string;
  dataUpdatedAt?: string;
  reason?: 'cache-error';
}
export interface ChartSeason { number: number; episodes: ChartEpisode[]; average: number; votes: number }
export const validImdbId = (id: unknown): id is string => typeof id === 'string' && /^tt\d{1,20}$/.test(id);
export function validChartEpisode(value: unknown): value is ChartEpisode {
  if (!value || typeof value !== 'object') return false;
  const item = value as ChartEpisode;
  return validImdbId(item.imdbId) && Number.isSafeInteger(item.season) && item.season >= 0 && item.season <= 10000
    && Number.isSafeInteger(item.episode) && item.episode > 0 && item.episode <= 100000
    && Number.isFinite(item.score) && item.score > 0 && item.score <= 10
    && Number.isSafeInteger(item.votes) && item.votes > 0;
}

// Never merge two different IMDb identities at the same season/episode slot.
export function chartSeasons(episodes: readonly ChartEpisode[]): ChartSeason[] {
  const slots = new Map<string, ChartEpisode>();
  const ambiguous = new Set<string>();
  const identities = new Map<string, string>();
  for (const episode of episodes) {
    if (!validChartEpisode(episode)) continue;
    const key = `${episode.season}:${episode.episode}`;
    const position = identities.get(episode.imdbId);
    if (position && position !== key) { ambiguous.add(position); ambiguous.add(key); }
    identities.set(episode.imdbId, key);
    const previous = slots.get(key);
    if (previous && previous.imdbId !== episode.imdbId) ambiguous.add(key);
    if (!previous || episode.votes > previous.votes) slots.set(key, episode);
  }
  const seasons = new Map<number, ChartEpisode[]>();
  for (const [key, episode] of slots) {
    if (ambiguous.has(key)) continue;
    const season = seasons.get(episode.season) ?? [];
    season.push(episode);
    seasons.set(episode.season, season);
  }
  return [...seasons].sort(([a], [b]) => a - b).map(([number, entries]) => ({
    number, episodes: entries.sort((a, b) => a.episode - b.episode),
    average: entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length,
    votes: entries.reduce((sum, entry) => sum + entry.votes, 0),
  }));
}
