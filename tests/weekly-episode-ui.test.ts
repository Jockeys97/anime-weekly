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
  expect(html).toContain('Episodi con voto: 1/5');
  expect(html).toContain('fino a 5 episodi della settimana selezionata');
});
it('distinguishes a cold daily snapshot, an upstream failure and episodes without ratings', () => {
  expect(render()).toContain('Caricamento dei voti');
  expect(render({ entries: [], status: 'pending' })).toContain('non è ancora stata aggiornata');
  expect(render({ entries: [], status: 'unavailable' })).toContain('temporaneamente non disponibili');
  expect(render({ entries: [], status: 'ready' })).toContain('Nessun episodio già uscito');
  expect(render({ entries: [], status: 'ready' })).toContain('Episodi con voto: 0/5');
  expect(render()).not.toContain('Episodi con voto:');
  expect(render({ entries: [], status: 'unavailable' })).not.toContain('Episodi con voto:');
});

it('counts only verified in-week episodes and removes the incomplete explanation when all five exist', () => {
  const episode = { imdbId: 'tt1234', seriesId: 1, seriesName: 'Example', title: 'An episode', season: 1, episode: 1, date: '2026-10-12', score: 9.1, votes: 12, poster: null };
  const entries = Array.from({ length: 6 }, (_, i) => ({ ...episode, imdbId: `tt${i + 1}`, episode: i + 1 }));
  const complete = render({ entries, status: 'ready' });
  expect(complete).toContain('Episodi con voto: 5/5');
  expect(complete).not.toContain('fino a 5 episodi della settimana selezionata');
  const filtered = render({ entries: [episode, episode, { ...episode, imdbId: 'tt9999', date: '2026-10-19' }], status: 'partial' });
  expect(filtered).toContain('Episodi con voto: 1/5');
  expect(filtered).toContain('Classifica parziale');
});

it('explains an OMDb source error without claiming that the API quota was exhausted', () => {
  const html = render({ entries: [], status: 'unavailable', reason: 'source' });
  expect(html).toContain('OMDb non riesce ancora');
  expect(html).not.toContain('quota giornaliera');
  expect(render({ entries: [], status: 'unavailable', reason: 'quota' })).toContain('quota giornaliera');
});

it('credits the official dataset and distinguishes its failure from an OMDb failure', () => {
  const html = render({ entries: [], status: 'unavailable', reason: 'source', source: 'imdb-datasets', dataUpdatedAt: '2026-10-14T00:00:00Z' });
  expect(html).toContain('I dataset IMDb sono temporaneamente');
  expect(html).toContain('https://data.imdb.com/non-commercial-datasets/');
  expect(html).not.toContain('OMDb non riesce');
  expect(render({ entries: [], status: 'ready', source: 'imdb-datasets' })).toContain('voto nei dataset IMDb');
});
