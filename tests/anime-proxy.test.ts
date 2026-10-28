import { vi, beforeEach, afterEach } from 'vitest';
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());
vi.mock('@/lib/soft-failure-gate', async () => { const { NextResponse } = await import('next/server'); return { isAnimeUnavailable: vi.fn(async () => false), animeUnavailableResponse: () => new NextResponse('down', { status: 503, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } }) }; });
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isAnimeUnavailable } from '@/lib/soft-failure-gate';
// The installed 16.4 build still exposes the helper under its middleware name.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../proxy';

it.each(['cyberpunk-edgerunners-2', '-1', '1.5', '21-', '%E0%A4%A', '%63yberpunk'])('rewrites invalid detail ID %s to the unmatched 404 route', async id => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com/anime/${id}?source=test`));
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/_anime-not-found/invalid?source=test');
});

it.each([['/anime/21', 'it'], ['/anime/%32%31', 'it'], ['/en/anime/999999999', 'en'], ['/es/anime/203367?x=1', 'es']])('rewrites bare numeric %s to the slug redirect handler', async (path, locale) => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`));
  const id = decodeURIComponent(path.split('/').at(-1)!.split('?')[0]);
  expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/api/anime-redirect/${id}?locale=${locale}`);
});

it.each(['21-one-piece', '21-cyberpunk-2'])('passes slug ID %s through to the route', async id => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com/anime/${id}`));
  expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/it/anime/${id}`);
});

it.each([
  ['/anime/21', true], ['/anime/cyberpunk-edgerunners-2', true],
  ['/anime', true], ['/anime/21/extra', true], ['/week/2026-99', true],
  ['/api/anime-card/21', false], ['/_next/static/test.js', false], ['/', true],
  ['/en/api/anime-card/21', false], ['/fr/_next/image', false],
  ['/_next/image?url=poster.jpg', false], ['/favicon.ico', false],
  ['/robots.txt', false], ['/sitemap.xml', false], ['/sitemaps/sitemap/discovery.xml', false],
  ['/es/sitemap.xml', false], ['/en/poster.webp', false], ['/anime/poster.jpg', false],
])('matches public pages and excludes APIs/assets: %s', async (url, expected) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
});

it.each(['en', 'es', 'fr', 'de', 'pt'])('redirects a first human home visit to %s once, before cache', async locale => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/?source=test', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': `${locale}-ZZ,it;q=0.8` } }));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(`https://weeklyanime.com/${locale}?source=test`);
  expect(response.cookies.get('anime-language')?.value).toBe(locale);
  for (const value of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=lax']) expect(response.headers.get('set-cookie')).toContain(value);
  expect(response.headers.get('cache-control')).toContain('no-store');
  for (const value of ['Accept-Language', 'Cookie', 'User-Agent']) expect(response.headers.get('vary')).toContain(value);
});
it.each(['', 'Googlebot', 'bingbot', 'SomeBot/1.0', 'crawler', 'spider', 'Slurp', 'facebookexternalhit', 'Embedly', 'LinkPreview', 'Mozilla/5.0 Googlebot/2.1'])('never language-redirects UA %j', async ua => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': ua, 'Accept-Language': 'en-US' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.cookies.get('anime-language')).toBeUndefined();
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/it');
});
it.each(['it', '', 'invalid'])('ignores Accept-Language when a cookie exists and keeps Italian (%j)', async value => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: `anime-language=${value}` } }));
  expect(response.headers.get('location')).toBeNull();
});
it('sends a returning visitor with a saved non-Italian choice to that home only', async () => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: 'anime-language=en' } }));
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/en');
  const deep = await proxy(new NextRequest('https://weeklyanime.com/anime/21', { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'anime-language=en' } }));
  expect(deep.headers.get('location')).toBeNull();
  const bot = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'anime-language=en' } }));
  expect(bot.headers.get('location')).toBeNull();
});
it.each(['it-IT,en;q=0.9', 'ja-JP', '', '*', 'en;q=0', 'en;q=bad'])('leaves Italian/unsupported preferences at home: %s', async language => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': language } }));
  expect(response.headers.get('location')).toBeNull();
});
it('negotiates the highest-quality supported language', async () => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja,pt-BR;q=0.4,fr-CA;q=0.9,en;q=0' } }));
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/fr');
});
it.each(['/anime/21', '/week/2026-42', '/season/2026/fall', '/search?q=Ranma', '/piattaforma/netflix/it', '/en', '/es/anime/21'])('never negotiates or sets cookies on %s', async path => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
});
it.each(['en', 'es', 'fr', 'de', 'pt'])('preserves early 404 rejection and valid details in %s', async locale => {
  const invalid = await proxy(new NextRequest(`https://weeklyanime.com/${locale}/anime/cyberpunk?source=test`));
  expect(invalid.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/_anime-not-found/invalid?source=test');
  const valid = await proxy(new NextRequest(`https://weeklyanime.com/${locale}/anime/21-one-piece`));
  expect(valid.headers.get('x-middleware-next')).toBe('1');
});
it('normalizes an explicit Italian prefix while keeping the query', async () => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/it/season/2026/fall?page=2'));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/season/2026/fall?page=2');
});
it.each(['/en', '/es/week/2026-42', '/de/anime/21', '/pt/search', '/fr/season/2026/fall'])('matches localized routes: %s', async url => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
});
it.each(['/anime/21-one-piece', '/week/2026-42', '/season/2026/fall', '/search', '/piattaforma/netflix/it', '/en/anime/21-one-piece'])('does not let a saved language redirect deep URL %s', async path => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: 'anime-language=es' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('x-middleware-rewrite')).toBe(path.startsWith('/en/') ? null : `https://weeklyanime.com/it${path}`);
});
it('still negotiates home when only unrelated cookies are present', async () => {
  const response = await proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en', Cookie: 'other=present' } }));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/en');
});

