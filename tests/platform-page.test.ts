import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
vi.mock('../lib/tmdb', () => ({ getPlatformAnime: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ readWeeklyRatingsSnapshot: vi.fn() }));
import { getPlatformAnime } from '../lib/tmdb';
import { readWeeklyRatingsSnapshot } from '../lib/weekly-ratings';
import PlatformPage, { generateMetadata } from '../app/piattaforma/[provider]/[country]/page';
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
it('renders direct links only for existing exact TMDB mappings and search links otherwise', async () => {
  vi.stubGlobal('React', React);
  vi.mocked(getPlatformAnime).mockResolvedValue({ status: 'ready', titles: [
    { id: 1, kind: 'tv', name: 'Mapped', overview: '', poster: null, ratings: {}, providers: {}, providersUnavailable: false, recommendation: null },
    { id: 2, kind: 'movie', name: 'Other title', overview: '', poster: null, ratings: {}, providers: {}, providersUnavailable: false, recommendation: null },
  ] });
  vi.mocked(readWeeklyRatingsSnapshot).mockResolvedValue({ titles: { 'tv:1': { anilistId: 21 }, 'tv:2': { anilistId: 99 } }, events: [] });
  const html = renderToStaticMarkup(await PlatformPage({ params: Promise.resolve({ provider: 'netflix', country: 'it' }) }));
  expect(html).toContain('Anime su Netflix Italia');
  expect(html).toContain('href="/anime/21"');
  expect(html).toContain('href="/search?q=Other+title"');
  expect(html).not.toContain('/anime/99');
  const breadcrumb = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);
  expect(breadcrumb['@type']).toBe('BreadcrumbList');
  expect(breadcrumb.itemListElement.map((item: { name: string }) => item.name)).toEqual(['Home', 'Piattaforme', 'Anime su Netflix Italia']);
  expect(breadcrumb.itemListElement[2].item).toMatch(/\/piattaforma\/netflix\/it$/);
  expect(getPlatformAnime).toHaveBeenCalledExactlyOnceWith(8, 'IT');
  expect(readWeeklyRatingsSnapshot).toHaveBeenCalledTimes(1);
});
it('generates metadata without fetching a catalog or ratings', async () => {
  const meta = await generateMetadata({ params: Promise.resolve({ provider: 'prime-video', country: 'gb' }) });
  expect(meta.title).toBe('Anime su Prime Video Regno Unito');
  expect(meta.alternates?.canonical).toMatch(/\/piattaforma\/prime-video\/gb$/);
  expect(getPlatformAnime).not.toHaveBeenCalled();
  expect(readWeeklyRatingsSnapshot).not.toHaveBeenCalled();
});
it('rejects unsupported providers and countries before loading sources', async () => {
  const props = { params: Promise.resolve({ provider: 'netflix', country: 'unknown' }) };
  await expect(PlatformPage(props)).rejects.toThrow('not-found');
  await expect(generateMetadata(props)).rejects.toThrow('not-found');
  expect(getPlatformAnime).not.toHaveBeenCalled();
});
