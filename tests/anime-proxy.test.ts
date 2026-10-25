import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// The installed 16.4 build still exposes the helper under its middleware name.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../proxy';

it.each(['cyberpunk-edgerunners-2', '-1', '1.5', '21-', '%E0%A4%A', '%63yberpunk'])('rewrites invalid detail ID %s to the unmatched 404 route', id => {
  const response = proxy(new NextRequest(`https://weeklyanime.com/anime/${id}?source=test`));
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/_anime-not-found/invalid?source=test');
});

it.each([['/anime/21', 'it'], ['/anime/%32%31', 'it'], ['/en/anime/999999999', 'en'], ['/es/anime/203367?x=1', 'es']])('rewrites bare numeric %s to the slug redirect handler', (path, locale) => {
  const response = proxy(new NextRequest(`https://weeklyanime.com${path}`));
  const id = decodeURIComponent(path.split('/').at(-1)!.split('?')[0]);
  expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/api/anime-redirect/${id}?locale=${locale}`);
});

it.each(['21-one-piece', '21-cyberpunk-2'])('passes slug ID %s through to the route', id => {
  const response = proxy(new NextRequest(`https://weeklyanime.com/anime/${id}`));
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
])('matches public pages and excludes APIs/assets: %s', (url, expected) => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
});

it.each(['en', 'es', 'fr', 'de', 'pt'])('redirects a first human home visit to %s once, before cache', locale => {
  const response = proxy(new NextRequest('https://weeklyanime.com/?source=test', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': `${locale}-ZZ,it;q=0.8` } }));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(`https://weeklyanime.com/${locale}?source=test`);
  expect(response.cookies.get('anime-language')?.value).toBe(locale);
  for (const value of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=lax']) expect(response.headers.get('set-cookie')).toContain(value);
  expect(response.headers.get('cache-control')).toContain('no-store');
  for (const value of ['Accept-Language', 'Cookie', 'User-Agent']) expect(response.headers.get('vary')).toContain(value);
});
it.each(['', 'Googlebot', 'bingbot', 'SomeBot/1.0', 'crawler', 'spider', 'Slurp', 'facebookexternalhit', 'Embedly', 'LinkPreview', 'Mozilla/5.0 Googlebot/2.1'])('never language-redirects UA %j', ua => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': ua, 'Accept-Language': 'en-US' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.cookies.get('anime-language')).toBeUndefined();
  expect(response.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/it');
});
it.each(['it', '', 'invalid'])('ignores Accept-Language when a cookie exists and keeps Italian (%j)', value => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: `anime-language=${value}` } }));
  expect(response.headers.get('location')).toBeNull();
});
it('sends a returning visitor with a saved non-Italian choice to that home only', () => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: 'anime-language=en' } }));
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/en');
  const deep = proxy(new NextRequest('https://weeklyanime.com/anime/21', { headers: { 'User-Agent': 'Mozilla/5.0', Cookie: 'anime-language=en' } }));
  expect(deep.headers.get('location')).toBeNull();
  const bot = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Googlebot/2.1', Cookie: 'anime-language=en' } }));
  expect(bot.headers.get('location')).toBeNull();
});
it.each(['it-IT,en;q=0.9', 'ja-JP', '', '*', 'en;q=0', 'en;q=bad'])('leaves Italian/unsupported preferences at home: %s', language => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': language } }));
  expect(response.headers.get('location')).toBeNull();
});
it('negotiates the highest-quality supported language', () => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja,pt-BR;q=0.4,fr-CA;q=0.9,en;q=0' } }));
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/fr');
});
it.each(['/anime/21', '/week/2026-42', '/season/2026/fall', '/search?q=Ranma', '/piattaforma/netflix/it', '/en', '/es/anime/21'])('never negotiates or sets cookies on %s', path => {
  const response = proxy(new NextRequest(`https://weeklyanime.com${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
});
it.each(['en', 'es', 'fr', 'de', 'pt'])('preserves early 404 rejection and valid details in %s', locale => {
  const invalid = proxy(new NextRequest(`https://weeklyanime.com/${locale}/anime/cyberpunk?source=test`));
  expect(invalid.headers.get('x-middleware-rewrite')).toBe('https://weeklyanime.com/_anime-not-found/invalid?source=test');
  const valid = proxy(new NextRequest(`https://weeklyanime.com/${locale}/anime/21-one-piece`));
  expect(valid.headers.get('x-middleware-next')).toBe('1');
});
it('normalizes an explicit Italian prefix while keeping the query', () => {
  const response = proxy(new NextRequest('https://weeklyanime.com/it/season/2026/fall?page=2'));
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/season/2026/fall?page=2');
});
it.each(['/en', '/es/week/2026-42', '/de/anime/21', '/pt/search', '/fr/season/2026/fall'])('matches localized routes: %s', url => {
  expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
});
it.each(['/anime/21-one-piece', '/week/2026-42', '/season/2026/fall', '/search', '/piattaforma/netflix/it', '/en/anime/21-one-piece'])('does not let a saved language redirect deep URL %s', path => {
  const response = proxy(new NextRequest(`https://weeklyanime.com${path}`, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'fr', Cookie: 'anime-language=es' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('x-middleware-rewrite')).toBe(path.startsWith('/en/') ? null : `https://weeklyanime.com/it${path}`);
});
it('still negotiates home when only unrelated cookies are present', () => {
  const response = proxy(new NextRequest('https://weeklyanime.com/', { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en', Cookie: 'other=present' } }));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('https://weeklyanime.com/en');
});
