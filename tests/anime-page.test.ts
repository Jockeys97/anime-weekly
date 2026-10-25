vi.mock('../lib/episode-data', () => ({ getAnimeEpisodes: vi.fn(async () => []) }));
vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('../lib/discovery-data', () => ({ getSimilarAnime: vi.fn(async () => []) }));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeek: vi.fn().mockResolvedValue(null), getSeoWeeks: vi.fn().mockResolvedValue([]), getAnimeWeekAppearances: vi.fn().mockResolvedValue([]) }));
vi.mock('../lib/synopsis', () => ({ getSynopsis: vi.fn() }));
vi.mock('../lib/anilist-snapshot', () => ({ findSnapshotAnime: vi.fn().mockResolvedValue(null) }));
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, permanentRedirect: (url: string) => { throw new Error(`redirect308:${url}`); } }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn(), getSeasonFamily: vi.fn().mockResolvedValue([]), animeName: () => 'Example anime', animeDescription: (value: string | null) => (value || '').replace(/<[^>]*>/g, '') }));
vi.mock('../lib/myanimelist', () => ({ getMyAnimeListScore: vi.fn() }));
vi.mock('../lib/ratings-store', () => ({ readRatingsStore: async () => ({ ratings: {}, sources: {} }) }));
vi.mock('../lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: async () => ({ titles: {}, events: [] }) }));
vi.mock('../lib/tmdb', () => ({ getAnimeAvailability: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { findSnapshotAnime } from '../lib/anilist-snapshot';
import { getSynopsis } from '../lib/synopsis';
beforeEach(() => {
  vi.mocked(findSnapshotAnime).mockResolvedValue(null);
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: null, language: null, source: null });
  vi.mocked(getAnimeAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
});
import { getMyAnimeListScore } from '../lib/myanimelist';
import { getAnimeAvailability } from '../lib/tmdb';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';
import { renderToStaticMarkup } from 'react-dom/server';
import AnimePage, { generateMetadata, revalidate } from '../app/[locale]/anime/[id]/page';
import { AnimeDetailView } from '../components/AnimeDetailView';
import { AnimeWeekLinks } from '../components/AnimeWeekLinks';
import { getAnimeWeekAppearances } from '../lib/weekly-seo-data';

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it('omits optional week links when the membership lookup fails', async () => {
  vi.mocked(getAnimeWeekAppearances).mockRejectedValue(new Error('Weekly source unavailable'));
  expect(await AnimeWeekLinks({ id: 185874, locale: 'it' })).toBeNull();
});

function textInTree(node: unknown, text: string): boolean {
  if (node === text) return true;
  if (Array.isArray(node)) return node.some(child => textInTree(child, text));
  if (React.isValidElement<{ children?: unknown; original?: string; anime?: { description?: string } }>(node)) return (node.props.anime as { title?: { english?: string } })?.title?.english === text || node.props.original === text || node.props.anime?.description === text || textInTree(node.props.children, text);
  return false;
}
describe('server-rendered anime details', () => {
  it('returns resolved ratings together with the core page', async () => {
    vi.stubGlobal('React', React);
    vi.mocked(getAnime).mockResolvedValue({ id: 21, idMal: 123, title: { english: 'Example anime', romaji: null, native: null }, coverImage: null, bannerImage: null, description: 'Example synopsis', startDate: null, episodes: 12, format: 'TV', status: 'FINISHED', genres: [], averageScore: 81, stats: { scoreDistribution: [{ amount: 10 }, { amount: 20 }] }, studios: null, season: null, seasonYear: null });
    vi.mocked(getMyAnimeListScore).mockResolvedValue({ malId: 123, malScore: 8.12, malStatus: 'ready' });
    vi.mocked(getAnimeAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
    const page = await AnimePage({ params: Promise.resolve({ id: '21-example-anime' }) });
    expect(textInTree(page, 'Example anime')).toBe(true);
    expect(page.props.children[2].props.anime).not.toHaveProperty('description');
    expect(page.props.children[2].props.anime).not.toHaveProperty('stats');
    expect(page.props.children[2].props.anime).not.toHaveProperty('recommendations');
    expect(page.props.children[2].props.synopsis.props.original).toBe('Example synopsis');
    const view = page.props.children[2];
    const presentation = renderToStaticMarkup(React.createElement(StreamingCountryProvider, null, React.createElement(AnimeDetailView, { ...view.props, synopsis: null, imdb: null, ratings: view.props.ratings, availability: null })));
    expect(presentation).toContain('Example anime');
    expect(presentation).toContain('Episodi');
    expect(presentation).toContain('81%');
    expect(presentation).toContain('8.12');
    expect(presentation).not.toContain('Caricamento dei voti…');
    expect(presentation).toContain('https://anilist.co/anime/21/');
    const french = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'fr' } as React.ComponentProps<typeof LocaleProvider>, React.createElement(StreamingCountryProvider, null, React.createElement(AnimeDetailView, { ...view.props, synopsis: null, imdb: null, ratings: null, availability: null }))));
    expect(french).toContain('lang="fr"');
    expect(french).toContain('Épisodes');
    const structured = page.props.children[0].props.data;
    expect(structured).toMatchObject({ '@type': 'TVSeries', aggregateRating: { ratingValue: 81, bestRating: 100, ratingCount: 30 } });
    expect(getMyAnimeListScore).toHaveBeenCalledTimes(1);
    expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
  }, 1000);
  it('rejects invalid IDs before starting enrichment', async () => {
    await expect(AnimePage({ params: Promise.resolve({ id: 'bad' }) })).rejects.toThrow('not-found');
    expect(getAnime).not.toHaveBeenCalled();
    expect(getMyAnimeListScore).not.toHaveBeenCalled();
    expect(getAnimeAvailability).not.toHaveBeenCalled();
  });
});

it('generates detail SEO with the existing cached availability loader', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime', romaji: null, native: null }, description: 'Example synopsis', coverImage: { large: 'https://s4.anilist.co/cover.jpg', extraLarge: null, color: null } } as Awaited<ReturnType<typeof getAnime>>);
  const metadata = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime' }) });
  expect(metadata.title).toEqual({ absolute: 'Example anime – dove vederlo e data di uscita' });
  expect(metadata.description).toBe('Calendario uscite, episodi, piattaforme streaming e voti IMDb/MAL.');
  expect(metadata.alternates?.canonical).toMatch(/\/anime\/21-example-anime$/);
  expect(metadata.openGraph).toMatchObject({ images: [{ url: 'https://s4.anilist.co/cover.jpg' }] });
  expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
  expect(getMyAnimeListScore).not.toHaveBeenCalled();
  expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
  expect(revalidate).toBe(86400);
});

