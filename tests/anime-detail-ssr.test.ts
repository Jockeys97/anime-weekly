import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { detailDesktopMedia, detailMobileMedia, emptyDetailImage } from '../lib/detail-viewport';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('../lib/anilist', async importOriginal => ({ ...await importOriginal<typeof import('../lib/anilist')>(), getAnime: vi.fn() }));
vi.mock('../lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));
vi.mock('../lib/myanimelist', () => ({ getMyAnimeListScore: vi.fn() }));
vi.mock('../lib/detail-availability', () => ({ getCachedDetailAvailability: vi.fn() }));
vi.mock('../lib/synopsis', () => ({ getSynopsis: vi.fn() }));
vi.mock('../components/DubbingSummary', () => ({ DubbingSummary: () => null }));
import { getAnime, type AniListAnime } from '../lib/anilist';
import { readRatingsStore } from '../lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '../lib/weekly-ratings';
import { getMyAnimeListScore } from '../lib/myanimelist';
import { getCachedDetailAvailability } from '../lib/detail-availability';
import { getSynopsis } from '../lib/synopsis';
import { getAnimeDetailData } from '../lib/anime-detail-data';
import AnimePage, { revalidate } from '../app/[locale]/anime/[id]/page';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';

const anime = { id: 42, idMal: 123, title: { english: 'Example', romaji: null, native: null }, format: 'MOVIE', startDate: { year: 2026, month: null, day: null }, seasonYear: 2026, description: 'English original', averageScore: 81, genres: [] } as unknown as AniListAnime;
const empty = { match: null, ratings: {}, providers: {}, providersUnavailable: true };
const stored = (values: object) => ({ values, fetchedAt: Date.now(), lastSeenAt: Date.now() });
const render = async () => renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, await AnimePage({ params: Promise.resolve({ id: '42-example' }) })));
beforeEach(() => {
  vi.mocked(getAnime).mockResolvedValue(anime);
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(getMyAnimeListScore).mockResolvedValue({ malId: 123, malScore: 8.12, malStatus: 'ready' });
  vi.mocked(getCachedDetailAvailability).mockResolvedValue({ ...empty, match: { id: 10, kind: 'movie' }, ratings: { imdbId: 'tt123', imdbRating: '8.4', imdbStatus: 'ready' }, providers: { IT: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } }, providersUnavailable: false });
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: 'Una trama italiana.', language: 'it', source: 'tmdb' });
});
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });

it('renders all main data in server HTML without executing client effects', async () => {
  const html = await render();
  for (const value of ['8.12', '8.4', '81%', 'Netflix', 'Una trama italiana.']) expect(html).toContain(value);
  for (const pending of ['Caricamento dei voti', 'Caricamento della disponibilità', 'Caricamento della trama tradotta']) expect(html).not.toContain(pending);
  expect(revalidate).toBe(86400);
  expect(getSynopsis).toHaveBeenCalledWith(['Example'], 2026, 'it', 'movie', 42);
});

it('uses weekly MAL/IMDb precomputation without another MAL request', async () => {
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: { 'movie:10': { anilistId: 42, malId: 123, malScore: 8.3, imdbId: 'tt123', imdbRating: '8.6', anilistScore: 70 } }, events: [] });
  vi.mocked(getCachedDetailAvailability).mockResolvedValue(empty);
  const result = await getAnimeDetailData(anime);
  expect(result.ratings.malScore).toBe(8.3);
  expect(result.ratings.anilistScore).toBe(81);
  expect(result.availability.ratings.imdbRating).toBe('8.6');
  expect(getMyAnimeListScore).not.toHaveBeenCalled();
});

it('reads retained cross-week scores by exact IDs and preserves confirmed IMDb season identity', async () => {
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: { 'mal:123': stored({ malScore: 8.5 }), 'imdb:tt456': stored({ imdbRating: '9.1' }) }, sources: { 'movie:10': { anilistId: 42, imdbId: 'tt456', fetchedAt: Date.now(), lastSeenAt: Date.now() } } });
  const result = await getAnimeDetailData(anime);
  expect(result.ratings.malScore).toBe(8.5);
  expect(result.availability.ratings.imdbId).toBe('tt123');
  expect(result.availability.ratings.imdbRating).toBe('8.4');
  expect(getMyAnimeListScore).not.toHaveBeenCalled();
});

