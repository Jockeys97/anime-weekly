import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnimeSearchFilters } from '../components/AnimeSearchFilters';
import { PlatformOptionsProvider } from '../components/PlatformOptions';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';
import { parseAnimeFilters } from '../lib/anime-search';

it('puts the instant platform select in the search form without submitting it', () => {
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale: 'it' },
    React.createElement(StreamingCountryProvider, null,
      React.createElement(PlatformOptionsProvider, null, React.createElement(AnimeSearchFilters, { filters: parseAnimeFilters({}), locale: 'it' })))));
  const fields = html.slice(html.indexOf('explore-fields'));
  const platform = fields.slice(fields.lastIndexOf('<label', fields.indexOf('>Netflix<')));
  expect(platform).toMatch(/^<label>Piattaforma<select/);
  expect(platform.slice(0, platform.indexOf('</select>'))).not.toContain('name=');
  expect(platform).toContain('>Prime Video<');
});
