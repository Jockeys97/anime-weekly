/* eslint-disable react/no-children-prop */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnimeSearchFilters } from '../components/AnimeSearchFilters';
import { PlatformOptionsProvider } from '../components/PlatformOptions';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';
import { parseAnimeFilters } from '../lib/anime-search';

it('puts the instant platform select in the search form without submitting it', () => {
  // children inside props: LocaleProvider types them as required (tsc runs on tests in next build).
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'it', children:
    React.createElement(StreamingCountryProvider, null,
      React.createElement(PlatformOptionsProvider, null, React.createElement(AnimeSearchFilters, { filters: parseAnimeFilters({}), locale: 'it' }))) }));
  const fields = html.slice(html.indexOf('explore-fields'));
  const platform = fields.slice(fields.lastIndexOf('<label', fields.indexOf('>Netflix<')));
  expect(platform).toMatch(/^<label>Piattaforma<select/);
  expect(platform.slice(0, platform.indexOf('</select>'))).not.toContain('name=');
  expect(platform).toContain('>Prime Video<');
});

it('places the optional MAL checkboxes above the field grid (before Genres) and preserves its selected state', () => {
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'en', children:
    React.createElement(StreamingCountryProvider, null,
      React.createElement(PlatformOptionsProvider, null, React.createElement(AnimeSearchFilters, { filters: parseAnimeFilters({ malRating: 'r-plus' }), locale: 'en' }))) }));
  expect(html).toContain('name="malRating"'); expect(html).toContain('value="r-plus"');
  expect(html).toMatch(/type="checkbox"[^>]*name="malRating"[^>]*checked=""/); expect(html).toContain('value="hx"');
  expect(html.indexOf('explore-classification')).toBeLessThan(html.indexOf('explore-fields'));
  expect(html).toContain('Only R+ · Mild Nudity');
});

it('renders selected genres as independent checked fields and explains the intersection', () => {
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'it', children:
    React.createElement(StreamingCountryProvider, null,
      React.createElement(PlatformOptionsProvider, null, React.createElement(AnimeSearchFilters, { filters: parseAnimeFilters({ genre: ['Action', 'Comedy', 'Martial Arts'] }), locale: 'it' }))) }));
  expect(html).toContain('Azione + Commedia + Combattimenti / arti marziali');
  expect(html).toContain('I risultati devono corrispondere a tutte le scelte.');
  for (const genre of ['Action', 'Comedy', 'Martial Arts']) expect(html).toContain(`name="genre" checked="" value="${genre}"`);
});
