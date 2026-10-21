import { isSeason, type AnimeSeason } from '@/lib/season';

// `poster` is the small on-screen image; `exportPoster` (up to TMDB w342) is only fetched for the PNG export.
export interface TierItem { id: number; name: string; poster: string | null; exportPoster?: string | null }
export interface Tier { id: string; label: string; color: string }
export interface TierBoard { tiers: Tier[]; rows: Record<string, number[]> }

// Labels stay English in every locale: they are part of the shared image style.
export const DEFAULT_TIERS: readonly Tier[] = [
  { id: 's', label: 'AMAZING!', color: '#ff7f7f' },
  { id: 'a', label: 'CHECK IT OUT!', color: '#ffbf7f' },
  { id: 'b', label: 'ENJOYING', color: '#ffdf7f' },
  { id: 'c', label: 'NOT BAD', color: '#7fffff' },
  { id: 'd', label: 'MIXED FEELINGS', color: '#bfff7f' },
  { id: 'f', label: 'DROPPED', color: '#bf7fff' },
];
export const MAX_LABEL_LENGTH = 40;

export function emptyBoard(): TierBoard {
  return { tiers: DEFAULT_TIERS.map(tier => ({ ...tier })), rows: Object.fromEntries(DEFAULT_TIERS.map(tier => [tier.id, []])) };
}

export function tierStorageKey(season: AnimeSeason): string {
  return `anime-weekly:tier-list:v1:${season.year}-${season.season}`;
}

/** `?season=fall&year=2026`; anything invalid falls back to the given season. */
export function tierSeasonFromQuery(season: unknown, year: unknown, fallback: AnimeSeason): AnimeSeason {
  const name = typeof season === 'string' ? season.toLowerCase() : '';
  const value = typeof year === 'string' && /^\d{4}$/.test(year) ? Number(year) : NaN;
  return isSeason(name) && value >= 1940 && value <= 2100 ? { year: value, season: name } : fallback;
}

export function tierListPath(season: AnimeSeason): string {
  return `/tier-list?season=${season.season}&year=${season.year}`;
}

// Stored boards are user-controlled: keep only known tiers, known items and
// each item at most once, so a stale or edited entry can never break the UI.
export function parseBoard(raw: string | null, itemIds: readonly number[]): TierBoard {
  const board = emptyBoard();
  if (!raw) return board;
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return board; }
  if (!data || typeof data !== 'object') return board;
  const { tiers, rows } = data as { tiers?: unknown; rows?: unknown };
  if (Array.isArray(tiers)) for (const tier of board.tiers) {
    const saved = tiers.find(item => item && typeof item === 'object' && (item as Tier).id === tier.id) as Partial<Tier> | undefined;
    if (typeof saved?.label === 'string') tier.label = cleanLabel(saved.label, tier.label);
  }
  if (rows && typeof rows === 'object') {
    const known = new Set(itemIds); const seen = new Set<number>();
    for (const tier of board.tiers) {
      const saved = (rows as Record<string, unknown>)[tier.id];
      if (!Array.isArray(saved)) continue;
      board.rows[tier.id] = saved.filter((id): id is number => typeof id === 'number' && known.has(id) && !seen.has(id) && Boolean(seen.add(id)));
    }
  }
  return board;
}

export function cleanLabel(value: string, fallback: string): string {
  const label = value.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
  return label || fallback;
}

/** Moves an item to a tier (or the pool when `tierId` is null), before `beforeId` if given. */
export function moveItem(board: TierBoard, itemId: number, tierId: string | null, beforeId?: number): TierBoard {
  const rows = Object.fromEntries(Object.entries(board.rows).map(([id, items]) => [id, items.filter(item => item !== itemId)]));
  if (tierId && rows[tierId]) {
    const target = rows[tierId];
    const index = beforeId === undefined ? -1 : target.indexOf(beforeId);
    target.splice(index < 0 ? target.length : index, 0, itemId);
  }
  return { ...board, rows };
}

export function itemTier(board: TierBoard, itemId: number): string | null {
  return Object.entries(board.rows).find(([, items]) => items.includes(itemId))?.[0] ?? null;
}

const allowedImageHosts = new Set(['image.tmdb.org', 's4.anilist.co']);
/** Only TMDB posters (and AniList covers as fallback) may be proxied for export. */
export function isAllowedTierImage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && allowedImageHosts.has(url.hostname) && !url.username && !url.password && !url.port
      && (url.hostname !== 'image.tmdb.org' || url.pathname.startsWith('/t/p/'));
  } catch { return false; }
}
/** Swaps the size segment of a TMDB poster URL (`/t/p/w342/x.jpg` -> `/t/p/w185/x.jpg`); other URLs pass through. */
export function tmdbPosterSize(url: string, size: 'w154' | 'w185' | 'w342'): string {
  return url.replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w\d+\//, `$1${size}/`);
}
export function tierImageProxy(value: string): string {
  return `/api/tier-image?url=${encodeURIComponent(value)}`;
}
