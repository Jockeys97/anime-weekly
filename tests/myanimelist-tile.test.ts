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
  expect(failed).toContain('temporaneamente non disponibile'); expect(failed).toContain('Riprova'); expect(failed).not.toContain('n/a');
  expect(render({ malScore: 8.12, malMembers: 1000 })).toContain('1K utenti');
});