it.each([null, NaN, -1, 101])('omits unavailable or invalid aggregate ratings (%s)', async score => {
  vi.stubGlobal('React', React);
  vi.mocked(getAnime).mockResolvedValue({ id: 21, idMal: null, title: { english: 'Example anime', romaji: null, native: null }, description: null, coverImage: null, startDate: null, averageScore: score, format: 'MOVIE', genres: [], bannerImage: null, episodes: null, status: 'FINISHED', studios: null, season: null, seasonYear: null } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getMyAnimeListScore).mockResolvedValue({});
  vi.mocked(getAnimeAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
  const page = await AnimePage({ params: Promise.resolve({ id: '21-example-anime' }) });
  const structured = page.props.children[0].props.data;
  expect(structured['@type']).toBe('Movie');
  expect(structured).not.toHaveProperty('aggregateRating');
});

it('limits metadata to a clean bounded synopsis', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime', romaji: null, native: null }, description: `<b>${'Trama italiana '.repeat(30)}</b>`, coverImage: null } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: `<b>${'Trama italiana '.repeat(30)}</b>`, language: 'it', source: 'tmdb' });
  const meta = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime' }) });
  expect(meta.description!.length).toBeLessThanOrEqual(160);
  expect(meta.description).toMatch(/…$/);
  expect(meta.description).not.toContain('<');
});

it('renders all published titles below a localized H1 and deduplicates equal aliases', async () => {
  vi.stubGlobal('React', React);
  const anime = { id: 21, title: { english: 'English title', romaji: 'Romaji title', native: '日本語' }, genres: [], format: 'TV' } as unknown as NonNullable<Awaited<ReturnType<typeof getAnime>>>;
  const props = { anime, localizedNames: { fr: 'Titre français' }, synopsis: null, imdb: null, ratings: null, availability: null };
  const render = (titles: typeof anime.title) => renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'fr' } as React.ComponentProps<typeof LocaleProvider>, React.createElement(AnimeDetailView, { ...props, anime: { ...anime, title: titles } })));
  const html = render(anime.title);
  expect(html).toContain('<h1>Titre français</h1><p class="catalog-intro">Aussi connu sous le nom de: English title · Romaji title · 日本語</p>');
  const duplicate = render({ english: 'English title', romaji: ' english TITLE ', native: '日本語' });
  expect(duplicate).toContain('<p class="catalog-intro">Aussi connu sous le nom de: English title · 日本語</p>');
  expect(duplicate).not.toContain('english TITLE');
});

