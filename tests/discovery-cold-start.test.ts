import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AniListAnime } from '@/lib/anilist';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); } }));
vi.mock('@/lib/anilist', () => ({ getSeason: vi.fn(), animeName: (anime: AniListAnime) => anime.title.english }));
vi.mock('@/lib/ratings-store', () => ({ readRatingsStore: vi.fn() }));
vi.mock('@/lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));
vi.mock('@/lib/weekly-seo-data', () => ({ getSeoWeeks: vi.fn() }));
vi.mock('@/lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
vi.mock('@/lib/platform-metadata', () => ({ getAnimePlatformMetadata: async () => ({ titles: {}, unavailable: false }) }));
vi.mock('@/lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn(), jikanFetch: vi.fn() }));

import { getSeason } from '@/lib/anilist';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { anilistFetch, jikanFetch } from '@/lib/rate-limited-fetch';
import { getGenreLists } from '@/lib/discovery-data';
import GenrePage, { generateMetadata } from '@/app/[locale]/best-this-season/[genre]/page';
import BestThisSeason from '@/app/[locale]/best-this-season/page';
import sitemap from '@/app/sitemaps/sitemap';
import { LocaleProvider } from '@/components/LanguageSelector';
import { localePath } from '@/lib/locale-routing';

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
    const landing = renderToStaticMarkup(createElement(LocaleProvider, { locale, children: await BestThisSeason({ params }) }));
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
  vi.mocked(getSeason).mockResolvedValueOnce({ media: [], pageInfo: { currentPage: 1, hasNextPage: false }, unavailable: true });
  await expect(sitemap({ id: Promise.resolve('discovery') })).rejects.toThrow('Discovery catalog unavailable');
  expect(await sitemap({ id: Promise.resolve('discovery') })).toHaveLength(48);
});

it('rejects an episode outage instead of caching a partial shard, and recovers on retry', async () => {
  vi.mocked(anilistFetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(sitemap({ id: Promise.resolve('discovery') })).rejects.toThrow('Episode schedule unavailable');
  expect(await sitemap({ id: Promise.resolve('discovery') })).toHaveLength(48);
});

it('propagates genre catalog errors from best-this-season instead of caching missing links', async () => {
  // The first request is the landing's own current-season catalog; discovery
  // then loads the previous season and must not turn its failure into no links.
  vi.mocked(getSeason).mockResolvedValueOnce({ media, pageInfo: { currentPage: 1, hasNextPage: false } })
    .mockResolvedValueOnce({ media: [], pageInfo: { currentPage: 1, hasNextPage: false }, unavailable: true });
  await expect(BestThisSeason({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow('Discovery catalog unavailable');
});
