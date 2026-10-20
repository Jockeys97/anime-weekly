import { parseWatchlist } from '@/lib/watchlist';

export interface FavoriteItem {
  id: string;
  name: string;
  poster: string | null;
  /** Path without locale prefix. */
  href: string;
  status?: 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  next?: { episode: number; airingAt: number };
}
export const MAX_FAVORITES = 200;

/** Validated, de-duplicated, order-stable ids for the favourites request. */
export function favoriteIds(value: string | null): string[] {
  return parseWatchlist(JSON.stringify((value ?? '').split(',').filter(Boolean))).slice(0, MAX_FAVORITES);
}

/** Upcoming episodes first (soonest first), then everything else by name. */
export function sortFavorites(items: FavoriteItem[], locale: string): FavoriteItem[] {
  return [...items].sort((a, b) => (a.next?.airingAt ?? Infinity) - (b.next?.airingAt ?? Infinity) || a.name.localeCompare(b.name, locale));
}
