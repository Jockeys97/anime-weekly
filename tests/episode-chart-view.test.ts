import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EpisodeRatingsChart } from '../components/EpisodeRatingsChart';
import { LocaleProvider } from '../components/LanguageSelector';
const render = (episodes: Parameters<typeof EpisodeRatingsChart>[0]['initial']['episodes'], locale = 'it', status: 'ready' | 'unavailable' = 'ready', seriesId: string | undefined = 'tt100') => renderToStaticMarkup(React.createElement(LocaleProvider, { locale } as React.ComponentProps<typeof LocaleProvider>, React.createElement(EpisodeRatingsChart, { seriesTitle: 'Example series', seriesId, initial: { status, episodes, dataUpdatedAt: '2026-10-16T00:00:00Z' } })));
it('server renders episode ratings, real vote counts, a season selector and exact IMDb episode links', () => {
  const html = render([{ imdbId: 'tt1', season: 1, episode: 1, score: 9.2, votes: 123 }, { imdbId: 'tt2', season: 1, episode: 3, score: 8.4, votes: 321 }, { imdbId: 'tt3', season: 2, episode: 1, score: 9, votes: 10 }]);
  for (const text of ['Voti degli episodi', '9,2', '8,4', '8,8', '123', '321', 'Stagione 1', 'Stagione 2', 'E3', 'https://www.imdb.com/title/tt1/', 'height:92%']) expect(html).toContain(text);
  expect(html).toContain('aria-pressed="true"');
  expect(html).not.toContain('https://www.imdb.com/title/tt3/');
  expect(html).not.toContain('E2<');
});
it('defaults to a regular season instead of specials', () => {
  const html = render([{ imdbId: 'tt1', season: 0, episode: 1, score: 7, votes: 10 }, { imdbId: 'tt2', season: 1, episode: 1, score: 9.2, votes: 20 }]);
  expect(html).toContain('Speciali'); expect(html).toContain('9,2'); expect(html).not.toContain('https://www.imdb.com/title/tt1/');
});
it('distinguishes a cold index, a known empty series and a missing exact match', () => {
  expect(render([], 'it', 'unavailable')).toContain('prossimo aggiornamento programmato');
  expect(render([])).toContain('Non ci sono episodi con voto');
  expect(render([], 'it', 'unavailable', '')).toContain('Serve un abbinamento esatto');
});
it('switches all chart labels with the site language without translating the title', () => {
  const html = render([{ imdbId: 'tt1', season: 1, episode: 1, score: 8.1, votes: 10 }], 'en');
  expect(html).toContain('Episode ratings'); expect(html).toContain('Season 1'); expect(html).toContain('Example series'); expect(html).toContain('8.1');
});
