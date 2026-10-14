import type { AnimeTitle } from '@/lib/tmdb';
import type { StreamingRegion } from '@/lib/config';
export interface FilterTitle { key: string; genres?: readonly string[]; providers: AnimeTitle['providers'] }
export function filterTitles<T extends FilterTitle>(titles: readonly T[], filters: { genre: string; platform: string; region: StreamingRegion; onlyWatchlist: boolean; watchlist: readonly string[] }): T[] {
  return titles.filter(title => (!filters.genre || title.genres?.includes(filters.genre))
    && (!filters.platform || title.providers[filters.region]?.providers.some(provider => String(provider.provider_id) === filters.platform))
    && (!filters.onlyWatchlist || filters.watchlist.includes(title.key)));
}
export function filterOptions(titles: readonly FilterTitle[], region: StreamingRegion) {
  return {
    genres: [...new Set(titles.flatMap(title => title.genres ?? []))].sort(),
    platforms: [...new Map(titles.flatMap(title => title.providers[region]?.providers ?? []).map(provider => [String(provider.provider_id), provider.provider_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
  };
}
