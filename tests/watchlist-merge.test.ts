import { expect, it } from 'vitest';
import { mergeWatchlist, readWatchlist, WATCHLIST_KEY } from '../lib/watchlist';
const memory = (initial: string[] = []) => { const data = new Map([[WATCHLIST_KEY, JSON.stringify(initial)]]); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; };

it('adds only new, valid favourites and keeps the existing order', () => {
  const storage = memory(['anilist:1', 'tv:2']);
  expect(mergeWatchlist(storage, ['anilist:1', 'anilist:3', 'bad', 'movie:4', 'anilist:3'])).toBe(2);
  expect(readWatchlist(storage)).toEqual(['anilist:1', 'tv:2', 'anilist:3', 'movie:4']);
  expect(mergeWatchlist(storage, ['anilist:1'])).toBe(0);
});
it('reports blocked storage instead of throwing', () => {
  expect(mergeWatchlist({ getItem: () => '[]', setItem: () => { throw new Error('blocked'); } }, ['anilist:1'])).toBe(-1);
});
