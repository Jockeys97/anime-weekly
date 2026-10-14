import { expect, it } from 'vitest';
import { parseWatchlist, readWatchlist, toggleWatchlist, watchlistId, WATCHLIST_KEY } from '../lib/watchlist';
it('shares the AniList identity across weekly and catalog cards', () => {
  expect(watchlistId({ id: 123 })).toBe('anilist:123');
  expect(watchlistId({ id: 1, kind: 'tv', ratings: { anilistId: 123 } })).toBe('anilist:123');
  expect(watchlistId({ id: 1, kind: 'movie' })).toBe('movie:1');
});
it('reads malformed or inaccessible storage safely and removes duplicates', () => {
  for (const raw of [null, '{', '{}', 'null', 'true']) expect(parseWatchlist(raw)).toEqual([]);
  expect(parseWatchlist('["anilist:1","anilist:1",2,"tv:0","other:1","movie:4"]')).toEqual(['anilist:1', 'movie:4']);
  expect(readWatchlist({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
});
it('persists heart toggles to the required key, preserves other titles and reports failures', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  expect(toggleWatchlist(storage, 'anilist:1')).toBe(true);
  toggleWatchlist(storage, 'tv:2'); toggleWatchlist(storage, 'anilist:1');
  expect(data.get(WATCHLIST_KEY)).toBe('["tv:2"]');
  expect(toggleWatchlist(storage, 'invalid')).toBe(false);
  expect(toggleWatchlist({ ...storage, setItem: () => { throw new Error('quota'); } }, 'anilist:1')).toBe(false);
});