it('shares factual Italian metadata with Open Graph and Twitter without changing the canonical', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime' }, format: 'MOVIE', startDate: { year: 2026 }, averageScore: 81 } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: '<b>Una storia italiana.</b>', language: 'it', source: 'tmdb' });
  vi.mocked(getAnimeAvailability).mockResolvedValue({
    match: { id: 42, kind: 'movie' }, ratings: {}, providersUnavailable: false,
    providers: { IT: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } },
  });
  const meta = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime' }) });
  const title = 'Example anime MOVIE – dove vederlo e data di uscita';
  expect(meta.title).toEqual({ absolute: title });
  expect(meta.description).toContain('AniList 8,1/10. MOVIE. Una storia italiana.');
  expect(meta.description!.length).toBeLessThanOrEqual(160);
  expect(meta.openGraph).toMatchObject({ title, description: meta.description });
  expect(meta.twitter).toMatchObject({ title, description: meta.description });
  expect(meta.alternates?.canonical).toMatch(/\/anime\/21-example-anime$/);
  expect(getMyAnimeListScore).not.toHaveBeenCalled();
  expect(getAnimeAvailability).toHaveBeenCalledTimes(1);
});

it('keeps metadata available on a provider failure and excludes the English synopsis', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime' }, format: 'ONA', averageScore: 75 } as Awaited<ReturnType<typeof getAnime>>);
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: 'English story.', language: 'en', source: 'tmdb' });
  vi.mocked(getAnimeAvailability).mockRejectedValue(new Error('Provider unavailable'));
  const meta = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime' }) });
  expect(meta.description).toContain('AniList 7,5/10.');
  expect(meta.description).not.toContain('English story.');
});


it.each(['cyberpunk-edgerunners-2', '0', '-1', '1.5', '9007199254740992'])('rejects invalid anime ID %s in metadata before streaming', async id => {
  await expect(generateMetadata({ params: Promise.resolve({ id }) })).rejects.toThrow('not-found');
  expect(getAnime).not.toHaveBeenCalled();
});

it('returns not-found for a missing numeric anime in both metadata and page', async () => {
  vi.mocked(getAnime).mockResolvedValue(null);
  const props = { params: Promise.resolve({ id: '999999' }) };
  await expect(generateMetadata(props)).rejects.toThrow('not-found');
  await expect(AnimePage(props)).rejects.toThrow('not-found');
  expect(getSynopsis).not.toHaveBeenCalled();
});

it('soft-fails AniList failures in metadata and page instead of returning not-found or throwing', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')));
  vi.mocked(getAnime).mockRejectedValue(new Error('Anime details unavailable'));
  const props = { params: Promise.resolve({ id: '21-example-anime' }) };
  expect((await generateMetadata(props)).robots).toEqual({ index: false, follow: true });
  // No inherited homepage canonical/hreflang on a soft page.
  expect((await generateMetadata(props)).alternates).toBeNull();
  await expect(AnimePage(props)).resolves.toBeTruthy();
  expect(getSynopsis).not.toHaveBeenCalled();
  expect(getAnimeAvailability).not.toHaveBeenCalled();
});

it.each(['outage', 'not-found'])('renders saved anime in metadata and page on live %s', async failure => {
  vi.stubGlobal('React', React);
  if (failure === 'outage') vi.mocked(getAnime).mockRejectedValue(new Error('Anime details unavailable'));
  else vi.mocked(getAnime).mockResolvedValue(null);
  const { anime } = await import('./fixtures/anilist-snapshot');
  vi.mocked(findSnapshotAnime).mockResolvedValue(anime);
  const props = { params: Promise.resolve({ id: '21-example-anime' }) };
  const metadata = await generateMetadata(props);
  expect(metadata.title).toMatchObject({ absolute: expect.stringContaining('Example anime') });
  const page = await AnimePage(props);
  expect(page.props.children[2].props.anime).toMatchObject({ id: anime.id, title: anime.title, episodes: anime.episodes });
  expect(page.props.children[2].props.anime).not.toHaveProperty('description');
});

