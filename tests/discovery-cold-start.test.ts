vi.mock('next/server', () => ({ connection: vi.fn(async () => {}) }));
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/similar-catalog-client', () => ({ readSharedSimilarCatalog: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), animeName: (anime: AniListAnime) => anime.title.english }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));
vi.mock('@/lib/weekly-seo-data', () => ({ getSeoWeeks: vi.fn() }));
vi.mock('@/lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('@/lib/platform-metadata', () => ({ getAnimePlatformMetadata: async () => ({ titles: {}, unavailable: false }) }));
vi.mock('@/lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn(), jikanFetch: vi.fn() }));

import { readSharedSimilarCatalog } from '@/lib/similar-catalog-client';
import { getSeason } from '@/lib/anilist';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { anilistFetch, jikanFetch } from '@/lib/rate-limited-fetch';
import { getGenreLists } from '@/lib/discovery-data';
import GenrePage, { generateMetadata } from '@/app/[locale]/best-this-season/[genre]/page';
import BestThisSeason, { revalidate as landingRevalidate } from '@/app/[locale]/best-this-season/page';
import { revalidate as genreRevalidate } from '@/app/[locale]/best-this-season/[genre]/page';
import { GET, dynamic as sitemapDynamic } from '@/app/sitemaps/sitemap/[id]/route';
import sitemap from '@/lib/sitemap-shards';
import { LocaleProvider } from '@/components/LanguageSelector';
import { localePath } from '@/lib/locale-routing';
import type { Locale } from '@/lib/locales';

function renderWithLocale(children: ReactNode, locale: Locale = 'en') {
  const props = { locale, children };
  return renderToStaticMarkup(createElement(LocaleProvider, props));
}

const now = new Date('2026-10-21T12:00:00Z');
const media: AniListAnime[] = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1, idMal: i + 101, title: { english: `Anime ${i + 1}`, romaji: null, native: null },
  season: 'FALL', seasonYear: 2026, genres: ['Action'], averageScore: 85 - i,
  format: 'TV', tags: [], coverImage: null, bannerImage: null, description: null,
  startDate: null, episodes: null, status: null, studios: null,
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.clearAllMocks();
  vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => ({
    media: season === 'fall' ? media : [], pageInfo: { currentPage: page, hasNextPage: false },
  }));
  vi.mocked(readSharedSimilarCatalog).mockResolvedValue(media);
  vi.mocked(readRatingsStore).mockResolvedValue({ ratings: {}, sources: {} });
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: {}, events: [] });
  vi.mocked(anilistFetch).mockImplementation(async () => new Response(JSON.stringify({ data: { Page: {
    pageInfo: { hasNextPage: false }, airingSchedules: [{ id: 1, mediaId: 1, episode: 2, airingAt: now.getTime() / 1000 }],
  } } })));
});
afterEach(() => vi.useRealTimers());

it('renders English and Spanish genre pages and links from best-this-season with cold rating stores', async () => {
  const data = await getGenreLists();
  expect(data.lists[0].items).toHaveLength(6);
  for (const locale of ['en', 'es'] as const) {
    const params = Promise.resolve({ locale, genre: 'action' });
    expect((await generateMetadata({ params })).robots).toEqual({ index: true, follow: true });
    const html = renderToStaticMarkup(await GenrePage({ params }));
    const score = new Intl.NumberFormat(locale).format(8.5);
    expect(html).toContain(`AniList ${score}/10`);
    expect(html).not.toContain(`${score}/10 (0)`);
    expect(html).toContain('Anime 1');
    const landing = renderWithLocale(await BestThisSeason({ params }), locale);
    expect(landing).toContain(`href="${localePath('/best-this-season/action', locale)}"`);
    expect(landing).toContain('Action (6)');
  }
  // Genre fallback never triggers per-title AniList/Jikan enrichment.
  expect(anilistFetch).not.toHaveBeenCalled();
  expect(jikanFetch).not.toHaveBeenCalled();
});

it('includes similar, episode and genre URLs in the actual discovery shard with cold rating stores', async () => {
  const entries = await sitemap({ id: Promise.resolve('discovery') });
  expect(entries).toHaveLength((6 + 1 + 1) * 6);
  const paths = entries.map(entry => new URL(entry.url).pathname);
  for (const locale of ['en', 'es'] as const) {
    for (const path of ['/anime/1-anime-1/similar', '/anime/1-anime-1/episode-2', '/best-this-season/action']) {
      expect(paths).toContain(localePath(path, locale));
    }
  }
  expect(anilistFetch).toHaveBeenCalledOnce();
  expect(jikanFetch).not.toHaveBeenCalled();
});

