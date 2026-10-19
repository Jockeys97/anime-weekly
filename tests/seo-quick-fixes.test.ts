import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, useRouter: () => ({}) }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn(), discoverAnime: vi.fn() }));
vi.mock('../components/WeeklyGuide', () => ({ WeeklyGuide: () => null }));

import { generateMetadata as searchMetadata } from '../app/[locale]/search/page';
import WeekPage, { generateMetadata as weekMetadata } from '../app/[locale]/week/[week]/page';
import SeasonPage, { generateMetadata as seasonMetadata } from '../app/[locale]/season/[year]/[season]/page';
import { WeeklyHeading } from '../components/WeeklyContent';
import { LocaleProvider } from '../components/LanguageSelector';
import { getSeason } from '../lib/anilist';
import { weekDateRange } from '../lib/week';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it.each([{}, { q: '' }, { q: 'Ranma' }, { page: '2' }, { unknown: '' }, { genre: ['Action', 'Comedy'] }])('canonicalizes search query %j to bare /search', async query => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com');
  const metadata = await searchMetadata({ searchParams: Promise.resolve(query) });
  expect(metadata.alternates?.canonical).toBe('https://weeklyanime.com/search');
  expect(metadata.robots).toEqual(Object.keys(query).length ? { index: false, follow: true } : undefined);
});

it.each(['bad', '2021-53', '2026-00', '2026-54'])('rejects invalid week %s in metadata and page', async week => {
  const props = { params: Promise.resolve({ week }) };
  await expect(weekMetadata(props)).rejects.toThrow('not-found');
  await expect(WeekPage(props)).rejects.toThrow('not-found');
});

it.each([
  { year: '2026', season: 'autumn', page: undefined },
  { year: '0000', season: 'fall', page: undefined },
  { year: '26', season: 'fall', page: undefined },
  ...['0', '-1', 'abc', '2147483648', ['1', '2']].map(page => ({ year: '2026', season: 'fall', page })),
])('rejects invalid season parameters %j before data loading', async ({ year, season, page }) => {
  const props = { params: Promise.resolve({ year, season }), searchParams: Promise.resolve({ page }) };
  await expect(seasonMetadata(props)).rejects.toThrow('not-found');
  await expect(SeasonPage(props)).rejects.toThrow('not-found');
  expect(getSeason).not.toHaveBeenCalled();
});

it('gives archive headings dates in the selected language and preserves the home heading', () => {
  vi.stubGlobal('React', React);
  const week = { year: 2026, week: 43 };
  const heading = (archive: boolean, locale: 'it' | 'en') => renderToStaticMarkup(React.createElement(LocaleProvider, { locale } as React.ComponentProps<typeof LocaleProvider>, React.createElement(WeeklyHeading, { week, archive }))).match(/<h1>(.*?)<\/h1>/)?.[1];
  expect(heading(true, 'it')).toBe('Anime 19–25 ottobre 2026 · settimana 43');
  expect(heading(true, 'en')).toContain('October 19');
  expect(heading(true, 'en')).toContain('week 43');
  expect(heading(false, 'it')).not.toContain('ottobre');
});

it('formats week ranges crossing month and year boundaries', () => {
  expect(weekDateRange({ year: 2026, week: 44 })).toMatch(/^26 ottobre\s–\s0?1 novembre 2026$/);
  expect(weekDateRange({ year: 2020, week: 53 })).toMatch(/^28 dicembre 2020\s–\s0?3 gennaio 2021$/);
});