it('does not use a different MAL season or expired stored score', async () => {
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: { 'movie:10': { anilistId: 42, malId: 999, malScore: 9 } }, events: [] });
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: { 'mal:123': { ...stored({ malScore: 9.5 }), fetchedAt: 0 } }, sources: {} });
  expect((await getAnimeDetailData(anime)).ratings.malScore).toBe(8.12);
  expect(getMyAnimeListScore).toHaveBeenCalledWith(123);
});

it('bounds stalled sources and renders settled fallbacks with a labelled original', async () => {
  vi.useFakeTimers();
  const never = new Promise<never>(() => {});
  vi.mocked(getMyAnimeListScore).mockReturnValue(never);
  vi.mocked(getCachedDetailAvailability).mockReturnValue(never);
  vi.mocked(getSynopsis).mockReturnValue(never);
  const html = render();
  await vi.advanceTimersByTimeAsync(2600);
  const result = await html;
  expect(result).toContain('n/d');
  expect(result).toContain('English original');
  expect(result).toContain('Traduzione non disponibile');
  expect(result).not.toContain('Caricamento');
});

it('keeps client language selection while reusing the Italian server translation on return', async () => {
  const page = await AnimePage({ params: Promise.resolve({ id: '42-example' }) });
  const localized = (locale: 'it' | 'en' | 'es') => renderToStaticMarkup(React.createElement(LocaleProvider, { locale } as React.ComponentProps<typeof LocaleProvider>, React.createElement(StreamingCountryProvider, null, page))).split('<main')[1];
  expect(localized('it')).toContain('Una trama italiana.');
  expect(localized('en')).toContain('English original');
  expect(localized('en')).not.toContain('Una trama italiana.');
  expect(localized('es')).not.toContain('Una trama italiana.');
  expect(localized('it')).toContain('Una trama italiana.');
});

it.each(['bad', '0', '-1'])('retains invalid ID rejection (%s)', async id => {
  await expect(AnimePage({ params: Promise.resolve({ id }) })).rejects.toThrow('not-found');
  expect(getAnime).not.toHaveBeenCalled();
});

import { AnimeDetailView } from '../components/AnimeDetailView';
import { animeIntro } from '../lib/anime-seo';
it('renders exactly one episode H1 followed by the factual localized intro', () => {
  const next = { ...anime, format: 'TV', season: 'FALL', nextAiringEpisode: { episode: 3, airingAt: Date.parse('2026-10-25T23:30:00Z') / 1000 } };
  const intro = animeIntro(next, { imdbRating: '8.4', malScore: 8.12 }, 'it');
  const view = React.createElement(AnimeDetailView, { anime: next, intro, synopsis: null, imdb: null, ratings: null, availability: null });
  const html = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, view));
  expect(html.match(/<h1[ >]/g)).toHaveLength(1);
  expect(html).toContain('<h1>Example episodio 3: data di uscita e voti</h1><p class="catalog-intro">');
  expect(html).toContain('26 ottobre 2026');
  expect(html).toContain('Europe/Rome');
  for (const source of ['IMDb', 'MyAnimeList', 'AniList']) expect(intro).toContain(source);
});


it('prioritizes the displayed CDN cover without lazy loading or extra transformations', () => {
  const coverImage = { large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/example.jpg', extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/example.jpg', color: null };
  const view = React.createElement(AnimeDetailView, { anime: { ...anime, coverImage }, synopsis: null, imdb: null, ratings: null, availability: null });
  const html = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, view));
  const cover = html.match(/<img[^>]+alt="Example"[^>]*>/)?.[0];
  expect(cover).toBeDefined();
  expect(cover).toContain(`src="${coverImage.large}"`);
  expect(cover).toContain('loading="eager"');
  expect(cover).toMatch(/fetchPriority="high"/i);
  expect(html).toContain(`srcSet="${coverImage.large} 230w, ${coverImage.extraLarge} 460w"`);
  expect(html).toContain('sizes="(max-width: 600px) 160px, 220px"');
  expect(cover).not.toContain('/_next/image');
  expect(cover).not.toContain('loading="lazy"');
});

