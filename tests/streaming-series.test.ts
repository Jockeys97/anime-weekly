import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
const country = vi.hoisted(() => ({ region: 'IT' }));
vi.mock('../components/StreamingCountry', () => ({ useStreamingCountry: () => country }));
vi.mock('../components/ProviderLink', () => ({ ProviderLink: ({ href, children }: { href: string; children: React.ReactNode }) => React.createElement('a', { href }, children) }));
import { StreamingAvailability } from '../components/StreamingAvailability';
const offer = { link: 'https://example.com', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] };
const anime = { id: 99, kind: 'tv' as const, name: 'Example Season 2', providers: { US: offer }, providersUnavailable: false };
const seriesWatch = { id: 1429, kind: 'tv' as const, name: 'Example', providers: { IT: offer, US: offer }, providersUnavailable: false };
afterEach(() => { country.region = 'IT'; });
it('routes a missing regional season offer to the original series and labels its scope', () => {
  const html = renderToStaticMarkup(React.createElement(StreamingAvailability, { anime, seriesWatch, locale: 'it' }));
  expect(html).toContain('Piattaforme della serie: Example');
  expect(html).toContain('Verifica che includano la stagione selezionata');
  expect(html).toContain('id=1429&amp;region=IT');
  expect(html).not.toContain('id=99');
});
it('prefers the exact season in countries with direct offers', () => {
  country.region = 'US';
  const html = renderToStaticMarkup(React.createElement(StreamingAvailability, { anime, seriesWatch, locale: 'it' }));
  expect(html).toContain('id=99&amp;region=US');
  expect(html).not.toContain('Piattaforme della serie');
});
it('does not offer another country’s services when neither source covers the selection', () => {
  country.region = 'JP';
  const html = renderToStaticMarkup(React.createElement(StreamingAvailability, { anime, seriesWatch, locale: 'it' }));
  expect(html).not.toContain('/api/watch');
  expect(html).not.toContain('Piattaforme della serie');
});
