import { parseWatchlist } from '@/lib/watchlist';
import type { FavoriteAnime, FavoriteSequel } from '@/lib/anilist';

export interface FavoriteItem {
  id: string;
  name: string;
  poster: string | null;
  /** Path without locale prefix. */
  href: string;
  status?: 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  next?: { episode: number; airingAt: number };
  /** Name of the airing or announced season when the saved entry itself has finished. */
  current?: string;
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

const SERIES_FORMATS = ['TV', 'TV_SHORT', 'ONA'];
const ACTIVE = ['RELEASING', 'NOT_YET_RELEASED', 'HIATUS'];
// Bleach (2004) reaches its airing cour in four hops (TYBW parts 1-3, then The Calamity).
export const SEQUEL_HOPS = 5;
const sequels = (anime: FavoriteAnime) => (anime.relations?.edges ?? [])
  .filter(edge => edge.relationType === 'SEQUEL' && SERIES_FORMATS.includes(edge.node.format || '')).map(edge => edge.node);

// AniList files each season separately; a saved first season can be FINISHED
// while its sequel airs. Follow series sequels (not films or spin-offs) a few
// hops; `lookup` holds fetched entries whose own sequels are known.
function walk(start: FavoriteAnime, lookup: ReadonlyMap<number, FavoriteAnime>) {
  const missing: number[] = [];
  if (start.status !== 'FINISHED') return { active: null, missing };
  const seen = new Set([start.id]);
  let frontier = [start];
  for (let hop = 0; hop < SEQUEL_HOPS && frontier.length; hop++) {
    const found: FavoriteSequel[] = [], next: FavoriteAnime[] = [];
    for (const anime of frontier) for (const node of sequels(anime)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      if (ACTIVE.includes(node.status || '')) found.push(node);
      else if (node.status === 'FINISHED') { const full = lookup.get(node.id); if (full) next.push(full); else missing.push(node.id); }
    }
    if (found.length) {
      const airing = found.filter(node => node.nextAiringEpisode).sort((a, b) => a.nextAiringEpisode!.airingAt - b.nextAiringEpisode!.airingAt);
      return { active: airing[0] ?? found.find(node => node.status === 'RELEASING') ?? found[0], missing: [] };
    }
    frontier = next;
  }
  return { active: null, missing };
}
/** The airing or announced sequel season of a finished favourite, if known. */
export function activeSequel(start: FavoriteAnime, lookup: ReadonlyMap<number, FavoriteAnime>): FavoriteSequel | null { return walk(start, lookup).active; }
/** Finished sequels whose own sequels must be fetched to keep walking. */
export function missingSequelIds(start: FavoriteAnime, lookup: ReadonlyMap<number, FavoriteAnime>): number[] { return walk(start, lookup).missing; }
