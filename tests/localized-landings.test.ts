import { vi } from 'vitest';
vi.mock('@/lib/soft-failure-gate', async () => { const { NextResponse } = await import('next/server'); return { isAnimeUnavailable: vi.fn(async () => false), animeUnavailableResponse: () => new NextResponse('down', { status: 503, headers: { 'Retry-After': '120', 'Cache-Control': 'no-store' } }) }; });
import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../proxy';
import { landingSlugs, localePath } from '../lib/locale-routing';
import { locales } from '../lib/locales';

it('redirects every seasonal hentai alias straight to its localized hub before page rendering', async () => {
  const slugs = new Set(['best-this-season', ...Object.values(landingSlugs['best-this-season'])]);
  for (const locale of locales) {
    const target = localePath('/search/hentai', locale);
    for (const prefix of locale === 'it' ? ['', '/it'] : [`/${locale}`]) {
      for (const slug of slugs) {
        const path = `${prefix}/${slug}/hentai`;
        expect(unstable_doesMiddlewareMatch({ config, url: path }), path).toBe(true);
        const response = await proxy(new NextRequest(`https://weeklyanime.com${path}?source=test`));
        expect(response.status, path).toBe(308);
        expect(response.headers.get('location'), path).toBe(`https://weeklyanime.com${target}?source=test`);
        expect(response.headers.get('x-middleware-rewrite'), path).toBeNull();
      }
    }
    const path = localePath('/best-this-season/action', locale);
    const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`));
    expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/${locale}/best-this-season/action`);
    expect(response.headers.get('location')).toBeNull();
  }
});

it('rewrites every canonical slug and permanently redirects every legacy or wrong-language slug in one hop', async () => {
  for (const [internal, translations] of Object.entries(landingSlugs)) {
    const slugs = new Set([internal, ...Object.values(translations)]);
    for (const locale of locales) {
      const canonical = locale === 'it' ? `/${translations.it}` : `/${locale}/${translations[locale]}`;
      for (const slug of slugs) {
        for (const prefix of locale === 'it' ? ['', '/it'] : [`/${locale}`]) {
          const path = `${prefix}/${slug}`;
          expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(true);
          const response = await proxy(new NextRequest(`https://weeklyanime.com${path}?source=test`));
          if (path === canonical) {
            expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/${locale}/${internal}?source=test`);
          } else {
            expect(response.status).toBe(308);
            expect(response.headers.get('location')).toBe(`https://weeklyanime.com${canonical}?source=test`);
          }
          for (const target of locales) {
            const expected = target === 'it' ? `/${translations.it}` : `/${target}/${translations[target]}`;
            expect(localePath(`${path}?page=2#list`, target)).toBe(`${expected}?page=2#list`);
          }
        }
      }
    }
  }
});


it('localizes and rewrites ranking OG paths using the same this-week alias', async () => {
  for (const locale of locales) {
    const path = localePath('/rankings/this-week/opengraph-image', locale);
    const response = await proxy(new NextRequest(`https://weeklyanime.com${path}`));
    expect(response.headers.get('x-middleware-rewrite')).toBe(`https://weeklyanime.com/${locale}/rankings/this-week/opengraph-image`);
  }
});
