vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeek: vi.fn().mockResolvedValue(null), getSeoWeeks: vi.fn().mockResolvedValue([]), getAnimeWeekAppearances: async () => [] }));
import React from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Home from '../app/[locale]/page';
import Week from '../app/[locale]/week/[week]/page';
import Season from '../app/[locale]/season/[year]/[season]/page';
import ThisWeek from '../app/[locale]/this-week/page';
import Best from '../app/[locale]/best-this-season/page';
import Detail from '../app/[locale]/anime/[id]/page';
import { animeStructuredData } from '../lib/structured-data';
import { LocaleProvider } from '../components/LanguageSelector';
import type { AniListAnime } from '../lib/anilist';

const { anime, snapshot, weekData } = vi.hoisted(() => ({
  anime: { id: 21, idMal: null, coverImage: null, bannerImage: null, description: null, status: null, studios: null, title: { english: 'One Piece', romaji: null, native: null }, format: 'TV', startDate: { year: 1999, month: 10, day: 20 }, season: 'FALL', seasonYear: 1999, episodes: 12, averageScore: 80, genres: [], nextAiringEpisode: { episode: 2, airingAt: 1792537200 }, stats: { scoreDistribution: [{ amount: 12 }] } },
  snapshot: { titles: { 'tv:1': { anilistId: 21 } }, events: [] },
  weekData: { titles: [{ id: 1, kind: 'tv', name: 'One Piece', ratings: { anilistId: 21 }, episodes: [] }] },
}));
// All data here are isolated fixtures; no production facts or network calls.
vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => {} }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', async original => ({ ...await original<typeof import('../lib/anilist')>(), getAnime: async () => anime, getSeason: async (year: number, season: string, page = 1) => ({ media: [{ ...anime, seasonYear: year, season: season.toUpperCase() }], pageInfo: { currentPage: page, hasNextPage: false } }) }));
vi.mock('../lib/platform-metadata', () => ({ getAnimePlatformMetadata: async () => ({ titles: {}, unavailable: false }) }));
vi.mock('../lib/anime-detail-data', () => ({ getAnimeDetailData: async () => ({ ratings: {}, availability: { ratings: {}, providers: {} }, synopsis: {} }) }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: async () => snapshot, readWeeklyRatingsSnapshot: async () => snapshot, trackWeeklyPage: async () => {} }));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: async () => weekData }));
vi.mock('../lib/week-archive', () => ({ readWeekArchive: async () => null }));
vi.mock('../lib/weekly-calendar', () => ({ buildWeeklyCalendar: () => ({ days: [], undated: [] }) }));
vi.mock('../components/WeeklyContent', () => ({ WeeklyHeading: () => null, WeeklyContent: () => null, WeeklyScope: () => null }));
vi.mock('../components/NewsletterSignup', () => ({ NewsletterSignup: () => null }));
vi.mock('../components/SponsorSlot', () => ({ SponsorSlot: () => null }));
vi.mock('../components/SeasonContent', () => ({ SeasonContent: () => null }));
vi.mock('../components/CatalogCard', () => ({ CatalogCard: () => null }));
vi.mock('../components/AnimeDetailView', () => ({ AnimeDetailView: () => null }));
beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function emitted(element: React.ReactNode) {
  const html = await new Promise<string>((resolve, reject) => {
    const destination = new PassThrough();
    let result = '';
    destination.on('data', chunk => { result += chunk.toString(); });
    destination.on('end', () => resolve(result));
    const stream = renderToPipeableStream(React.createElement(LocaleProvider, { locale: 'en' } as React.ComponentProps<typeof LocaleProvider>, element), {
      onAllReady() { stream.pipe(destination); }, onError: reject,
    });
  });
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(match => JSON.parse(match[1]));
}

type Node = Record<string, unknown>;
function validate(node: Node, root = true) {
  if (root) expect(node['@context']).toBe('https://schema.org');
  expect(typeof node['@type']).toBe('string');
  const type = node['@type'];
  if (['WebSite', 'Organization', 'TVSeries', 'Movie', 'TVEpisode', 'ItemList', 'BreadcrumbList'].includes(String(type))) {
    expect(node.name).toEqual(expect.any(String));
    expect(node.url).toMatch(/^https:\/\//);
  }
  if (type === 'ItemList' || type === 'BreadcrumbList') {
    const items = node.itemListElement as Node[];
    expect(items.map(item => item.position)).toEqual(items.map((_, index) => index + 1));
    if (type === 'BreadcrumbList') for (const item of items) expect(item.item).toMatch(/^https:\/\//);
  }
  if (type === 'AggregateRating') {
    expect(node.ratingValue).toEqual(expect.any(Number));
    expect(node.ratingValue as number).toBeGreaterThanOrEqual(node.worstRating as number);
    expect(node.ratingValue as number).toBeLessThanOrEqual(node.bestRating as number);
  }
  if (type === 'TVEpisode') {
    expect(node.episodeNumber).toBeGreaterThan(0);
    expect(node.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) { if (item && typeof item === 'object' && '@type' in item) validate(item, false); }
    else if (value && typeof value === 'object' && '@type' in value) validate(value as Node, false);
  }
}

it('parses and validates every JSON-LD script emitted on the six key page types', async () => {
  const params = Promise.resolve({ locale: 'en' });
  const pages = [
    [await Home({ params }), ['WebSite', 'Organization', 'ItemList']],
    [await Week({ params: Promise.resolve({ locale: 'en', week: '2026-43' }) }), ['BreadcrumbList', 'ItemList']],
    [await Season({ params: Promise.resolve({ locale: 'en', year: '2026', season: 'fall' }), searchParams: Promise.resolve({}) }), ['ItemList', 'BreadcrumbList']],
    [await ThisWeek({ params }), ['ItemList', 'BreadcrumbList']],
    [await Best({ params }), ['ItemList', 'BreadcrumbList']],
    [await Detail({ params: Promise.resolve({ locale: 'en', id: '21-one-piece' }) }), ['TVSeries', 'BreadcrumbList']],
  ] as const;
  for (const [element, expected] of pages) {
    const nodes = await emitted(element);
    expect(nodes.map(node => node['@type']).sort()).toEqual([...expected].sort());
    nodes.forEach(node => validate(node));
  }
});

it('includes real dates, episode count and votes and omits incomplete or invalid facts', () => {
  const data = animeStructuredData(anime as AniListAnime, 'One Piece', '', 'en');
  expect(data).toMatchObject({ startDate: '1999-10-20', datePublished: '1999-10-20', numberOfEpisodes: 12, aggregateRating: { ratingCount: 12 }, episode: { episodeNumber: 2, datePublished: new Date(anime.nextAiringEpisode.airingAt * 1000).toISOString().slice(0, 10) } });
  for (const startDate of [{ year: 1999, month: null, day: null }, { year: 2026, month: 2, day: 30 }]) {
    const missing = animeStructuredData({ ...anime, startDate, episodes: null, averageScore: null, stats: null, nextAiringEpisode: null } as AniListAnime, 'One Piece', '');
    for (const key of ['startDate', 'datePublished', 'numberOfEpisodes', 'aggregateRating', 'episode']) expect(missing).not.toHaveProperty(key);
  }
  expect(animeStructuredData({ ...anime, stats: null } as AniListAnime, 'One Piece', '').aggregateRating).not.toHaveProperty('ratingCount');
  const movie = animeStructuredData({ ...anime, format: 'MOVIE' } as AniListAnime, 'One Piece', '');
  expect(movie['@type']).toBe('Movie');
  expect(movie.datePublished).toBe('1999-10-20');
  expect(movie).not.toHaveProperty('episode');
});
