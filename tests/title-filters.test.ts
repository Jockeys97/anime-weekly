import { expect, it } from 'vitest';
import { filterOptions, filterTitles } from '../lib/title-filters';
const provider = (id: number, name: string) => ({ provider_id: id, provider_name: name, logo_path: null });
const titles = [
  { key: 'anilist:1', genres: ['Comedy', 'Action'], providers: { IT: { link: '', providers: [provider(1, 'A')] }, US: { link: '', providers: [provider(2, 'B')] } } },
  { key: 'tv:2', genres: ['Action'], providers: { IT: { link: '', providers: [provider(2, 'B'), provider(1, 'A')] } } },
  { key: 'movie:3', providers: {} },
];
it('combines genre, country-specific platform and watchlist filters', () => {
  const filters = { genre: 'Action', platform: '1', region: 'IT' as const, onlyWatchlist: true, watchlist: ['tv:2'] };
  expect(filterTitles(titles, filters).map(title => title.key)).toEqual(['tv:2']);
  expect(filterTitles(titles, { ...filters, region: 'US' })).toEqual([]);
  expect(filterTitles(titles, { ...filters, genre: '', platform: '', onlyWatchlist: false })).toHaveLength(3);
  expect(filterTitles(titles, { ...filters, watchlist: [] })).toEqual([]);
});
it('builds deduplicated options from available genres and the selected country only', () => {
  expect(filterOptions(titles, 'IT')).toEqual({ genres: ['Action', 'Comedy'], platforms: [['1', 'A'], ['2', 'B']] });
  expect(filterOptions(titles, 'US').platforms).toEqual([['2', 'B']]);
  expect(filterOptions([], 'IT')).toEqual({ genres: [], platforms: [] });
});
