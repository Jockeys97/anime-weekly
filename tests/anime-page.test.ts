vi.mock('../lib/synopsis', () => ({ getSynopsis: async () => ({ synopsis: null, language: null, source: null }) }));
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), getSeasonFamily: vi.fn().mockResolvedValue([]), animeName: () => 'Example anime', animeDescription: (value: string | null) => (value || '').replace(/<[^>]*>/g, '') }));
vi.mock('../lib/anime-ratings', () => ({ getAnimeRatingsById: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getAnimeAvailability: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getAnimeRatingsById } from '../lib/anime-ratings';
import { getAnimeAvailability } from '../lib/tmdb';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimePage, { generateMetadata, generateStaticParams, dynamicParams, revalidate } from '../app/anime/[id]/page';
import { AnimeDetailView } from '../components/AnimeDetailView';

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

function textInTree(node: unknown, text: string): boolean {
  if (node === text) return true;
  if (Array.isArray(node)) return node.some(child => textInTree(child, text));
  if (React.isValidElement<{ children?: unknown; original?: string; anime?: { description?: string } }>(node)) return (node.props.anime as { title?: { english?: string } })?.title?.english === text || node.props.original === text || node.props.anime?.description === text || textInTree(node.props.children, text);
  return false;
}
describe('progressive anime details', () => {
  it('returns the core page while ratings and streaming are still pending', async () => {
    vi.stubGlobal('React', React);
    vi.mocked(getAnime).mockResolvedValue({ id: 21, idMal: 123, title: { english: 'Example anime', romaji: null, native: null }, coverImage: null, bannerImage: null, description: 'Example synopsis', startDate: null, episodes: 12, format: 'TV', status: 'FINISHED', genres: [], averageScore: 81, stats: { scoreDistribution: [{ amount: 10 }, { amount: 20 }] }, studios: null, season: null, seasonYear: null });
    vi.mocked(getAnimeRatingsById).mockReturnValue(new Promise(() => {}));
    vi.mocked(getAnimeAvailability).mockReturnValue(new Promise(() => {}));
    const page = await AnimePage({ params: Promise.resolve({ id: '21' }) });
    expect(textInTree(page, 'Example anime')).toBe(true);
    expect(page.props.children[1].props.anime.description).toBe('Example synopsis');
    const view = page.props.children[1];
    function PendingRating(): React.ReactNode { throw new Promise(() => {}); }
    const presentation = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, React.createElement(AnimeDetailView, { ...view.props, synopsis: null, imdb: null, ratings: React.createElement(PendingRating), availability: null })));
    expect(presentation).toContain('Example anime');
    expect(presentation).toContain('Episodi');
    expect(presentation).toContain('81%');
    expect(presentation).toContain('https://anilist.co/anime/21/');
    const french = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'fr' } as React.ComponentProps<typeof LocaleProvider>, React.createElement(StreamingCountryProvider, null, React.createElement(AnimeDetailView, { ...view.props, synopsis: null, imdb: null, ratings: null, availability: null }))));
    expect(french).toContain('lang="fr"');
    expect(french).toContain('Épisodes');
    const structured = JSON.parse(page.props.children[0].props.dangerouslySetInnerHTML.__html);
    expect(structured).toMatchObject({ '@type': 'TVSeries', aggregateRating: { ratingValue: 81, bestRating: 100, ratingCount: 30 } });
    expect(getAnimeRatingsById).toHaveBeenCalledTimes(1);
    expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
  }, 1000);
  it('rejects invalid IDs before starting enrichment', async () => {
    await expect(AnimePage({ params: Promise.resolve({ id: 'bad' }) })).rejects.toThrow('not-found');
    expect(getAnime).not.toHaveBeenCalled();
    expect(getAnimeRatingsById).not.toHaveBeenCalled();
    expect(getAnimeAvailability).not.toHaveBeenCalled();
  });
});

it('generates detail SEO from cached anime data without enrichment', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime', romaji: null, native: null }, description: 'Example synopsis', coverImage: { large: 'https://s4.anilist.co/cover.jpg', extraLarge: null, color: null } } as Awaited<ReturnType<typeof getAnime>>);
  const metadata = await generateMetadata({ params: Promise.resolve({ id: '21' }) });
  expect(metadata.title).toBe('Example anime');
  expect(metadata.description).toBe('Example synopsis');
  expect(metadata.alternates?.canonical).toMatch(/\/anime\/21$/);
  expect(metadata.openGraph).toMatchObject({ images: [{ url: 'https://s4.anilist.co/cover.jpg' }] });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  expect(getAnimeRatingsById).not.toHaveBeenCalled();
  expect(getAnimeAvailability).not.toHaveBeenCalled();
  expect(generateStaticParams()).toEqual([]);
  expect(dynamicParams).toBe(true);
  expect(revalidate).toBe(86400);
});

it.each([null, NaN, -1, 101])('omits unavailable or invalid aggregate ratings (%s)', async score => {
  vi.stubGlobal('React', React);
  vi.mocked(getAnime).mockResolvedValue({ id: 21, idMal: null, title: { english: 'Example anime', romaji: null, native: null }, description: null, coverImage: null, startDate: null, averageScore: score, format: 'MOVIE', genres: [], bannerImage: null, episodes: null, status: 'FINISHED', studios: null, season: null, seasonYear: null } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getAnimeRatingsById).mockResolvedValue({});
  vi.mocked(getAnimeAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
  const page = await AnimePage({ params: Promise.resolve({ id: '21' }) });
  const structured = JSON.parse(page.props.children[0].props.dangerouslySetInnerHTML.__html);
  expect(structured['@type']).toBe('Movie');
  expect(structured).not.toHaveProperty('aggregateRating');
});

it('limits metadata to a clean 155-character synopsis', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime', romaji: null, native: null }, description: `<b>${'Trama italiana '.repeat(30)}</b>`, coverImage: null } as Awaited<ReturnType<typeof getAnime>>);
  const meta = await generateMetadata({ params: Promise.resolve({ id: '21' }) });
  expect(meta.description).toHaveLength(155);
  expect(meta.description).not.toContain('<');
});
