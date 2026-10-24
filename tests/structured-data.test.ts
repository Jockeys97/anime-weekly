vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeek: vi.fn().mockResolvedValue(null), getSeoWeeks: vi.fn().mockResolvedValue([]), getAnimeWeekAppearances: async () => [] }));
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JsonLd } from '../components/JsonLd';
import { animeBreadcrumbs, animeItemList } from '../lib/structured-data';
import Home from '../app/[locale]/page';
import WeekPage from '../app/[locale]/week/[week]/page';
import SeasonPage from '../app/[locale]/season/[year]/[season]/page';
import { getSeason } from '../lib/anilist';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('../lib/anilist', async original => ({ ...await original<typeof import('../lib/anilist')>(), getSeason: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: async () => ({ titles: {}, events: [] }) }));
vi.mock('../components/WeeklyGuide', () => ({ WeeklyGuide: () => null }));
vi.mock('../components/SeasonContent', () => ({ SeasonContent: () => null }));

beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com'); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const scripts = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match => JSON.parse(match[1]));

it('renders safely escaped, parseable JSON-LD with ordered real names and only valid detail URLs', () => {
  const name = '</script><script>alert("x")</script> & "Titolo"';
  const data = animeItemList([{ name, anilistId: 42 }, { name: 'Senza ID' }, { name: 'ID non valido', anilistId: -1 }]);
  const markup = renderToStaticMarkup(React.createElement(JsonLd, { data }));
  expect(markup).not.toContain(name);
  expect(scripts(markup)).toEqual([data]);
  expect(data.itemListElement).toEqual([
    { '@type': 'ListItem', position: 1, name, url: 'https://weeklyanime.com/anime/42-script-script-alert-x-script-titolo' },
    { '@type': 'ListItem', position: 2, name: 'Senza ID' },
    { '@type': 'ListItem', position: 3, name: 'ID non valido' },
  ]);
  expect(animeItemList([]).itemListElement).toEqual([]);
});

it('uses only known season data in Italian anime breadcrumbs', () => {
  const anime = { id: 42, season: 'FALL', seasonYear: 2026 };
  expect(animeBreadcrumbs(anime, 'Titolo').itemListElement).toEqual([
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://weeklyanime.com/' },
    { '@type': 'ListItem', position: 2, name: 'Stagione Autunno 2026', item: 'https://weeklyanime.com/season/2026/fall' },
    { '@type': 'ListItem', position: 3, name: 'Titolo', item: 'https://weeklyanime.com/anime/42-titolo' },
  ]);
  for (const missing of [{ season: null }, { seasonYear: null }, { season: 'UNKNOWN' }]) {
    expect(animeBreadcrumbs({ ...anime, ...missing }, 'Titolo').itemListElement.map(item => item.name)).toEqual(['Home', 'Titolo']);
  }
});

it('renders WebSite SearchAction once on home and only breadcrumbs on a week archive', async () => {
  const home = scripts(renderToStaticMarkup(await Home({})));
  expect(home).toHaveLength(2);
  expect(home[1]).toMatchObject({ '@type': 'Organization', name: 'Weekly Anime', logo: 'https://weeklyanime.com/icon.svg' });
  expect(home[0]).toMatchObject({ '@type': 'WebSite', url: 'https://weeklyanime.com/', potentialAction: {
    '@type': 'SearchAction', target: 'https://weeklyanime.com/search?q={search_term_string}', 'query-input': 'required name=search_term_string',
  } });
  const archive = scripts(renderToStaticMarkup(await WeekPage({ params: Promise.resolve({ week: '2026-42' }) })));
  expect(archive).toHaveLength(1);
  expect(archive[0]).toMatchObject({ '@type': 'BreadcrumbList', itemListElement: [
    { position: 1, name: 'Home', item: 'https://weeklyanime.com/' },
    { position: 2, name: 'Settimana 42', item: 'https://weeklyanime.com/week/2026-42' },
  ] });
});

it('lists only the current season page with localized breadcrumbs for an English URL', async () => {
  vi.mocked(getSeason).mockResolvedValue({ media: [{ id: 42, title: { english: 'Titolo', romaji: null, native: null } }] as Awaited<ReturnType<typeof getSeason>>['media'], pageInfo: { currentPage: 2, hasNextPage: false } });
  const html = renderToStaticMarkup(await SeasonPage({ params: Promise.resolve({ year: '2026', season: 'fall', locale: 'en' }), searchParams: Promise.resolve({ page: '2' }) }));
  expect(getSeason).toHaveBeenCalledExactlyOnceWith(2026, 'fall', 2, { maxWaitMs: 6000 });
  const data = scripts(html);
  expect(data).toHaveLength(2);
  expect(data[0].itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: 'Titolo', url: 'https://weeklyanime.com/en/anime/42-titolo' }]);
  expect(data[1].itemListElement.map((item: { name: string }) => item.name)).toEqual(['Home', 'Seasons', 'Season Fall 2026']);
  expect(html).toContain('lang="en"');
});
