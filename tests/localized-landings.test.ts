import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config, proxy } from '../proxy';
import { landingSlugs, localePath } from '../lib/locale-routing';
import { locales } from '../lib/locales';

it('rewrites every canonical slug and permanently redirects every legacy or wrong-language slug in one hop', () => {
  for (const [internal, translations] of Object.entries(landingSlugs)) {
    const slugs = new Set([internal, ...Object.values(translations)]);
    for (const locale of locales) {
      const canonical = locale === 'it' ? `/${translations.it}` : `/${locale}/${translations[locale]}`;
      for (const slug of slugs) {
        for (const prefix of locale === 'it' ? ['', '/it'] : [`/${locale}`]) {
          const path = `${prefix}/${slug}`;
          expect(unstable_doesMiddlewareMatch({ config, url: path })).toBe(true);
          const response = proxy(new NextRequest(`https://weeklyanime.com${path}?source=test`));
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
