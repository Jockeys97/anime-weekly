vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: async () => ({}) }));
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/weekly-seo-data', () => ({ getSeoWeeks: vi.fn().mockResolvedValue([]) }));
import { getSeoWeeks } from '../lib/weekly-seo-data';
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn(), animeName: (item: { title: { english: string } }) => item.title.english }));
vi.mock('@vercel/blob', () => ({ get: vi.fn(), put: vi.fn() }));
import { getSeason } from '../lib/anilist';
import { get, put } from '@vercel/blob';
import sitemap, { generateSitemaps } from '../lib/sitemap-shards';
import { GET } from '../app/sitemap.xml/route';
import { getSitemapCatalog } from '../lib/sitemap-catalog';
import robots from '../app/robots';
import { buildAnimeSitemap, buildSitemap, sitemapUrls } from '../lib/seo-sitemap';
import { serializeJsonLd, siteUrl } from '../lib/seo';
import { serializeSitemap } from '../lib/sitemap-xml';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });
describe('SEO sitemap', () => {
  it('includes weeks across year boundaries, three calendar years, platforms and valid unique anime', () => {
    const urls = buildSitemap([21, 21, -1, NaN, 2147483648, 42], new Date('2026-01-01T12:00:00Z'), new URL('https://anime.example')).filter(entry => !/^\/(en|es|fr|de|pt)(?:\/|$)/.test(new URL(entry.url).pathname)).map(entry => entry.url);
    expect(urls).toContain('https://anime.example/');
    expect(urls).not.toContain('https://anime.example/week/2025-52');
    expect(urls).not.toContain('https://anime.example/week/2026-01');
    expect(urls).not.toContain('https://anime.example/week/2026-02');
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
  it('uses only nonempty archives for closed weeks and their actual upload dates, preserving hreflang', () => {
    const date = new Date('2026-01-01T12:00:00Z');
    const uploadedAt = '2025-12-29T06:01:00Z';
    const entries = buildSitemap([], date, new URL('https://anime.example'), [
      { week: '2025-52', titleCount: 1, uploadedAt }, { week: '2025-52', titleCount: 1, uploadedAt },
      { week: '2025-51', titleCount: 0, uploadedAt }, { week: '2026-01', titleCount: 1, uploadedAt },
      { week: '2025-50', titleCount: 1, uploadedAt: 'bad-date' }, { week: 'bad-week', titleCount: 1, uploadedAt },
    ]);
    const archives = entries.filter(entry => entry.url.endsWith('/week/2025-52'));
    expect(archives).toHaveLength(6);
    expect(archives[0].lastModified).toBe(uploadedAt);
    expect(archives[0].alternates?.languages).toMatchObject({ it: 'https://anime.example/week/2025-52', en: 'https://anime.example/en/week/2025-52' });
    expect(entries.some(entry => entry.url.endsWith('/week/2025-51'))).toBe(false);
    expect(entries.find(entry => entry.url.endsWith('/week/2026-01'))?.lastModified).toBe(uploadedAt);
    expect(entries.find(entry => entry.url.endsWith('/season/2024/winter'))?.lastModified).toEqual(date);
  });
  it('paginates the four seasons of one year sequentially and keeps partial results on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let active = 0;
    vi.mocked(getSeason).mockImplementation(async (year, season, page = 1) => {
      expect(active++).toBe(0);
      await Promise.resolve();
      active--;
      if (season === 'spring') return { media: [], pageInfo: { currentPage: page, hasNextPage: false }, unavailable: true };
      if (season === 'summer') throw new Error('offline');
      const media = [{ id: 21, title: { english: 'Death Note' } }, ...(page === 2 ? [{ id: 42, title: { english: 'Example' }, updatedAt: 1730000000 }] : [])];
      return { media, pageInfo: { currentPage: page, hasNextPage: season === 'winter' && page === 1 } } as Awaited<ReturnType<typeof getSeason>>;
    });
    const catalog = await getSitemapCatalog(2026);
    expect(catalog.map(anime => anime.id)).toEqual([21, 42]);
    expect(getSeason).toHaveBeenCalledTimes(5);
    for (const season of ['winter', 'spring', 'summer', 'fall']) expect(getSeason).toHaveBeenCalledWith(2026, season, 1);
    expect(getSeason).toHaveBeenCalledWith(2026, 'winter', 2);
    expect(put).not.toHaveBeenCalled();
  });
  it('reuses saved ended seasons, saves the crawled current season and falls back to saved lists when AniList fails', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'fixture-token');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const saved = (season: string, savedAt: string) => ({ version: 1, year: 2026, season, savedAt, anime: [{ id: { winter: 1, spring: 2, summer: 3, fall: 4 }[season]!, name: season }] });
    const stored: Record<string, unknown> = {
      'sitemap/seasons/2026-winter.json': saved('winter', '2026-10-01T06:00:00Z'),
      'sitemap/seasons/2026-spring.json': saved('spring', '2026-08-01T06:00:00Z'),
      'sitemap/seasons/2026-summer.json': saved('summer', '2026-10-10T06:00:00Z'),
      'sitemap/seasons/2026-fall.json': saved('fall', '2026-10-13T06:00:00Z'),
    };
    vi.mocked(get).mockImplementation(async (key: string) => (stored[key]
      ? { statusCode: 200, stream: new Response(JSON.stringify(stored[key])).body! }
      : null) as Awaited<ReturnType<typeof get>>);
    vi.mocked(getSeason).mockImplementation(async (_year, season, page = 1) => season === 'fall'
      ? { media: [{ id: 40, title: { english: 'Fall' }, updatedAt: 1792000000 }], pageInfo: { currentPage: page, hasNextPage: false } } as Awaited<ReturnType<typeof getSeason>>
      : { media: [], pageInfo: { currentPage: page, hasNextPage: false }, unavailable: true });
    // Winter and summer are fresh saved lists; spring is stale and AniList fails, so its saved list is kept.
    expect((await getSitemapCatalog(2026)).map(anime => anime.id)).toEqual([1, 2, 3, 40]);
    expect(vi.mocked(getSeason).mock.calls.map(([, season]) => season)).toEqual(['spring', 'fall']);
    expect(put).toHaveBeenCalledOnce();
    expect(vi.mocked(put).mock.calls[0][0]).toBe('sitemap/seasons/2026-fall.json');
    expect(JSON.parse(vi.mocked(put).mock.calls[0][1] as string)).toMatchObject({ version: 1, year: 2026, season: 'fall', anime: [{ id: 40, name: 'Fall', updatedAt: 1792000000 }] });
  });
  it('serves independent page/year shards and exposes their Next 16 URLs in the index and robots', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://anime.example');
    vi.mocked(getSeason).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
    expect(generateSitemaps()).toEqual(['pages', 'discovery', '2024', '2025', '2026'].map(id => ({ id })));
    expect(sitemapUrls()).toEqual([
      'https://anime.example/sitemaps/sitemap/pages.xml',
      'https://anime.example/sitemaps/sitemap/discovery.xml',
      'https://anime.example/sitemaps/sitemap/2024.xml',
      'https://anime.example/sitemaps/sitemap/2025.xml',
      'https://anime.example/sitemaps/sitemap/2026.xml',
    ]);
    vi.mocked(getSeoWeeks).mockResolvedValue([]);
    expect(await sitemap({ id: Promise.resolve('pages') })).toHaveLength(59 * 6);
    expect(getSeoWeeks).toHaveBeenCalledOnce();
    expect(getSeason).not.toHaveBeenCalled();
    expect(await sitemap({ id: Promise.resolve('2026') })).toEqual([]);
    expect(getSeason).toHaveBeenCalledTimes(4);
    const xml = await GET().text();
    expect(xml).toContain('<sitemapindex');
    for (const url of sitemapUrls()) {
      expect(xml).toContain(`<loc>${url}</loc>`);
      expect(robots().sitemap).toContain(url);
    }
    expect(robots().sitemap).toContain('https://anime.example/sitemap.xml');
  });
  it('shares concurrent cold crawls of a shard and fills each year shard from its own seasons', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.mocked(getSeason).mockImplementation(async year => ({
      media: [{ id: year, title: { english: 'Year' } }],
      pageInfo: { currentPage: 1, hasNextPage: false },
    } as Awaited<ReturnType<typeof getSeason>>));
    const shards = await Promise.all(['2024', '2025', '2026', '2026'].map(id => sitemap({ id: Promise.resolve(id) })));
    expect(getSeason).toHaveBeenCalledTimes(12);
    expect(shards.map(entries => entries.filter(entry => !/^\/(en|es|fr|de|pt)(?:\/|$)/.test(new URL(entry.url).pathname)).map(entry => new URL(entry.url).pathname))).toEqual([
      ['/anime/2024-year'], ['/anime/2025-year'], ['/anime/2026-year'], ['/anime/2026-year'],
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
  it('serializes sitemap URLs, dates and hreflang with XML escaping', () => {
    const xml = serializeSitemap([{
      url: 'https://example.com/?a=1&b=2',
      alternates: { languages: { en: 'https://example.com/en?name="A&B"' } },
      lastModified: new Date('2026-10-21T12:00:00Z'), changeFrequency: 'daily', priority: 0,
    }]);
    expect(xml).toContain('<loc>https://example.com/?a=1&amp;b=2</loc>');
    expect(xml).toContain('href="https://example.com/en?name=&quot;A&amp;B&quot;"');
    expect(xml).toContain('<lastmod>2026-10-21T12:00:00.000Z</lastmod>');
    expect(xml).toContain('<changefreq>daily</changefreq><priority>0</priority>');
  });
});


it('includes only proven nonempty nonfuture weeks, and rankings with qualifying entries', () => {
  const uploadedAt = '2026-10-20T10:00:00Z';
  const entries = buildSitemap([], new Date('2026-10-21T12:00:00Z'), new URL('https://anime.example'), [
    { week: '2026-43', titleCount: 10, rankingCount: 2, uploadedAt },
    { week: '2026-42', titleCount: 4, rankingCount: 1, uploadedAt },
    { week: '2026-44', titleCount: 10, rankingCount: 2, uploadedAt },
    { week: '2026-41', titleCount: 0, rankingCount: 2, uploadedAt },
    { week: '2026-40', titleCount: 5, rankingCount: 0, uploadedAt },
  ]);
  const urls = entries.map(entry => new URL(entry.url).pathname);
  for (const path of ['/week/2026-43', '/week/2026-42', '/week/2026-40', '/rankings/2026-43', '/rankings/2026-42', '/rankings/questa-settimana', '/en/rankings/this-week']) expect(urls).toContain(path);
  for (const path of ['/week/2026-44', '/rankings/2026-44', '/week/2026-41', '/rankings/2026-41', '/rankings/2026-40']) expect(urls).not.toContain(path);
  expect(new Set(urls).size).toBe(urls.length);
});
