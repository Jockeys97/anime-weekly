import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', () => ({ getSeason: vi.fn() }));
import { getSeason } from '../lib/anilist';
import sitemap from '../app/sitemap';
import robots from '../app/robots';
import { buildSitemap } from '../lib/seo-sitemap';
import { serializeJsonLd, siteUrl } from '../lib/seo';
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });
describe('SEO sitemap', () => {
  it('includes weeks across year boundaries, three calendar years, platforms and valid unique anime', () => {
    const urls = buildSitemap([21, 21, -1, NaN, 2147483648, 42], new Date('2026-01-01T12:00:00Z'), new URL('https://anime.example')).map(entry => entry.url);
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
  it('bounds season anime entries to fifty', () => {
    expect(buildSitemap(Array.from({ length: 80 }, (_, i) => i + 1)).filter(entry => entry.url.includes('/anime/'))).toHaveLength(50);
  });
  it('loads the current season with one query and retains static URLs on source failure', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T10:00:00Z'));
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://anime.example');
    vi.mocked(getSeason).mockResolvedValue({ media: [], pageInfo: { currentPage: 1, hasNextPage: false } });
    expect((await sitemap()).length).toBe(60);
    expect(getSeason).toHaveBeenCalledExactlyOnceWith(2026, 'fall');
  });
  it('uses the same base URL for robots and metadata', () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: 'https://custom.example/path', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('https://custom.example/');
    expect(siteUrl({ NODE_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('https://weeklyanime.com/');
    expect(siteUrl({ VERCEL_ENV: 'production' }).href).toBe('https://weeklyanime.com/');
    expect(siteUrl({ NODE_ENV: 'development', VERCEL_PROJECT_PRODUCTION_URL: 'production.example' }).href).toBe('http://localhost:3000/');
    expect(siteUrl({}).href).toBe('http://localhost:3000/');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://custom.example');
    expect(robots()).toEqual({ rules: { userAgent: '*', allow: '/', disallow: '/api/' }, sitemap: 'https://custom.example/sitemap.xml' });
  });
  it('escapes script termination in JSON-LD without changing its data', () => {
    const data = { name: '</script><script>alert(1)</script>' };
    expect(serializeJsonLd(data)).not.toContain('<');
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
