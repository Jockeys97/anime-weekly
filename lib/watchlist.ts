export const WATCHLIST_KEY = 'aw:watchlist';
export function watchlistId(title: { id: number; kind?: 'tv' | 'movie'; ratings?: { anilistId?: number } }): string {
  return title.ratings?.anilistId ? `anilist:${title.ratings.anilistId}` : `${title.kind ?? 'anilist'}:${title.id}`;
}
export function parseWatchlist(value: string | null): string[] {
  try {
    const data: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(data) ? [...new Set(data.filter((id): id is string => typeof id === 'string' && /^(anilist|tv|movie):[1-9]\d*$/.test(id)))] : [];
  } catch { return []; }
}
export function readWatchlist(storage: Pick<Storage, 'getItem'>): string[] {
  try { return parseWatchlist(storage.getItem(WATCHLIST_KEY)); } catch { return []; }
}
export function toggleWatchlist(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string): boolean {
  if (!parseWatchlist(JSON.stringify([id])).length) return false;
  try {
    const current = readWatchlist(storage);
    storage.setItem(WATCHLIST_KEY, JSON.stringify(current.includes(id) ? current.filter(item => item !== id) : [...current, id]));
    return true;
  } catch { return false; }
}

/** Add ids (validated) to the saved list without duplicates; returns how many were new, or -1 if storage failed. */
export function mergeWatchlist(storage: Pick<Storage, 'getItem' | 'setItem'>, ids: readonly string[]): number {
  try {
    const current = readWatchlist(storage);
    const added = parseWatchlist(JSON.stringify(ids)).filter(id => !current.includes(id));
    if (added.length) storage.setItem(WATCHLIST_KEY, JSON.stringify([...current, ...added]));
    return added.length;
  } catch { return -1; }
}
