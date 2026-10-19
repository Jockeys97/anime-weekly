import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn(), animeName: (item: { title: { english: string } }) => item.title.english }));
import { getSeason } from '../lib/anilist';
import sitemap, { generateSitemaps } from '../app/sitemaps/sitemap';
import { GET } from '../app/sitemap.xml/route';
import { getSitemapCatalog } from '../lib/sitemap-catalog';
import robots from '../app/robots';
import { buildAnimeSitemap, buildSitemap, sitemapUrls } from '../lib/seo-sitemap';
import { serializeJsonLd, siteUrl } from '../lib/seo';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });
describe('SEO sitemap', () => {
  it('includes weeks across year boundaries, three calendar years, platforms and valid unique anime', () => {
    const urls = buildSitemap([21, 21, -1, NaN, 2147483648, 42], new Date('2026-01-01T12:00:00Z'), new URL('https://anime.example')).filter(entry => !/^\/(en|es|fr|de|pt)(?:\/|$)/.test(new URL(entry.url).pathname)).map(entry => entry.url);
    expect(urls).toContain('https://anime.example/');
    expect(urls).toContain('https://anime.example/week/2025-52');
    expect(urls).toContain('https://anime.example/week/2026-01');
    expect(urls).toContain('https://anime.example/week/2026-02');
    expect(urls.filter(url => /\/season\//.test(url))).toHaveLength(12);
    expect(urls).toContain('https://anime.example/season/2024/winter');
    expect(urls.filter(url => /\/piattaforma\//.test(url))).toHaveLength(42);
    expect(urls.filter(url => /\/anime\//.test(url))).toEqual(['https://anime.example/anime/21', 'https://anime.example/anime/42']);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it('keeps every valid anime and uses only upstream anime modification dates', () => {
    const entries = buildAnimeSitemap([
      ...Array.from({ length: 80 }, (_, i) => ({ id: i + 1 })),
      { id: 1, updatedAt: 1720000000 }, { id: 1, updatedAt: 1730000000 },
      { id: 2, updatedAt: NaN }, { id: 3, updatedAt: -1 },
    ]);
    expect(entries).toHaveLength(80 * 6);
    expect(entries.find(entry => entry.url.endsWith('/anime/1'))!.lastModified).toEqual(new Date(1730000000000));
    expect(entries.find(entry => entry.url.endsWith('/anime/2'))).not.toHaveProperty('lastModified');
    expect(entries.find(entry => entry.url.endsWith('/anime/3'))).not.toHaveProperty('lastModified');
  });
  it('uses past week end dates and real generation time for other pages', () => {
    const date = new Date('2026-01-01T12:00:00Z');
    const entries = buildSitemap([], date);
    expect(entries.find(entry => entry.url.endsWith('/week/2025-52'))?.lastModified).toBe('2025-12-28');
    expect(entries.find(entry => entry.url.endsWith('/week/2026-01'))?.lastModified).toEqual(date);
    expect(entries.find(entry => entry.url.endsWith('/season/2024/winter'))?.lastModified).toEqual(date);
  });
  it('paginates all twelve seasons sequentially, deduplicates globally and keeps partial results on failure', async () => {
    let active = 0;
    vi.mocked(getSeason).mockImplementation(async (year, season, page = 1) => {
      expect(active++).toBe(0);
      await Promise.resolve();
      active--;
      if (year === 2024 && season === 'winter' && page === 2) throw new Error('offline');
      if (year === 2025 && season === 'spring') return { media: [], pageInfo: { currentPage: page, hasNextPage: false } };
      const media = [{ id: 21, title: { english: 'Death Note' } }, ...(page === 2 ? [{ id: 42, title: { english: 'Example' }, updatedAt: 1730000000 }] : [])];
      return { media, pageInfo: { currentPage: page, hasNextPage: page === 1 } } as Awaited<ReturnType<typeof getSeason>>;
    });
    const catalog = await getSitemapCatalog(2026);
    expect(catalog.map(anime => anime.id)).toEqual([21, 42]);
    expect(getSeason).toHaveBeenCalledTimes(23);
    for (const year of [2024, 2025, 2026]) {
      for (const season of ['winter', 'spring', 'summer', 'fall']) expect(getSeason).toHaveBeenCalledWith(year, season, 1);
    }
    expect(getSeason).toHaveBeenCalledWith(2026, 'fall', 2);
  });
  it('serves independent page/year shards and exposes their Next 16 URLs in the index and robots', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://anime.example');
    vi.mocked(getSeason).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
    expect(generateSitemaps()).toEqual(['pages', '2024', '2025', '2026'].map(id => ({ id })));
    expect(sitemapUrls()).toEqual([
      'https://anime.example/sitemaps/sitemap/pages.xml',
      'https://anime.example/sitemaps/sitemap/2024.xml',
      'https://anime.example/sitemaps/sitemap/2025.xml',
      'https://anime.example/sitemaps/sitemap/2026.xml',
    ]);
    expect(await sitemap({ id: Promise.resolve('pages') })).toHaveLength(60 * 6);
    expect(getSeason).not.toHaveBeenCalled();
    expect(await sitemap({ id: Promise.resolve('2026') })).toEqual([]);
    expect(getSeason).toHaveBeenCalledTimes(12);
    const xml = await GET().text();
    expect(xml).toContain('<sitemapindex');
    for (const url of sitemapUrls()) {
      expect(xml).toContain(`<loc>${url}</loc>`);
      expect(robots().sitemap).toContain(url);
    }
    expect(robots().sitemap).toContain('https://anime.example/sitemap.xml');
  });
  it('shares concurrent cold crawls and assigns each anime to only one year shard', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.mocked(getSeason).mockImplementation(async year => ({
      media: [{ id: year, title: { english: "Year" } }, { id: 21, title: { english: "Death Note" } }],
      pageInfo: { currentPage: 1, hasNextPage: false },
    } as Awaited<ReturnType<typeof getSeason>>));
    const shards = await Promise.all(['2024', '2025', '2026'].map(id => sitemap({ id: Promise.resolve(id) })));
    expect(getSeason).toHaveBeenCalledTimes(12);
    expect(shards.map(entries => entries.filter(entry => !/^\/(en|es|fr|de|pt)(?:\/|$)/.test(new URL(entry.url).pathname)).map(entry => new URL(entry.url).pathname))).toEqual([
      ['/anime/2024-year', '/anime/21-death-note'], ['/anime/2025-year'], ['/anime/2026-year'],
    ]);
  });
  it('uses the same base URL for robots and metadata', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://custom.example/path', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('https://custom.example/');
    expect(siteUrl({ NODE_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('https://weeklyanime.com/');
    expect(siteUrl({ VERCEL_ENV: 'production' }).href).toBe('https://weeklyanime.com/');
    expect(siteUrl({ NODE_ENV: 'development', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('http://localhost:3000/');
    expect(siteUrl({}).href).toBe('http://localhost:3000/');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://custom.example');
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: ['https://custom.example/sitemap.xml', ...sitemapUrls()] });
  });
  it('escapes script termination in JSON-LD without changing its data', () => {
    const data = { name: '</script><script>alert(1)</script>' };
    expect(serializeJsonLd(data)).not.toContain('<');
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
