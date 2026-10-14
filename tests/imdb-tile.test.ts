import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ImdbRatingTile } from '../components/RatingSummary';
it('distinguishes loading, an outage, an unmatched title and a genuinely absent score', () => {
  const render = (ratings: Parameters<typeof ImdbRatingTile>[0]['ratings'], pending = false) => renderToStaticMarkup(React.createElement(ImdbRatingTile, { ratings, pending, title: 'Example', locale: 'it', lookup: { tmdbId: 1, kind: 'tv' } }));
  expect(render({}, true)).toContain('Caricamento dei voti');
  expect(render({ imdbStatus: 'error' })).toContain('Non recuperato');
  expect(render({ imdbStatus: 'error' })).toContain('Riprova');
  expect(render({ imdbStatus: 'unmatched' })).toContain('Nessun abbinamento IMDb confermato');
  expect(render({ imdbStatus: 'unavailable' })).toContain('Non è ancora disponibile un voto IMDb');
  expect(render({ imdbStatus: 'error' })).not.toContain('n/a');
  expect(render({ imdbRating: '8.6', imdbStatus: 'ready' })).toContain('8.6');
});