it('rejects a catalog outage instead of returning a cacheable empty shard, and recovers on retry', async () => {
  vi.mocked(readSharedSimilarCatalog).mockRejectedValueOnce(new Error('Discovery catalog unavailable'));
  await expect(sitemap({ id: Promise.resolve('discovery') })).rejects.toThrow('Discovery catalog unavailable');
  expect(await sitemap({ id: Promise.resolve('discovery') })).toHaveLength(48);
});

it('rejects an episode outage instead of caching a partial shard, and recovers on retry', async () => {
  vi.mocked(anilistFetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(sitemap({ id: Promise.resolve('discovery') })).rejects.toThrow('Episode schedule unavailable');
  expect(await sitemap({ id: Promise.resolve('discovery') })).toHaveLength(48);
});

it('renders a temporary landing state on catalog outage and restores genre links on the next request', async () => {
  expect(landingRevalidate).toBe(0);
  const params = Promise.resolve({ locale: 'en' });
  vi.mocked(readSharedSimilarCatalog).mockRejectedValueOnce(new Error('Discovery catalog unavailable'));
  const failed = renderWithLocale(await BestThisSeason({ params }));
  expect(failed).toContain('Please try loading the guide again.');
  expect(failed).not.toContain('Action (6)');
  const recovered = renderWithLocale(await BestThisSeason({ params }));
  expect(recovered).toContain('Action (6)');
  expect(getSeason).not.toHaveBeenCalled();
});

it('does not turn an unavailable genre into a cached 404, and recovers without a rebuild', async () => {
  expect(genreRevalidate).toBe(0);
  const params = Promise.resolve({ locale: 'en', genre: 'action' });
  vi.mocked(readSharedSimilarCatalog).mockRejectedValueOnce(new Error('Discovery catalog unavailable'));
  expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: true });
  vi.mocked(readSharedSimilarCatalog).mockRejectedValueOnce(new Error('Discovery catalog unavailable'));
  const failed = renderToStaticMarkup(await GenrePage({ params }));
  expect(failed).toContain('Try again');
  expect(failed).toContain('href="/en/best-this-season/action"');
  expect(renderToStaticMarkup(await GenrePage({ params }))).toContain('Anime 1');
  expect((await generateMetadata({ params })).robots).toEqual({ index: true, follow: true });
});

const requestShard = (id = 'discovery.xml') => GET(new Request(`https://example.com/sitemaps/sitemap/${id}`), { params: Promise.resolve({ id }) });

it.each(['catalog', 'episodes'])('returns uncached 503 XML route responses for a %s outage, then recovers', async source => {
  expect(sitemapDynamic).toBe('force-dynamic');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    if (source === 'catalog') vi.mocked(readSharedSimilarCatalog).mockRejectedValueOnce(new Error('Discovery catalog unavailable'));
    else vi.mocked(anilistFetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failed = await requestShard();
    expect(failed.status).toBe(503);
    expect(failed.headers.get('Cache-Control')).toBe('no-store');
    expect(failed.headers.get('Retry-After')).toBe('60');
    expect(await failed.text()).not.toContain('<urlset');
    const recovered = await requestShard();
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get('Content-Type')).toContain('application/xml');
    expect(recovered.headers.get('Cache-Control')).toContain('s-maxage=86400');
    const xml = await recovered.text();
    expect(xml.match(/<url>/g)).toHaveLength(48);
    expect(xml).toContain('/en/best-this-season/action');
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('hreflang="es"');
  } finally { log.mockRestore(); }
});

it('shares simultaneous discovery shard requests and rejects unknown shard filenames without fetching', async () => {
  const responses = await Promise.all(Array.from({ length: 6 }, () => requestShard()));
  expect(responses.every(response => response.status === 200)).toBe(true);
  expect(getSeason).not.toHaveBeenCalled();
  expect(anilistFetch).toHaveBeenCalledOnce();
  const xmls = await Promise.all(responses.map(response => response.text()));
  expect(new Set(xmls).size).toBe(1);
  for (const filename of ['discovery', 'unknown.xml', 'NaN.xml']) expect((await requestShard(filename)).status).toBe(404);
  expect(getSeason).not.toHaveBeenCalled();
});
