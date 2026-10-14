import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('../components/StreamingCountry', () => ({ useStreamingCountry: () => ({ region: 'US' }) }));
vi.mock('../components/RatingSummary', () => ({ RatingSummary: () => React.createElement('p', null, 'Ratings still pending') }));
import { CatalogCardExtras } from '../components/CatalogCardExtras';
import { CatalogWatchProvider } from '../components/CatalogWatchContext';

it('shows confirmed seasonal streaming links before the separate card/rating request completes', () => {
  const html = renderToStaticMarkup(React.createElement(CatalogWatchProvider, {
    snapshot: { unavailable: false, titles: { 'anilist:123': {
      match: { id: 456, kind: 'tv' }, providersUnavailable: false,
      providers: { US: { link: 'https://example.test/us', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } },
    } } },
  }, React.createElement(CatalogCardExtras, { id: 123, name: 'Example', score: 85 })));
  expect(html).toContain('Ratings still pending');
  expect(html).toContain('Netflix');
  expect(html).toContain('id=456&amp;region=US&amp;provider=8');
  expect(html).not.toContain('id=123&amp;region=US');
  expect(html).not.toContain('Loading streaming availability');
});
