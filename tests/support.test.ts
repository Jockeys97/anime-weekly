/* eslint-disable react/no-children-prop */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../components/NewsletterSignup', () => ({ NewsletterSignup: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
import { supportUrl } from '../lib/support';
import { SiteFooter } from '../components/SiteChrome';
import { LocaleProvider } from '../components/LanguageSelector';
import { getDictionary, locales } from '../lib/i18n';
afterEach(() => vi.unstubAllEnvs());

it.each(['', ' ', 'http://ko-fi.com/example', '/relative', 'javascript:alert(1)', 'invalid', 'https://user:secret@ko-fi.com/example'])('hides the entire support section and link for %j', value => {
  vi.stubEnv('NEXT_PUBLIC_KOFI_URL', value);
  expect(supportUrl()).toBeNull();
  const html = renderToStaticMarkup(React.createElement(SiteFooter));
  expect(html).not.toContain('site-support'); expect(html).not.toContain('ko-fi.com');
});

it.each(locales)('renders localized support links safely for %s', locale => {
  vi.stubEnv('NEXT_PUBLIC_KOFI_URL', 'https://ko-fi.com/example');
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale, children: React.createElement(SiteFooter) }));
  const d = getDictionary(locale).support;
  expect(d.title.length).toBeGreaterThan(0); expect(d.description.length).toBeGreaterThan(0);
  expect(html).toContain(d.title); expect(html).toContain(d.description);
  expect(html.match(/href="https:\/\/ko-fi.com\/example" target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
});
