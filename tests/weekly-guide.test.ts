import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/request-locale', () => ({ getRequestLocale: async () => 'it' }));
vi.mock('../lib/tmdb', () => ({ getCachedWeekData: vi.fn(), getQuickWeekData: vi.fn(), isOMDBConfigured: () => true }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn(), trackWeeklyPage: async () => null }));
import { getCachedWeekData, getQuickWeekData } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { WeeklyGuide } from '../components/WeeklyGuide';
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
  const content = await catalog.type(catalog.props);
  expect(content.props.initial.titles).toHaveLength(1);
  expect(content.props.initial.titles[0].ratings).toEqual({ anilistId: 123, malScore: 8, imdbRating: '8.1' });
  expect(getCachedWeekData).not.toHaveBeenCalled();
  expect(getWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-42');
});
