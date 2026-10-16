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

it('includes snapshot providers in a seasonal card without waiting for browser enrichment', () => {
  const html = renderToStaticMarkup(React.createElement(CatalogCardExtras, { id: 123, name: 'Example', score: 85,
    initialSummary: { ratings: { anilistId: 123, anilistScore: 85, imdbRating: '8.1' }, availability: {
      match: { id: 456, kind: 'tv' }, providersUnavailable: false,
      providers: { US: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } },
    } },
  }));
  expect(html).toContain('Netflix'); expect(html).toContain('id=456&amp;region=US&amp;provider=8');
  expect(html).not.toContain('Loading streaming availability');
});

it('uses seasonal provider metadata when a rating snapshot had no saved offers', () => {
  const html = renderToStaticMarkup(React.createElement(CatalogWatchProvider, {
    snapshot: { unavailable: false, titles: { 'anilist:123': { match: { id: 456, kind: 'tv' }, providersUnavailable: false,
      providers: { US: { link: '', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } },
    } } },
  }, React.createElement(CatalogCardExtras, { id: 123, name: 'Example', score: 85,
    initialSummary: { ratings: { anilistScore: 85 }, availability: { match: { id: 456, kind: 'tv' }, providers: {}, providersUnavailable: false } },
  })));
  expect(html).toContain('Netflix');
});

it('attributes early season-family links to the series with the correct TMDB identity', () => {
  const html = renderToStaticMarkup(React.createElement(CatalogWatchProvider, {
    snapshot: { unavailable: false, titles: { 'anilist:123': {
      match: null, providers: {}, providersUnavailable: false,
      seriesWatch: { id: 456, kind: 'tv', name: 'Parent series', providersUnavailable: false,
        providers: { US: { link: 'https://example.test/us', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } } },
    } } },
  }, React.createElement(CatalogCardExtras, { id: 123, name: 'Example Season 3', score: 85 })));
  expect(html).toContain('Series watch options: Parent series');
  expect(html).toContain('id=456&amp;region=US&amp;provider=8');
  expect(html).not.toContain('id=0&amp;region=US');
});
