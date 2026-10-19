import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { RatingSummary, MyAnimeListRatingTile, AnimeRatingTile } from '../components/RatingSummary';
it('shows IMDb, AniList and MAL independently, with exact source links', () => {
  const html = renderToStaticMarkup(React.createElement(RatingSummary, { title: 'Example', locale: 'it', ratings: { imdbId: 'tt123', imdbRating: '8.4', anilistId: 42, anilistScore: 81, malId: 123, malScore: 8.12, malScoredBy: 456789 } }));
  for (const value of ['8.4', '81%', '8.12', '456,789 voti', '/logos/myanimelist.svg', 'https://myanimelist.net/anime/123', 'https://anilist.co/anime/42/']) expect(html).toContain(value);
  expect(html.match(/class="rating-tile/g)).toHaveLength(3);
});
it('never replaces the AniList score with the MAL score', () => {
  const html = renderToStaticMarkup(React.createElement(AnimeRatingTile, { title: 'Example', ratings: { anilistScore: 81, malScore: 8.12 } }));
  expect(html).toContain('81%'); expect(html).not.toContain('8.12');
});
it('distinguishes loading, a confirmed missing score, and a service outage', () => {
  const render = (ratings: Parameters<typeof MyAnimeListRatingTile>[0]['ratings'], pending = false) => renderToStaticMarkup(React.createElement(MyAnimeListRatingTile, { title: 'Example', locale: 'it', ratings, pending }));
  expect(render({ malId: 123 }, true)).toContain('Caricamento dei voti');
  expect(render({ malId: 123, malStatus: 'unavailable' })).toContain('Non è ancora disponibile un voto MyAnimeList');
  const failed = render({ malId: 123, malStatus: 'error' });
  // Waiting for an observer to dispatch is not an active request. Without JS,
  // or with a hidden tile, this must remain a settled, retryable state.
  expect(failed).not.toContain('Caricamento dei voti'); expect(failed).toContain('Riprova');
  expect(render({ malScore: 8.12, malMembers: 1000 })).toContain('1K utenti');
});
it('renders a settled detail fallback before hydration when MAL is missing', () => {
  const html = renderToStaticMarkup(React.createElement(MyAnimeListRatingTile, { title: 'Example', locale: 'it', ratings: { malId: 123 }, eager: true }));
  expect(html).toContain('n/d');
  expect(html).not.toContain('Caricamento dei voti');
});
