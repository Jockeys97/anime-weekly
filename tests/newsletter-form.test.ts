import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NewsletterSignup } from '../components/NewsletterSignup';
import { LocaleProvider } from '../components/LanguageSelector';
import { getDictionary } from '../lib/i18n';
import { locales } from '../lib/locales';

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it('renders nothing unless the public feature flag is exactly enabled', () => {
  for (const value of ['', '0', 'true']) {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', value);
    expect(renderToStaticMarkup(React.createElement(NewsletterSignup))).toBe('');
  }
});
it('starts in Italian and gives repeated forms unique accessible controls', () => {
  vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null, React.createElement(NewsletterSignup), React.createElement(NewsletterSignup)));
  expect(html).toContain(getDictionary('it').newsletter.title);
  expect(html.match(/type="email"/g)).toHaveLength(2);
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  expect(html.match(/required=""/g)).toHaveLength(4);
  expect(html).toMatch(/<input[^>]*tabindex="-1"[^>]*name="website"/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  expect(new Set(ids).size).toBe(ids.length);
});
it.each(locales)('uses the existing locale context for signup copy in %s', locale => {
  vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale } as React.ComponentProps<typeof LocaleProvider>, React.createElement(NewsletterSignup)));
  expect(html).toContain(getDictionary(locale).newsletter.title);
});
