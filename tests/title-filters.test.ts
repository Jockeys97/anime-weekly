import { expect, it } from 'vitest';
import { filterOptions, filterTitles, providerPlatform } from '../lib/title-filters';
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
it('groups Netflix and Prime Video plans without including extra Amazon channels', () => {
  expect(providerPlatform(provider(1796, 'Netflix Standard with Ads'))).toEqual(['netflix', 'Netflix']);
  expect(providerPlatform(provider(119, 'Amazon Prime Video'))).toEqual(['prime-video', 'Prime Video']);
  expect(providerPlatform(provider(2100, 'Amazon Prime Video with Ads'))).toEqual(['prime-video', 'Prime Video']);
  expect(providerPlatform(provider(1853, 'Crunchyroll Amazon Channel'))).toEqual(['1853', 'Crunchyroll Amazon Channel']);
});
it('filters the same selected brand differently by country and retains its label', () => {
  const entries = [
    { key: 'anilist:1', providers: { IT: { link: '', providers: [provider(8, 'Netflix')] }, US: { link: '', providers: [provider(9, 'Amazon Prime Video')] } } },
    { key: 'anilist:2', providers: { IT: { link: '', providers: [provider(119, 'Amazon Prime Video')] }, US: { link: '', providers: [provider(1796, 'Netflix Standard with Ads')] } } },
    { key: 'anilist:3', providers: { IT: { link: '', providers: [provider(1853, 'Crunchyroll Amazon Channel')] } } },
  ];
  const filters = { genre: '', platform: 'netflix', region: 'IT' as const, onlyWatchlist: false, watchlist: [] };
  expect(filterTitles(entries, filters).map(title => title.key)).toEqual(['anilist:1']);
  expect(filterTitles(entries, { ...filters, region: 'US' }).map(title => title.key)).toEqual(['anilist:2']);
  expect(filterTitles(entries, { ...filters, platform: 'prime-video' }).map(title => title.key)).toEqual(['anilist:2']);
  expect(filterTitles(entries, { ...filters, platform: 'prime-video', region: 'US' }).map(title => title.key)).toEqual(['anilist:1']);
  expect(filterOptions(entries, 'JP', 'netflix').platforms).toEqual([['netflix', 'Netflix']]);
  expect(filterTitles(entries, { ...filters, region: 'JP' })).toEqual([]);
});
it('builds deduplicated options from available genres and the selected country only', () => {
  expect(filterOptions(titles, 'IT')).toEqual({ genres: ['Action', 'Comedy'], platforms: [['1', 'A'], ['2', 'B']] });
  expect(filterOptions(titles, 'US').platforms).toEqual([['2', 'B']]);
  expect(filterOptions([], 'IT')).toEqual({ genres: [], platforms: [] });
});
