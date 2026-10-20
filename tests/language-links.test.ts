/* eslint-disable react/no-children-prop */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageLinks, LocaleProvider } from '@/components/LanguageSelector';
import { SiteFooter } from '@/components/SiteChrome';
import { getDictionary } from '@/lib/i18n';
import { saveLanguage } from '@/lib/language-client';
import { localePath } from '@/lib/locale-routing';
import { locales, type Locale } from '@/lib/locales';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname, useRouter: () => ({}) }));
vi.mock('@/components/NewsletterSignup', () => ({ NewsletterSignup: () => null }));
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => vi.unstubAllGlobals());

function renderLinks(pathname: string, locale: Locale) {
  route.pathname = pathname;
  return renderToString(React.createElement(LocaleProvider, { locale, children: React.createElement(LanguageLinks) }));
}

it.each(locales)('server-renders six crawlable equivalent language URLs for %s', locale => {
  for (const path of ['/', '/anime/21-one-piece', '/week/2026-42', '/season/2026/fall', '/piattaforma/netflix/it', '/this-week', '/best-this-season']) {
    const html = renderLinks(localePath(path, locale), locale);
    expect(html).toContain(`aria-label="${getDictionary(locale).language.languages}"`);
    expect(html.match(/<a /g)).toHaveLength(6);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    for (const language of locales) {
      expect(html).toContain(`href="${localePath(path, language)}" hrefLang="${language}" lang="${language}"${language === locale ? ' aria-current="page"' : ''}`);
    }
    expect(html).not.toMatch(/href="\/it(?:\/|["?#])/);
  }
});

it('renders identical initial markup across the Italian server rewrite and public browser pathname', () => {
  for (const path of ['/', '/anime/21-one-piece', '/piattaforma/netflix/it']) {
    const serverHtml = renderLinks(`/it${path === '/' ? '' : path}`, 'it');
    vi.stubGlobal('window', { location: { pathname: path, search: '?page=2' } });
    expect(renderLinks(path, 'it')).toBe(serverHtml);
    vi.unstubAllGlobals();
    vi.stubGlobal('React', React);
  }
});

it('includes the language navigation in the server-rendered footer', () => {
  route.pathname = '/fr/week/2026-42';
  const html = renderToString(React.createElement(LocaleProvider, { locale: 'fr', children: React.createElement(SiteFooter) }));
  expect(html).toContain('aria-label="Langues"');
  expect(html).toContain('href="/week/2026-42" hrefLang="it" lang="it"');
});

it('saves the same language preference through the existing cookie endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetch);
  await saveLanguage('pt');
  expect(fetch).toHaveBeenCalledWith('/api/language', expect.objectContaining({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"locale":"pt"}', keepalive: true,
  }));
  fetch.mockResolvedValue({ ok: false });
  await expect(saveLanguage('en')).rejects.toThrow('Language update failed');
});