it('serves the banner only on desktop and preloads the mobile cover without hydration-dependent requests', () => {
  const bannerImage = 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg';
  const coverImage = { large: 'https://s4.anilist.co/cover.jpg', extraLarge: null, color: null };
  const view = React.createElement(AnimeDetailView, { anime: { ...anime, bannerImage, coverImage }, synopsis: null, imdb: null, ratings: null, availability: null });
  const html = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, view));
  const banner = html.match(/<img[^>]+alt=""[^>]*>/)?.[0];
  const cover = html.match(/<img[^>]+alt="Example"[^>]*>/)?.[0];
  expect(banner).toContain(`src="${emptyDetailImage}"`);
  expect(banner).not.toContain(bannerImage);
  expect(html).toContain(`<picture><source media="${detailDesktopMedia}" srcSet="${bannerImage}"/>`);
  const preload = html.match(/<link[^>]+media="\(max-width: 720px\)"[^>]*>/)?.[0];
  expect(preload).toContain(`href="${coverImage.large}"`);
  expect(preload).toContain('rel="preload"');
  expect(preload).toMatch(/fetchPriority="high"/i);
  expect(html).not.toMatch(new RegExp(`<link[^>]+href="${bannerImage}"`));
  expect(banner).toContain('loading="eager"');
  expect(banner).toContain('sizes="100vw"');
  expect(banner).toMatch(/fetchPriority="high"/i);
  expect(banner).not.toContain('/_next/image');
  expect(cover).toContain('loading="eager"');
  expect(cover).toMatch(/fetchPriority="auto"/i);
  // React may also emit a preload link for the same high-priority resource.
  expect(html.match(/<img\b[^>]*fetchPriority="high"[^>]*>/gi)).toHaveLength(1);
});


it('uses the responsive cover candidates for the early mobile preload', () => {
  const coverImage = { large: 'https://s4.anilist.co/medium.jpg', extraLarge: 'https://s4.anilist.co/large.jpg', color: null };
  const view = React.createElement(AnimeDetailView, { anime: { ...anime, bannerImage: 'https://s4.anilist.co/banner.jpg', coverImage }, synopsis: null, imdb: null, ratings: null, availability: null });
  const html = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, view));
  const preload = html.match(/<link[^>]+media="\(max-width: 720px\)"[^>]*>/)?.[0];
  expect(preload).toContain(`imageSrcSet="${coverImage.large} 230w, ${coverImage.extraLarge} 460w"`);
  expect(preload).toContain('imageSizes="(max-width: 600px) 160px, 220px"');
});

it.each([true, false])('keeps the trailer from downloading the banner on mobile (cover: %s)', hasCover => {
  const bannerImage = 'https://s4.anilist.co/banner.jpg';
  const cover = 'https://s4.anilist.co/cover.jpg';
  const view = React.createElement(AnimeDetailView, { anime: { ...anime, bannerImage, coverImage: hasCover ? { large: cover, extraLarge: null, color: null } : null, trailer: { site: 'youtube', id: 'vPBU0xBjFFY' } }, synopsis: null, imdb: null, ratings: null, availability: null });
  const html = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, view));
  expect(html.match(/<source[^>]+srcSet="https:\/\/s4.anilist.co\/banner.jpg"[^>]*>/g)).toHaveLength(2);
  for (const tag of html.match(/<(?:img|link)\b[^>]*>/g) ?? []) expect(tag).not.toContain(bannerImage);
  const trailer = html.match(/<picture><source[^>]+banner.jpg[^>]*\/><img[^>]*>/g)?.at(-1);
  expect(trailer).toContain(`src="${hasCover ? cover : emptyDetailImage}"`);
});

it('hides the banner at the picture breakpoint and reserves cover space before loading', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  expect(css).toContain(`@media${detailMobileMedia.replaceAll(' ', '')}{.anime-banner{display:none}}`);
  expect(css).toMatch(/\.poster\{[^}]*aspect-ratio:2\/3/);
  expect(css).toMatch(/\.anime-detail\{grid-template-columns:220px/);
  expect(css).toContain('.anime-detail>.poster{width:160px}');
});
