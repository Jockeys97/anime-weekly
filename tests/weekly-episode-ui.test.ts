import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WeeklyTopFive } from '../components/WeeklyTopFive';
import type { WeeklyEpisodes } from '../lib/weekly-episodes';
const render = (initialEpisodes?: WeeklyEpisodes) => renderToStaticMarkup(React.createElement(WeeklyTopFive, { slug: '2026-42', initialEpisodes }));
it('renders exact IMDb episode links, vote counts and IMDb numbering from a cached snapshot', () => {
  const html = render({ status: 'ready', entries: [{ imdbId: 'tt1234', seriesId: 1, seriesName: 'Example', title: 'An episode', season: 2, episode: 12, date: '2026-10-12', score: 9.1, votes: 1230, poster: null }] });
  expect(html).toContain('https://www.imdb.com/title/tt1234/');
  expect(html).toContain('Stagione 2 · Episodio 12');
  expect(html).toContain('An episode');
  expect(html).toContain('9.1');
  expect(html).toContain('voti');
  expect(html).not.toContain('AniList');
});
it('distinguishes a cold daily snapshot, an upstream failure and episodes without ratings', () => {
  expect(render()).toContain('Caricamento dei voti');
  expect(render({ entries: [], status: 'pending' })).toContain('non è ancora stata aggiornata');
  expect(render({ entries: [], status: 'unavailable' })).toContain('temporaneamente non disponibili');
  expect(render({ entries: [], status: 'ready' })).toContain('Nessun episodio già uscito');
});
