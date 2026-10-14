import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/tmdb', () => ({ getAnimeAvailability: vi.fn() }));
vi.mock('../lib/imdb', () => ({ getImdbScore: vi.fn(), hasImdbScore: () => false }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), getSeasonFamily: vi.fn().mockResolvedValue([]), animeName: (a: { title: { english: string } }) => a.title.english }));
const country = vi.hoisted(() => ({ region: 'US' }));
vi.mock('../components/StreamingCountry', () => ({ useStreamingCountry: () => country }));
vi.mock('../components/ProviderLink', () => ({ ProviderLink: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children) }));
import { getVerifiedTitleLinks } from '../lib/verified-title-links';
import { getDetailAvailability, findSeasonSeries, seriesBaseTitle } from '../lib/detail-availability';
import { getImdbScore } from '../lib/imdb';
import { getAnimeAvailability } from '../lib/tmdb';
import { getAnime, getSeasonFamily, type AniListAnime } from '../lib/anilist';
import { StreamingAvailability } from '../components/StreamingAvailability';
import { GET } from '../app/api/anime-card/[id]/route';

const first = { id: 190327, format: 'ONA', title: { english: "STEEL BALL RUN JoJo's Bizarre Adventure 1st STAGE", romaji: null, native: null }, startDate: { year: 2026 }, averageScore: 87, relations: { edges: [] } } as unknown as AniListAnime;
const second = { ...first, id: 210482, title: { ...first.title, english: "STEEL BALL RUN JoJo's Bizarre Adventure 2nd - 3rd STAGE" }, relations: { edges: [{ relationType: 'PREQUEL', node: { id: first.id, type: 'ANIME', format: first.format, title: first.title, startDate: first.startDate } }] } } as AniListAnime;
afterEach(() => { vi.resetAllMocks(); country.region = 'US'; });

it.each([first, second])('retains the dedicated IMDb ID and direct Netflix links without a TMDB match ($id)', async anime => {
  vi.mocked(getImdbScore).mockResolvedValue({ imdbId: 'tt38268282', imdbStatus: 'unavailable' });
  const result = await getDetailAvailability(anime);
  expect(result.match).toBeNull();
  expect(result.ratings).toEqual({ imdbId: 'tt38268282', imdbStatus: 'unavailable', imdbSeriesTitle: "Steel Ball Run: JoJo's Bizarre Adventure" });
  expect(result.ratings.imdbRating).toBeUndefined(); // No substitute or estimated IMDb score.
  expect(getImdbScore).toHaveBeenCalledExactlyOnceWith('tt38268282');
  expect(getAnimeAvailability).not.toHaveBeenCalled();
  for (const region of ['US', 'IT'] as const) {
    const offers = result.providers[region];
    expect(offers?.providers[0].provider_name).toBe('Netflix');
    country.region = region;
    const html = renderToStaticMarkup(React.createElement(StreamingAvailability, { anime: { id: 0, kind: 'tv', name: anime.title.english!, providers: result.providers, providersUnavailable: false }, recoveryId: anime.id }));
    expect(html).toContain(offers!.providers[0].watch_url);
    expect(html).not.toContain('/api/watch');
    expect(html).not.toContain('Loading availability');
  }
  expect(Object.keys(result.providers).sort()).toEqual(['IT', 'US']);
});

it('does not assign Steel Ball Run identities to JoJo, manga or another release year', () => {
  expect(getVerifiedTitleLinks({ ...first, id: 14719 })).toBeNull();
  expect(getVerifiedTitleLinks({ ...first, format: 'MOVIE' })).toBeNull();
  expect(getVerifiedTitleLinks({ ...first, startDate: { year: 2012, month: 10, day: 6 } })).toBeNull();
});

it('preserves verified platform offers in card API responses despite match=null', async () => {
  vi.mocked(getAnime).mockResolvedValue(second);
  vi.mocked(getImdbScore).mockResolvedValue({ imdbStatus: 'error' });
  const response = await GET(new Request('https://example.test/api/anime-card/210482'), { params: Promise.resolve({ id: '210482' }) });
  const data = await response.json();
  expect(data.availability.match).toBeNull();
  expect(data.availability.providers.US.providers[0].watch_url).toBe('https://www.netflix.com/title/82116553');
  expect(data.ratings.imdbId).toBe('tt38268282');
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('recognizes ordinal stage ranges, keeps the story title, and stops at its first stage', async () => {
  expect(seriesBaseTitle(second.title.english!)).toBe("STEEL BALL RUN JoJo's Bizarre Adventure");
  expect(seriesBaseTitle('JoJo no Kimyou na Bouken: Steel Ball Run - 2nd & 3rd STAGE')).toBe('JoJo no Kimyou na Bouken: Steel Ball Run');
  expect(seriesBaseTitle('ジョジョの奇妙な冒険 スティール・ボール・ラン 2nd＆3rd STAGE')).toBe('ジョジョの奇妙な冒険 スティール・ボール・ラン');
  expect(seriesBaseTitle('Stagecoach')).toBe('Stagecoach');
  const priorJoJo = { ...first, id: 14719, title: { ...first.title, english: "JoJo's Bizarre Adventure" }, startDate: { year: 2012 } };
  const parent = { ...first, relations: { edges: [{ relationType: 'PREQUEL', node: { ...priorJoJo, type: 'ANIME' } }] } } as AniListAnime;
  vi.mocked(getSeasonFamily).mockResolvedValue([parent]);
  expect(await findSeasonSeries(second)).toEqual(parent);
  expect(getAnime).not.toHaveBeenCalled(); // Never traverses into the old franchise.
});