describe('AniList soft-failure gate', () => {
  it.each(['/anime/21-one-piece', '/en/anime/21-one-piece', '/anime/21-one-piece/episodio-3', '/fr/anime/21-one-piece/similaires', '/anime/21-one-piece/simili'])('answers %s with a real uncached 503 + Retry-After while the anime is marked', async path => {
    vi.mocked(isAnimeUnavailable).mockResolvedValueOnce(true);
    const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(isAnimeUnavailable).toHaveBeenCalledWith(21);
  });
  it('passes the same URL through when not marked, and never reads the gate for other paths', async () => {
    vi.mocked(isAnimeUnavailable).mockClear();
    expect((await proxy(new NextRequest('https://weeklyanime.com/anime/21-one-piece'))).status).toBe(200);
    expect(isAnimeUnavailable).toHaveBeenCalledOnce();
    vi.mocked(isAnimeUnavailable).mockClear();
    for (const path of ['/', '/season/2026/fall', '/anime/21', '/anime/cyberpunk', '/en/rankings/2026-43']) await proxy(new NextRequest(`https://weeklyanime.com${path}`));
    expect(isAnimeUnavailable).not.toHaveBeenCalled();
  });
});

it.each(['/anime/269-bleach', '/en/anime/269-bleach', '/anime/269-bleach/episodio-3', '/fr/anime/269-bleach/similaires'])('routes unmarked %s without an extra fetch', async path => {
  const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`));
  expect(response.status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});

describe('transient AniList failure on detail URLs', () => {
  const url = 'https://weeklyanime.com/anime/269-bleach';
  it.each([500, 504])('answers an uncached 503 + Retry-After, never 500, when no cached copy exists (probe %s)', async status => {
    vi.mocked(isAnimeUnavailable).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('err', { status }));
    const response = await proxy(new NextRequest(url));
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('120');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(vi.mocked(fetch).mock.calls[0][1]?.headers).toMatchObject({ 'x-aw-cache-probe': '1' });
  });
  it('answers 503 when the probe fails or times out', async () => {
    vi.mocked(isAnimeUnavailable).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('aborted'));
    expect((await proxy(new NextRequest(url))).status).toBe(503);
  });
  it('keeps serving the last-good ISR page when the cache still has it', async () => {
    vi.mocked(isAnimeUnavailable).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const response = await proxy(new NextRequest(url));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/it/anime/269-bleach');
  });
  it('never probes or gates when AniList is healthy, nor for the probe request itself', async () => {
    await proxy(new NextRequest(url));
    vi.mocked(isAnimeUnavailable).mockResolvedValue(true);
    const probe = await proxy(new NextRequest(url, { headers: { 'x-aw-cache-probe': '1' } }));
    expect(probe.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/it/anime/269-bleach');
    expect(fetch).not.toHaveBeenCalled();
    vi.mocked(isAnimeUnavailable).mockResolvedValue(false);
  });
});
