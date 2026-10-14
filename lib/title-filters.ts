import type { AnimeTitle, Provider } from '@/lib/tmdb';
import type { StreamingRegion } from '@/lib/config';
export interface FilterTitle { key: string; genres?: readonly string[]; providers: AnimeTitle['providers'] }
export const POPULAR_PLATFORMS: [string, string][] = [['netflix', 'Netflix'], ['prime-video', 'Prime Video']];
export function providerPlatform(provider: Provider): [string, string] {
  const name = provider.provider_name.trim().replace(/\s+/g, ' ').toLowerCase();
  if (/^netflix(?: standard with ads| with ads)?$/.test(name)) return ['netflix', 'Netflix'];
  if (/^(?:amazon )?prime video(?: with ads)?$/.test(name)) return ['prime-video', 'Prime Video'];
  // Additional Amazon channels remain separate subscriptions/platforms.
  return [String(provider.provider_id), provider.provider_name];
}
export function filterTitles<T extends FilterTitle>(titles: readonly T[], filters: { genre: string; platform: string; region: StreamingRegion; onlyWatchlist: boolean; watchlist: readonly string[] }): T[] {
  return titles.filter(title => (!filters.genre || title.genres?.includes(filters.genre))
    && (!filters.platform || title.providers[filters.region]?.providers.some(provider => providerPlatform(provider)[0] === filters.platform || String(provider.provider_id) === filters.platform))
    && (!filters.onlyWatchlist || filters.watchlist.includes(title.key)));
}
export function filterOptions(titles: readonly FilterTitle[], region: StreamingRegion, selectedPlatform = '') {
  const platforms = new Map(titles.flatMap(title => title.providers[region]?.providers ?? []).map(providerPlatform));
  // Retain the selected service's label when changing country, even if that
  // country has no matching offers. Filtering still uses the selected region.
  if (selectedPlatform && !platforms.has(selectedPlatform)) {
    const previous = titles.flatMap(title => Object.values(title.providers).flatMap(value => value?.providers ?? []))
      .map(providerPlatform).find(([id]) => id === selectedPlatform);
    if (previous) platforms.set(...previous);
  }
  return {
    genres: [...new Set(titles.flatMap(title => title.genres ?? []))].sort(),
    platforms: [...platforms.entries()].sort((a, b) => a[1].localeCompare(b[1])),
  };
}
