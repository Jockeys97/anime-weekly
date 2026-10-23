import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { HeaderNavigation } from '../components/HeaderNavigation';
import { LocaleProvider } from '../components/LanguageSelector';
import { landingSlugs, localePath } from '../lib/locale-routing';
import { locales, type Locale } from '../lib/locales';
const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

function activeLinks(pathname: string, locale: Locale) {
  route.pathname = pathname;
  const html = renderToStaticMarkup(createElement(LocaleProvider, { locale } as Parameters<typeof LocaleProvider>[0],
    createElement(HeaderNavigation, { locale, myAnimeEnabled: true })));
  return [...html.matchAll(/<a\b([^>]+)>/g)].filter(match => match[1].includes('aria-current="page"'))
    .map(match => match[1].match(/href="([^"]+)"/)![1]);
}
it.each(locales)('matches rewritten and public seasonal landing slugs identically (%s)', locale => {
  const href = localePath('/best-this-season', locale);
  for (const slug of new Set(['best-this-season', ...Object.values(landingSlugs['best-this-season'])])) {
    for (const path of [`/${slug}`, `/${locale}/${slug}`, `/${locale}/${slug}/action`]) {
      expect(activeLinks(path, locale)).toEqual([href]);
    }
  }
});
it.each(locales)('leaves only the current section active after moving away from best-season (%s)', locale => {
  expect(activeLinks(localePath('/best-this-season', locale), locale)).toEqual([localePath('/best-this-season', locale)]);
  for (const [path, section] of [['/season/2026/fall', '/season'], ['/search', '/search'], ['/tier-list', '/tier-list'], ['/my-anime', '/my-anime'], ['/anime/21-one-piece', '/season'], ['/', '/']] as const) {
    expect(activeLinks(localePath(path, locale), locale)).toEqual([localePath(section, locale)]);
  }
});
