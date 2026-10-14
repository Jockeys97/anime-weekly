import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AnimeActions } from '../components/AnimeActions';
it('keeps the watchlist identity and exports the verified AniList calendar in weekly and detail placements', () => {
  for (const placement of ['weekly', 'detail'] as const) {
    const html = renderToStaticMarkup(React.createElement(AnimeActions, { watchlistId: 'anilist:161645', animeId: 161645, locale: 'it', placement }));
    expect(html).toContain('aria-label="Aggiungi alla mia lista"');
    expect(html).toContain('href="/api/ics/anime/161645"');
    expect(html).toContain('download="anime-161645.ics"');
    expect(html).toContain('Aggiungi al calendario (.ics)');
  }
});
it('does not export a calendar using an unverified or invalid catalog identity', () => {
  for (const animeId of [undefined, null, 0, NaN, 1.5, 2147483648]) {
    const html = renderToStaticMarkup(React.createElement(AnimeActions, { watchlistId: 'tv:1', animeId, locale: 'en' }));
    expect(html).toContain('watchlist-button');
    expect(html).not.toContain('/api/ics/anime/');
  }
});
