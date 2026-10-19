import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, useRouter: () => ({}), usePathname: () => '/en' }));
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }));
vi.mock('../components/WeeklyGuide', () => ({ WeeklyGuide: () => null }));
import { locales } from '../lib/locales';
import { getDictionary } from '../lib/i18n';
import { getRequestLocale } from '../lib/request-locale';
import { languageAlternates, localePath, openGraphLocales, stripLocale } from '../lib/locale-routing';
import { pageMetadata } from '../lib/seo';
import RootLayout, { generateStaticParams } from '../app/[locale]/layout';
import { generateMetadata as homeMetadata } from '../app/[locale]/page';
import { generateMetadata as weekMetadata } from '../app/[locale]/week/[week]/page';
import { generateMetadata as seasonMetadata } from '../app/[locale]/season/[year]/[season]/page';
import { generateMetadata as searchMetadata } from '../app/[locale]/search/page';
import PlatformsPage, { generateMetadata as platformsMetadata } from '../app/[locale]/piattaforma/page';
import { generateMetadata as platformMetadata } from '../app/[locale]/piattaforma/[provider]/[country]/page';
import { buildAnimeSitemap, buildPagesSitemap } from '../lib/seo-sitemap';

beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://weeklyanime.com'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(locales)('renders server HTML in %s with localized navigation, forms and text', async locale => {
  const params = Promise.resolve({ locale });
  const children = await PlatformsPage({ params });
  const html = renderToStaticMarkup(await RootLayout({ params, children }));
  const d = getDictionary(locale);
  expect(html).toContain(`<html lang="${locale}">`);
  expect(html).toContain(`<h1>${d.seo.platformsTitle}</h1>`);
  expect(html).toContain(`action="${localePath('/search', locale)}"`);
  expect(html).toContain(`href="${localePath('/piattaforma/netflix/it', locale)}"`);
  expect(html).toContain(`href="${localePath('/season', locale)}"`);
  expect(html).toContain(`value="${locale}" lang="${locale}" selected=""`);
});

it.each(locales)('emits self canonicals, localized metadata and reciprocal hreflang for %s', async locale => {
  const params = Promise.resolve({ locale });
  const cases = [
    ['/', await homeMetadata({ params })],
    ['/week/2026-42', await weekMetadata({ params: Promise.resolve({ locale, week: '2026-42' }) })],
    ['/season/2026/fall?page=2', await seasonMetadata({ params: Promise.resolve({ locale, year: '2026', season: 'fall' }), searchParams: Promise.resolve({ page: '2' }) })],
    ['/search', await searchMetadata({ params, searchParams: Promise.resolve({}) })],
    ['/piattaforma', await platformsMetadata({ params })],
    ['/piattaforma/netflix/it', await platformMetadata({ params: Promise.resolve({ locale, provider: 'netflix', country: 'it' }) })],
  ] as const;
  for (const [path, metadata] of cases) {
    const canonical = `https://weeklyanime.com${localePath(path, locale)}`;
    const languages = languageAlternates(path, new URL('https://weeklyanime.com'));
    expect(metadata.alternates).toEqual({ canonical, languages });
    expect(Object.keys(languages)).toHaveLength(7);
    expect(languages['x-default']).toBe(languages.it);
    expect(metadata.openGraph).toMatchObject({ url: canonical, locale: openGraphLocales[locale] });
    if (locale !== 'it') expect(metadata.description).not.toContain('Uscite anime');
    for (const other of locales) {
      expect(pageMetadata('T', 'D', path, undefined, other).alternates?.languages).toEqual(languages);
    }
  }
  expect(cases[0][1].description).toBe(getDictionary(locale).metadata.description);
});
it.each(locales)('keeps query searches noindex for %s', async locale => {
  expect((await searchMetadata({ params: Promise.resolve({ locale }), searchParams: Promise.resolve({ q: 'Ranma' }) })).robots).toEqual({ index: false, follow: true });
});
it('rejects unsupported route locales without inspecting cookies or headers', async () => {
  await expect(getRequestLocale(Promise.resolve({ locale: 'ja' }))).rejects.toThrow('not-found');
  expect(generateStaticParams()).toEqual(locales.map(locale => ({ locale })));
});
it.each([
  ['/en/anime/21', 'fr', '/fr/anime/21'], ['/it/anime/21', 'en', '/en/anime/21'],
  ['/es/season/2026/fall?page=2#catalog', 'it', '/season/2026/fall?page=2#catalog'],
  ['/search?q=example.com', 'de', '/de/search?q=example.com'], ['/?source=test#top', 'en', '/en?source=test#top'],
  ['/en', 'it', '/'], ['/api/language', 'fr', '/api/language'], ['/icon.svg', 'fr', '/icon.svg'],
  ['https://anilist.co/anime/21', 'en', 'https://anilist.co/anime/21'], ['//example.com/a', 'fr', '//example.com/a'], ['#day-1', 'en', '#day-1'],
] as const)('maps equivalent link %s to %s', (path, locale, expected) => {
  expect(localePath(path, locale)).toBe(expected);
});
it('strips only a supported leading locale, preserving provider countries', () => {
  expect(stripLocale('/en/piattaforma/netflix/it')).toBe('/piattaforma/netflix/it');
  expect(stripLocale('/english/anime/21')).toBe('/english/anime/21');
});
it('lists each language version with reciprocal sitemap alternates and no duplicate fetch work', () => {
  const base = new URL('https://weeklyanime.com');
  for (const entries of [buildPagesSitemap(new Date('2026-10-19'), base), buildAnimeSitemap([{ id: 21 }, { id: 21 }], base)]) {
    expect(new Set(entries.map(entry => entry.url)).size).toBe(entries.length);
    const urls = new Set(entries.map(entry => entry.url));
    for (const entry of entries) {
      const languages = entry.alternates!.languages!;
      expect(Object.keys(languages)).toHaveLength(7);
      expect(languages['x-default']).toBe(languages.it);
      for (const locale of locales) {
        expect(urls.has(languages[locale] as string)).toBe(true);
        expect(entries.find(other => other.url === languages[locale])?.alternates).toEqual(entry.alternates);
      }
    }
  }
});
