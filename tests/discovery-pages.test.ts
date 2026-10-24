vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactNode } from 'react';
import type { AniListAnime } from '@/lib/anilist';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/anilist', () => ({ getAnime: vi.fn(), animeName: (anime: AniListAnime) => anime.title.english }));
vi.mock('@/lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({ it: 'Titolo', en: 'Title', de: 'Titel' }) }));
vi.mock('@/lib/discovery-data', () => ({ getSimilarAnime: vi.fn(), getDiscoveryCatalog: vi.fn(), getGenreLists: vi.fn() }));
vi.mock('@/lib/episode-data', () => ({ getAnimeEpisodes: vi.fn(), getSitemapEpisodes: vi.fn() }));
vi.mock('@/lib/rankings-seo-data', () => ({ getRankingsWeek: vi.fn() }));
vi.mock('@/lib/episode-score', () => ({ getEpisodeIndexedScore: async () => null }));
vi.mock('@/lib/anime-detail-data', () => ({ getAnimeDetailData: async () => ({ availability: { match: null, ratings: {}, providers: {}, providersUnavailable: false } }) }));
import { getAnime } from '@/lib/anilist';
import { getSimilarAnime, getDiscoveryCatalog, getGenreLists } from '@/lib/discovery-data';
import { getAnimeEpisodes, getSitemapEpisodes } from '@/lib/episode-data';
import EpisodePage, { generateMetadata as episodeMetadata } from '@/app/[locale]/anime/[id]/[episode]/page';
import SimilarPage, { generateMetadata as similarMetadata, revalidate as similarRevalidate } from '@/app/[locale]/anime/[id]/similar/page';
import GenrePage, { generateMetadata as genreMetadata } from '@/app/[locale]/best-this-season/[genre]/page';
import { AnimeSimilarBlock, AnimeCurrentRanking } from '@/components/AnimeDiscoveryBlocks';
import { getRankingsWeek } from '@/lib/rankings-seo-data';
import { getDiscoverySitemap } from '@/lib/discovery-sitemap';
import { locales, type Locale } from '@/lib/locales';
import { localePath } from '@/lib/locale-routing';
import { getDictionary } from '@/lib/i18n';
import { LocaleProvider } from '@/components/LanguageSelector';
import { fill } from '@/lib/discovery';

const anime = (id = 1) => ({ id, idMal: id, title: { english: `Anime ${id}`, romaji: null, native: null }, genres: ['Action'], tags: [], averageScore: 80, season: 'FALL', seasonYear: 2026, format: 'TV', coverImage: null, bannerImage: null, description: null, startDate: null, episodes: null, status: null, studios: null }) as AniListAnime;
const row = (id: number) => ({ anime: anime(id), score: 8, genres: ['Action'], votes: 1000, sources: [{ name: 'IMDb', score: 8, votes: 1000, minimum: 1000 }] });
const event = { id: 1, mediaId: 1, episode: 2, airingAt: 1792584000 };
const props = (locale = 'en') => ({ params: Promise.resolve({ id: '1-title', episode: 'episode-2', locale }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAnime).mockResolvedValue(anime());
  vi.mocked(getAnimeEpisodes).mockResolvedValue([event]);
  vi.mocked(getSimilarAnime).mockResolvedValue(Array.from({ length: 5 }, (_, i) => row(i + 2)));
  vi.mocked(getDiscoveryCatalog).mockResolvedValue(Array.from({ length: 6 }, (_, i) => anime(i + 1)));
  vi.mocked(getGenreLists).mockResolvedValue({ season: { year: 2026, season: 'fall' }, media: [], lists: [{ genre: 'Action', items: Array.from({ length: 5 }, (_, i) => row(i + 1)) }] });
  vi.mocked(getSitemapEpisodes).mockResolvedValue([event]);
});
it('builds reciprocal episode canonical and hreflang URLs from published localized names', async () => {
  for (const locale of locales) {
    const metadata = await episodeMetadata(props(locale));
    const names = { it: 'Titolo', en: 'Title', de: 'Titel' };
    const name = names[locale as keyof typeof names] || 'Anime 1';
    expect(metadata.title).toContain(name);
    expect(metadata.alternates?.canonical).toBe(new URL(localePath(`/anime/1-${name.toLowerCase().replace(' ', '-')}/episode-2`, locale), 'http://localhost:3000').href);
    expect(metadata.alternates?.languages?.it).toBe('http://localhost:3000/anime/1-titolo/episodio-2');
    expect(metadata.alternates?.languages?.de).toBe('http://localhost:3000/de/anime/1-titel/folge-2');
  }
});
it('renders UTC SSR fallback and TVEpisode/TVSeries JSON-LD with only dated adjacent links', async () => {
  vi.mocked(getAnimeEpisodes).mockResolvedValue([{ ...event, episode: 1 }, event]);
  const html = renderToStaticMarkup(await EpisodePage(props()));
  expect(html).toContain(new Date(event.airingAt * 1000).toISOString() + ' (UTC)');
  expect(html).toContain('"@type":"TVEpisode"');
  expect(html).toContain('"partOfSeries":{"@type":"TVSeries"');
  expect(html).toContain('/episode-1');
  expect(html).not.toContain('/episode-3');
  expect(html).not.toContain('aggregateRating');
});
it('returns notFound for an episode without a known date and for an invalid episode', async () => {
  vi.mocked(getAnimeEpisodes).mockResolvedValue([]);
  await expect(EpisodePage(props())).rejects.toThrow('404');
  await expect(episodeMetadata({ params: Promise.resolve({ id: '1-title', episode: 'episode-0', locale: 'en' }) })).rejects.toThrow('404');
});
it('applies list thresholds to actual metadata and 404 behavior', async () => {
  for (const count of [1, 4, 5]) {
    const items = Array.from({ length: count }, (_, i) => row(i + 2));
    vi.mocked(getSimilarAnime).mockResolvedValue(items);
    vi.mocked(getGenreLists).mockResolvedValue({ season: { year: 2026, season: 'fall' }, media: [], lists: [{ genre: 'Action', items }] });
    const similar = await similarMetadata(props());
    const genre = await genreMetadata({ params: Promise.resolve({ locale: 'en', genre: 'action' }) });
    expect(similar.robots).toEqual({ index: count >= 5, follow: true });
    expect(genre.robots).toEqual({ index: count >= 5, follow: true });
    expect(similar.title).toBe('Anime similar to Title');
    expect(genre.title).toBe('Best Action anime of the season · Fall 2026');
  }
  vi.mocked(getSimilarAnime).mockResolvedValue([]);
  vi.mocked(getGenreLists).mockResolvedValue({ season: { year: 2026, season: 'fall' }, media: [], lists: [] });
  expect((await similarMetadata(props())).robots).toEqual({ index: false, follow: true });
  expect(renderToStaticMarkup(await SimilarPage(props()))).toContain('Please try loading the guide again.');
  await expect(GenrePage({ params: Promise.resolve({ locale: 'en', genre: 'action' }) })).rejects.toThrow('404');
});
it.each(locales)('describes the wider similarity pool accurately in the page and metadata (%s)', async locale => {
  const metadata = await similarMetadata(props(locale));
  const d = getDictionary(locale).discovery;
  expect(d.similarIntro).not.toContain('{season}');
  expect(metadata.description).not.toMatch(/2026|\{\w+\}/);
  expect(metadata.description).toContain('AniList');
  expect(metadata.description).toContain('5');
  const html = renderToStaticMarkup(await SimilarPage(props(locale)));
  expect(html).toContain('Anime 2');
  expect(html).toContain('AniList');
  expect(html).not.toContain('2026');
});
it('expands each qualifying sitemap group into six URLs and excludes short lists', async () => {
  const entries = await getDiscoverySitemap(new Date('2026-10-21T12:00:00Z'), new URL('https://example.com'));
  expect(entries).toHaveLength((1 + 6 + 1) * 6); // episode + six similar lists + genre
  expect(new Set(entries.map(e => e.url)).size).toBe(entries.length);
  expect(entries.find(e => e.url === 'https://example.com/anime/1-titolo/episodio-2')?.alternates?.languages?.de).toBe('https://example.com/de/anime/1-titel/folge-2');
  vi.mocked(getDiscoveryCatalog).mockResolvedValue([anime(1), anime(2)]);
  vi.mocked(getGenreLists).mockResolvedValue({ season: { year: 2026, season: 'fall' }, media: [], lists: [{ genre: 'Action', items: [row(1)] }] });
  expect(await getDiscoverySitemap()).toHaveLength(6); // only the dated episode
});

it('renders an uncached temporary state for similar pages during a catalog outage and recovers', async () => {
  expect(similarRevalidate).toBe(86400);
  vi.mocked(getSimilarAnime).mockRejectedValue(new Error('Discovery catalog unavailable'));
  expect((await similarMetadata(props())).robots).toEqual({ index: false, follow: true });
  const html = renderToStaticMarkup(await SimilarPage(props()));
  expect(html).toContain('Please try loading the guide again.');
  expect(html).toContain('href="/en/anime/1-title/similar"');
  vi.mocked(getSimilarAnime).mockResolvedValue(Array.from({ length: 5 }, (_, i) => row(i + 2)));
  expect((await similarMetadata(props())).robots).toEqual({ index: true, follow: true });
  expect(renderToStaticMarkup(await SimilarPage(props()))).toContain('Anime 2');
});

it('propagates genre failures so a partial discovery sitemap cannot be cached', async () => {
  const error = new Error('genre catalog unavailable');
  vi.mocked(getGenreLists).mockRejectedValueOnce(error);
  await expect(getDiscoverySitemap()).rejects.toBe(error);
  expect(await getDiscoverySitemap()).toHaveLength(48);
});

it('omits optional detail blocks on upstream errors', async () => {
  vi.mocked(getSimilarAnime).mockRejectedValue(new Error('offline'));
  vi.mocked(getRankingsWeek).mockRejectedValue(new Error('offline'));
  expect(await AnimeSimilarBlock({ anime: anime(), name: 'Title', locale: 'en' })).toBeNull();
  expect(await AnimeCurrentRanking({ id: 1, locale: 'en' })).toBeNull();
});

const localizedHtml = (children: ReactNode, locale: Locale) => renderToStaticMarkup(createElement(LocaleProvider, { locale } as Parameters<typeof LocaleProvider>[0], children));

it.each(locales)('renders the full similar page as localized cover cards with the original intro and ItemList order (%s)', async locale => {
  const ids = [9, 2, 8, 3, 7, 4, 6, 5, 10];
  const items = ids.map((id, index) => ({ ...row(id), anime: { ...anime(id), coverImage: index === ids.length - 1 ? null : {
    large: index === 0 ? null : `https://s4.anilist.co/${id}.jpg`, extraLarge: `https://s4.anilist.co/${id}-large.jpg`, color: null,
  } } }));
  vi.mocked(getSimilarAnime).mockResolvedValue(items);
  const html = localizedHtml(await SimilarPage(props(locale)), locale);
  const metadata = await similarMetadata(props(locale));
  const d = getDictionary(locale);
  const names = { it: 'Titolo', en: 'Title', de: 'Titel' };
  const name = names[locale as keyof typeof names] || 'Anime 1';
  const intro = fill(d.discovery.similarIntro, { count: ids.length, season: `${d.catalog.seasonNames.fall} 2026`, title: name, top: 'Anime 9' });
  expect(html).toContain(`<p class="catalog-intro">${intro}</p>`);
  expect(metadata.description).toBe(intro);
  expect(html).toContain('<ol class="landing-list detail-discovery-cards">');
  expect(html.match(/<article class="anime-card landing-anime-card landing-anime-card-compact">/g)).toHaveLength(ids.length);
  expect([...html.matchAll(/<h2><a[^>]*>([^<]+)<\/a><\/h2>/g)].map(match => match[1])).toEqual(ids.map(id => `Anime ${id}`));
  const hrefs = [...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(match => match[1]);
  expect(hrefs).toEqual(ids.flatMap(id => Array(2).fill(localePath(`/anime/${id}-anime-${id}`, locale))));
  const posters = html.match(/<img[^>]+>/g) ?? [];
  expect(posters).toHaveLength(ids.length - 1);
  expect(posters[0]).toContain('src="https://s4.anilist.co/9-large.jpg"');
  for (const img of posters) {
    expect(img).toContain('width="72"');
    expect(img).toContain('height="108"');
    expect(img).toContain('loading="lazy"');
  }
  expect(html).toContain(`<span>${d.state.noPoster}</span>`);
  const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
  expect(jsonLd).toEqual({
    '@context': 'https://schema.org', '@type': 'ItemList', name: metadata.title, url: metadata.alternates?.canonical,
    itemListElement: ids.map((id, index) => ({
      '@type': 'ListItem', position: index + 1, name: `Anime ${id}`,
      url: new URL(localePath(`/anime/${id}-anime-${id}`, locale), metadata.alternates?.canonical as string).href,
    })),
  });
});

it.each(locales)('limits full similar page cards and ItemList to the same first 24 ranked items (%s)', async locale => {
  for (const count of [30, 7]) {
    const ids = Array.from({ length: count }, (_, i) => 100 - i);
    const items = ids.map(id => ({ ...row(id), anime: { ...anime(id), coverImage: {
      large: `https://s4.anilist.co/${id}.jpg`, extraLarge: null, color: null,
    } } }));
    vi.mocked(getSimilarAnime).mockResolvedValue(items);
    const shownIds = ids.slice(0, 24);
    const html = localizedHtml(await SimilarPage(props(locale)), locale);
    const metadata = await similarMetadata(props(locale));
    expect(html.match(/<article class="anime-card landing-anime-card landing-anime-card-compact">/g)).toHaveLength(shownIds.length);
    expect([...html.matchAll(/<h2><a[^>]*>([^<]+)<\/a><\/h2>/g)].map(match => match[1])).toEqual(shownIds.map(id => `Anime ${id}`));
    const posters = html.match(/<img[^>]+>/g) ?? [];
    expect(posters).toHaveLength(shownIds.length);
    posters.forEach((poster, index) => expect(poster).toContain(`src="https://s4.anilist.co/${shownIds[index]}.jpg"`));
    const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(jsonLd.itemListElement).toEqual(shownIds.map((id, index) => ({
      '@type': 'ListItem', position: index + 1, name: `Anime ${id}`,
      url: new URL(localePath(`/anime/${id}-anime-${id}`, locale), metadata.alternates?.canonical as string).href,
    })));
    expect(metadata.description).toContain(String(shownIds.length));
    expect(html).toContain(`<p class="catalog-intro">${metadata.description}</p>`);
  }
});

it.each(locales)('renders bounded discovery cards and only internal localized links (%s)', async locale => {
  const candidates = Array.from({ length: 9 }, (_, i) => ({ ...anime(i + 2), coverImage: { large: 'https://s4.anilist.co/cover.jpg', extraLarge: null, color: null } }));
  vi.mocked(getSimilarAnime).mockResolvedValue(candidates.map(anime => ({ anime, score: 8, genres: ['Action'] })));
  const similar = localizedHtml(await AnimeSimilarBlock({ anime: anime(), name: 'Title', locale }), locale);
  const d = getDictionary(locale).discovery;
  expect(similar).toContain(d.similar);
  expect(similar).toContain(d.allSimilar);
  expect(similar.match(/<article /g)).toHaveLength(6);
  expect(similar).toContain(`href="${localePath('/anime/1-title/similar', locale)}"`);
  const hrefs = [...similar.matchAll(/<a[^>]*href="([^"]+)"/g)].map(match => match[1]);
  expect(hrefs.every(href => href.startsWith(locale === 'it' ? '/' : `/${locale}/`))).toBe(true);
  expect(hrefs).toContain(localePath('/anime/2-anime-2', locale));
  expect(hrefs).not.toContain(localePath('/anime/1-anime-1', locale));
  const posters = similar.match(/<img[^>]+>/g) ?? [];
  expect(posters.length).toBeGreaterThan(0);
  for (const img of posters) {
    expect(img).toContain('width="72"');
    expect(img).toContain('height="108"');
    expect(img).toContain('loading="lazy"');
  }
});

it('omits empty or insufficient suggestions', async () => {
  for (const count of [0, 3, 4]) {
    vi.mocked(getSimilarAnime).mockResolvedValue(Array.from({ length: count }, (_, i) => row(i + 2)));
    const block = await AnimeSimilarBlock({ anime: anime(), name: 'Title', locale: 'en' });
    if (count < 4) expect(block).toBeNull();
    else {
      const html = localizedHtml(block, 'en');
      expect(html.match(/<article /g)).toHaveLength(4);
      expect(html).toContain('href="/en/anime/1-title/similar"');
      expect(html).toContain('class="poster"'); // Missing posters retain the same reserved box.
      expect(html).not.toContain('<img');
    }
  }
});
it('links only actual membership in the resolved current ranking', async () => {
  vi.mocked(getRankingsWeek).mockResolvedValue({ week: '2026-42', savedAt: undefined, titles: [], rankings: { imdb: [{ anime: {} as never, anilistId: 1, score: 8, votes: 1000 }], mal: [] } });
  const html = renderToStaticMarkup(await AnimeCurrentRanking({ id: 1, locale: 'en' }));
  expect(getRankingsWeek).toHaveBeenCalledWith('this-week');
  expect(html).toContain('2026-42');
  expect(html).toContain('/en/rankings/this-week#ranking-imdb');
  expect(await AnimeCurrentRanking({ id: 99, locale: 'en' })).toBeNull();
});


it.each(locales)('renders genre rankings as linked cover cards without changing ranking order (%s)', async locale => {
  const items = [row(9), row(2), row(7)].map((item, i) => ({ ...item, score: 8.5 - i / 10,
    anime: { ...item.anime, coverImage: i === 2 ? null : { large: `https://s4.anilist.co/${item.anime.id}.jpg`, extraLarge: null, color: null } },
  }));
  vi.mocked(getGenreLists).mockResolvedValue({ season: { year: 2026, season: 'fall' }, media: items.map(item => item.anime), lists: [{ genre: 'Action', items }] });
  const html = localizedHtml(await GenrePage({ params: Promise.resolve({ locale, genre: 'action' }) }), locale);
  expect(html).toContain('landing-list genre-ranking-list');
  expect(html.match(/<article class="anime-card landing-anime-card">/g)).toHaveLength(3);
  expect(html.match(/class="poster"/g)).toHaveLength(3);
  expect(html.match(/<img /g)).toHaveLength(2);
  expect(html).toContain(getDictionary(locale).state.noPoster);
  expect(html).toContain(getDictionary(locale).explore.allGenres);
  expect(html).toContain(`href="${localePath('/best-this-season', locale)}"`);
  expect([...html.matchAll(/<h2><a[^>]*>([^<]+)<\/a><\/h2>/g)].map(match => match[1])).toEqual(['Anime 9', 'Anime 2', 'Anime 7']);
  for (const rank of ['01', '02', '03']) expect(html).toContain(`class="landing-rank">${rank}</span>`);
  expect(html).toContain('IMDb');
  expect(html).toContain(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(8.5));
  const jsonLd = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
  expect(jsonLd.itemListElement.map((entry: {position: number}) => entry.position)).toEqual([1, 2, 3]);
});
