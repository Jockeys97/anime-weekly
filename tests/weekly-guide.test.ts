/* eslint-disable react/no-children-prop */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/request-locale', () => ({ getRequestLocale: async () => 'it' }));
vi.mock('../lib/tmdb', () => ({ getCachedWeekData: vi.fn(), getQuickWeekData: vi.fn(), isOMDBConfigured: () => true }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn(), trackWeeklyPage: async () => null }));
import { getCachedWeekData, getQuickWeekData } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { WeeklyGuide } from '../components/WeeklyGuide';
import { renderToStaticMarkup } from 'react-dom/server';
import { LocaleProvider } from '../components/LanguageSelector';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { getDictionary } from '../lib/i18n';
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('returns the weekly shell before slow catalog enrichment', async () => {
  vi.stubGlobal('React', React);
  vi.mocked(getCachedWeekData).mockReturnValue(new Promise(() => {}));
  vi.mocked(getQuickWeekData).mockReturnValue(new Promise(() => {}));
  const result = await WeeklyGuide({ week: { year: 2026, week: 42 } });
  expect(React.isValidElement(result)).toBe(true);
  expect(result.props.id).toBe('main');
}, 1000);

it('serializes one compact catalog with cron matches without invoking live enrichment', async () => {
  vi.stubGlobal('React', React);
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [{ id: 1, kind: 'tv', name: 'Ranma ½', overview: 'Story', poster: null, ratings: {}, recommendation: null, providers: {}, providersUnavailable: false }] });
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: { 'tv:1': { anilistId: 123, malScore: 8, imdbRating: '8.1' } }, events: [] });
  const shell = WeeklyGuide({ week: { year: 2026, week: 42 } });
  const section = shell.props.children.find((child: unknown) => React.isValidElement(child) && child.type === 'section')!;
  const catalog = section.props.children[0].props.children;
  const result = await catalog.type(catalog.props);
  const content = result.props.children[1];
  expect(result.props.children[0].props.data).toMatchObject({ '@type': 'ItemList', itemListElement: [
    { position: 1, name: 'Ranma ½', url: expect.stringMatching(/\/anime\/123-ranma-1-2$/) },
  ] });
  expect(content.props.initial.titles).toHaveLength(1);
  expect(content.props.initial.titles[0].ratings).toEqual({ anilistId: 123, malScore: 8, imdbRating: '8.1' });
  expect(getCachedWeekData).not.toHaveBeenCalled();
  expect(getWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-42');
});

it.each(['en', 'it'] as const)('renders every cached rating and default-country provider in %s HTML without client recovery', async locale => {
  vi.stubGlobal('React', React);
  const fetchMock = vi.fn(() => { throw new Error('SSR must use only the snapshot'); });
  vi.stubGlobal('fetch', fetchMock);
  const title = { id: 1, kind: 'tv' as const, name: 'Offline fixture', overview: 'Story', poster: null, ratings: {}, recommendation: null, providers: {}, providersUnavailable: false };
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [title, { ...title, id: 2, name: 'Unrated fixture' }] });
  vi.mocked(getWeeklyRatings).mockResolvedValue({
    titles: { 'tv:1': { imdbId: 'tt123', imdbRating: '8.1', imdbVotes: '2,123', anilistId: 123, anilistScore: 81, malId: 456, malScore: 8.25 } }, events: [],
    availability: { titles: { 'tv:1': { countries: { IT: [8], US: [9] }, fetchedAt: 123 } }, providers: { 8: { name: 'Italian platform', logo: null }, 9: { name: 'American platform', logo: null } } },
  });
  const shell = WeeklyGuide({ week: { year: 2026, week: 42 } });
  const section = shell.props.children.find((child: unknown) => React.isValidElement(child) && child.type === 'section')!;
  const catalog = section.props.children[0].props.children;
  const content = await catalog.type(catalog.props);
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale, children: React.createElement(StreamingCountryProvider, { children: content }) }));
  expect(html).toContain('8.1'); expect(html).toContain('8.25'); expect(html).toContain('81%');
  expect(html).toContain('https://www.imdb.com/title/tt123/');
  expect(html).toContain('https://anilist.co/anime/123/');
  expect(html).toContain('https://myanimelist.net/anime/456');
  expect(html).toContain(locale === 'it' ? 'Italian platform' : 'American platform');
  expect(html).not.toContain(locale === 'it' ? 'American platform' : 'Italian platform');
  expect(html).toContain(getDictionary(locale).title.noWatchData);
  expect(html).toContain('n/a');
  for (const placeholder of ['Caricamento dei voti', 'Caricamento della disponibilità', 'Loading ratings', 'Loading streaming availability']) expect(html).not.toContain(placeholder);
  expect(fetchMock).not.toHaveBeenCalled();
});
