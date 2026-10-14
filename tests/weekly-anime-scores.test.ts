import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
vi.mock('../lib/tmdb', () => ({ getWeeklyRatingSources: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn() }));
vi.mock('../lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
vi.mock('../components/LanguageSelector', () => ({ useLocale: () => 'it' }));
import { getWeeklyRatingSources } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { anilistFetch } from '../lib/rate-limited-fetch';
import { getWeeklyAnimeScores } from '../lib/weekly-anime-scores';
import { mergeAnimeRatings } from '../lib/weekly-details';
import { AnimeRatingTile } from '../components/RatingSummary';
import { GET } from '../app/api/weekly-ratings/route';
const source = (id: number) => ({ kind: 'tv' as const, id, title: `Show ${id}`, originalTitle: undefined, year: 2024 });
const candidate = (id: number) => ({ id: id + 100, type: 'ANIME', format: 'TV', title: { english: `Show ${id}` }, startDate: { year: 2024 }, averageScore: 80 + id, idMal: id + 200 });
function response(_url: string, init?: RequestInit) {
  const body = JSON.parse(String(init?.body));
  return Response.json({ data: Object.fromEntries(Object.entries(body.variables).map(([key, value]) => [key, { media: [candidate(Number(String(value).replace('Show ', '')))] }])) });
}
beforeEach(async () => {
  (await import('./helpers/next-cache')).clearNextCache();
  vi.stubGlobal('React', React);
  vi.mocked(getWeeklyRatingSources).mockResolvedValue([source(1), source(2)]);
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(anilistFetch).mockImplementation(async (url, init) => response(url, init));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('recovers validated scores and identities in one batch with a cold cron snapshot', async () => {
  const result = await getWeeklyAnimeScores('2026-42');
  expect(result).toEqual({ titles: {
    'tv:1': { anilistScore: 81, anilistId: 101, malId: 201, animeStatus: 'ready' },
    'tv:2': { anilistScore: 82, anilistId: 102, malId: 202, animeStatus: 'ready' },
  }, unavailable: false });
  expect(anilistFetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(anilistFetch).mock.calls[0][1]?.cache).toBe('no-store');
  expect(JSON.parse(String(vi.mocked(anilistFetch).mock.calls[0][1]?.body)).variables).toEqual({ s0_0: 'Show 1', s1_0: 'Show 2' });
  expect(JSON.stringify(result)).not.toContain('imdb');
  await getWeeklyAnimeScores('2026-42');
  expect(anilistFetch).toHaveBeenCalledTimes(1); // Validated responses survive a new reader or locale.
});

it('does not query already confirmed MAL or AniList scores or replace IMDb', async () => {
  const existing = { anilistScore: 88, anilistId: 101, imdbRating: '8.6', imdbId: 'tt123' };
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: { 'tv:1': existing, 'tv:2': { malScore: 8.5 } }, events: [] });
  expect((await getWeeklyAnimeScores('2026-42')).titles['tv:1']).toEqual(existing);
  expect(anilistFetch).not.toHaveBeenCalled();
  expect(mergeAnimeRatings({ imdbRating: '8.6', imdbId: 'tt123' }, { anilistScore: 88, anilistId: 101, imdbRating: '1', animeStatus: 'ready' })).toEqual({ imdbRating: '8.6', imdbId: 'tt123', anilistScore: 88, anilistId: 101, animeStatus: 'ready' });
  expect(mergeAnimeRatings(existing, { anilistScore: null, animeStatus: 'error' })).toEqual(existing);
});

it('keeps upstream errors retryable and distinct from genuinely unrated anime', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ errors: [{ message: 'Rate limit reached' }] }));
  const first = await GET(new Request('https://example.test/api/weekly-ratings?week=2026-42'));
  expect(first.headers.get('cache-control')).toBe('no-store');
  expect(await first.json()).toMatchObject({ unavailable: true, titles: { 'tv:1': { animeStatus: 'error' } } });
  vi.mocked(anilistFetch).mockImplementation(async (url, init) => response(url, init));
  expect((await getWeeklyAnimeScores('2026-42')).titles['tv:1'].anilistScore).toBe(81);
  expect(anilistFetch).toHaveBeenCalledTimes(2);
});