it.each([true, false])('shares the Italian description between metadata and JSON-LD (localized: %s)', async localized => {
  vi.stubGlobal('React', React);
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime' }, description: 'English synopsis', genres: [], format: 'TV' } as unknown as Awaited<ReturnType<typeof getAnime>>);
  if (localized) vi.mocked(getSynopsis).mockResolvedValue({ synopsis: '<b>Una trama italiana.</b>', language: 'it', source: 'tmdb' });
  vi.mocked(getMyAnimeListScore).mockResolvedValue({ malId: 123, malScore: 8.12, malStatus: 'ready' });
  vi.mocked(getAnimeAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
  const meta = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime' }) });
  const page = await AnimePage({ params: Promise.resolve({ id: '21-example-anime' }) });
  const structured = page.props.children[0].props.data;
  expect(structured.description).toBe(meta.description);
  expect(structured.description).toContain(localized ? 'TV. Una trama italiana.' : 'TV.');
  expect(structured.description).not.toContain('English synopsis');
});

it.each(['it', 'en', 'es', 'fr', 'de', 'pt'] as const)('loads %s synopsis and emits localized detail SEO without client effects', async locale => {
  vi.stubGlobal('React', React);
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime' }, description: 'Original synopsis', format: 'MOVIE', genres: [], season: null, seasonYear: 2026, averageScore: 81 } as unknown as Awaited<ReturnType<typeof getAnime>>);
  const synopsis = `Localized synopsis (${locale}).`;
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis, language: locale, source: 'tmdb' });
  const props = { params: Promise.resolve({ id: '21-example-anime', locale }) };
  const metadata = await generateMetadata(props);
  expect(metadata.description).toContain(synopsis);
  expect(metadata.alternates?.canonical).toMatch(new RegExp(`/${locale === 'it' ? '' : `${locale}/`}anime/21-example-anime$`));
  expect(Object.keys(metadata.alternates!.languages!)).toHaveLength(7);
  expect(metadata.alternates!.languages).toMatchObject({
    it: expect.stringMatching(/\/anime\/21-example-anime$/),
    en: expect.stringMatching(/\/en\/anime\/21-example-anime$/),
    'x-default': expect.stringMatching(/\/anime\/21-example-anime$/),
  });
  const page = await AnimePage(props);
  expect(page.props.children[0].props.data.url).toBe(metadata.alternates!.canonical);
  const view = page.props.children[2];
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale } as React.ComponentProps<typeof LocaleProvider>, React.createElement(StreamingCountryProvider, null, React.createElement(AnimeDetailView, { ...view.props, ratings: null, imdb: null, availability: null }))));
  expect(html).toContain(`lang="${locale}"`);
  expect(html).toContain(synopsis);
  expect(getSynopsis).toHaveBeenCalledWith(['Example anime'], 2026, locale, 'movie', 21);
});

it('renders a short-lived noindex soft page instead of throwing on a transient AniList failure', async () => {
  const fetchMock = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(findSnapshotAnime).mockResolvedValue(null);
  vi.mocked(getAnime).mockRejectedValue(new Error('AniList 429'));
  const params = Promise.resolve({ id: '990001-example-anime', locale: 'es' });
  const metadata = await generateMetadata({ params });
  expect(metadata.robots).toEqual({ index: false, follow: true });
  const html = renderToStaticMarkup(await AnimePage({ params }) as React.ReactElement);
  expect(html).toContain('http-equiv="refresh"');
  expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), { next: { revalidate: 60 } });
});

it('noindexes es/fr/de/pt detail pages without a synopsis in their language, keeping it/en indexable', async () => {
  vi.mocked(getAnime).mockResolvedValue({ id: 21, title: { english: 'Example anime', romaji: null, native: null }, description: 'Example synopsis', coverImage: null } as Awaited<ReturnType<typeof getAnime>>);
  for (const locale of ['it', 'en', 'es', 'fr', 'de', 'pt']) {
    const meta = await generateMetadata({ params: Promise.resolve({ id: '21-example-anime', locale }) });
    expect({ locale, robots: meta.robots }).toEqual({ locale, robots: ['it', 'en'].includes(locale) ? undefined : { index: false, follow: true } });
  }
  vi.mocked(getSynopsis).mockResolvedValue({ synopsis: 'Una historia.', language: 'es', source: 'tmdb' });
  expect((await generateMetadata({ params: Promise.resolve({ id: '21-example-anime', locale: 'es' }) })).robots).toBeUndefined();
});
