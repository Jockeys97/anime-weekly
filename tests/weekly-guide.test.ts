import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/request-locale', () => ({ getRequestLocale: async () => 'it' }));
vi.mock('../lib/tmdb', () => ({ getCachedWeekData: vi.fn(), getQuickWeekData: vi.fn(), isOMDBConfigured: () => true }));
import { getCachedWeekData, getQuickWeekData } from '../lib/tmdb';
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