it('never assigns a later season or a tied adaptation just because its base title matches', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: {
    s0_0: { media: [{ ...candidate(1), title: { english: 'Show 1 Season 2' } }] },
    s1_0: { media: [candidate(2), { ...candidate(2), id: 500 }] },
  } }));
  const result = await getWeeklyAnimeScores('2026-42');
  expect(result.titles['tv:1']).toEqual({ animeStatus: 'unmatched' });
  expect(result.titles['tv:2']).toEqual({ animeStatus: 'unmatched' });
  expect(result.unavailable).toBe(false);
});

it('matches a remake year label while rejecting the older adaptation and later season', async () => {
  vi.mocked(getWeeklyRatingSources).mockResolvedValue([{ kind: 'tv', id: 259140, title: 'Ranma ½', originalTitle: 'らんま1/2', year: 2024 }]);
  const original = { ...candidate(1), id: 210, title: { english: 'Ranma ½', native: 'らんま1/2' }, startDate: { year: 1989 } };
  const remake = { ...candidate(1), id: 178533, title: { english: 'Ranma ½ (2024)', native: 'らんま1/2 (2024)' }, startDate: { year: 2024 } };
  const sequel = { ...remake, id: 185731, title: { english: 'Ranma ½ (2024) Season 2' }, startDate: { year: 2025 } };
  vi.mocked(anilistFetch).mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({ data: Object.fromEntries(Object.keys(body.variables).map(key => [key, { media: [original, remake, sequel] }])) });
  });
  expect((await getWeeklyAnimeScores('2026-42')).titles['tv:259140']).toMatchObject({ anilistId: 178533, anilistScore: 81, animeStatus: 'ready' });
});

it('keeps exact source IDs without inventing a score for announced titles', async () => {
  vi.mocked(getWeeklyRatingSources).mockResolvedValue([source(1)]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { s0_0: { media: [{ ...candidate(1), averageScore: null }] } } }));
  expect((await getWeeklyAnimeScores('2026-42')).titles['tv:1']).toEqual({ anilistId: 101, malId: 201, animeStatus: 'unavailable' });
});

it('rejects invalid scores instead of caching them as n/a', async () => {
  vi.mocked(getWeeklyRatingSources).mockResolvedValue([source(1)]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { s0_0: { media: [{ ...candidate(1), averageScore: 101 }] } } }));
  expect((await getWeeklyAnimeScores('2026-42')).unavailable).toBe(true);
  vi.mocked(anilistFetch).mockImplementation(async (url, init) => response(url, init));
  expect((await getWeeklyAnimeScores('2026-42')).titles['tv:1'].anilistScore).toBe(81);
  expect(anilistFetch).toHaveBeenCalledTimes(2);
});

it('bounds 40-title recovery with two workers and retains successes when another batch fails', async () => {
  vi.mocked(getWeeklyRatingSources).mockResolvedValue(Array.from({ length: 40 }, (_, i) => source(i + 1)));
  vi.mocked(anilistFetch).mockImplementation(async (url, init) => {
    const variables = JSON.parse(String(init?.body)).variables;
    if (variables.s0_0 === 'Show 1') return response(url, init);
    throw new Error('offline');
  });
  const result = await getWeeklyAnimeScores('2026-42');
  expect(Object.keys(result.titles)).toHaveLength(40);
  expect(result.titles['tv:1'].anilistScore).toBe(81);
  expect(result.titles['tv:5'].animeStatus).toBe('error');
  expect(result.unavailable).toBe(true);
  expect(anilistFetch).toHaveBeenCalledTimes(10);
});

it('shows loading and failure states instead of falsely reporting that AniList has no score', () => {
  const loading = renderToStaticMarkup(React.createElement(AnimeRatingTile, { title: 'Show', ratings: {}, locale: 'it', pending: true }));
  expect(loading).toContain('Caricamento dei voti');
  expect(loading).not.toContain('n/a');
  const failed = renderToStaticMarkup(React.createElement(AnimeRatingTile, { title: 'Show', ratings: { animeStatus: 'error' }, locale: 'it' }));
  expect(failed).toContain('Non recuperato');
  expect(failed).not.toContain('n/a');
});

it('validates the requested week and exposes only completed recovery responses to the CDN', async () => {
  expect((await GET(new Request('https://example.test/api/weekly-ratings?week=wrong'))).status).toBe(400);
  expect(getWeeklyRatingSources).not.toHaveBeenCalled();
  const result = await GET(new Request('https://example.test/api/weekly-ratings?week=2026-42'));
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300');
});
