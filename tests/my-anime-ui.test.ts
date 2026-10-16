import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { MyAnimeContent } from '../components/MyAnimeContent';
import { MyAnimeStatsView } from '../components/MyAnimeStats';
import type { PersonalWeekData } from '../lib/my-anime-data';
import { getDictionary } from '../lib/i18n';
const data: PersonalWeekData = { releases: [
  { key: '1', title: 'Example Anime', airingAt: Date.parse('2026-10-20T12:00:00Z'), season: 0, episode: 52, anilistId: 21, poster: 'https://s4.anilist.co/file/cover.jpg', sources: ['trakt'] },
  { key: '2', title: 'Example Anime', airingAt: Date.parse('2026-10-20T12:00:00Z'), season: 1, episode: 1, anilistId: 21, sources: ['trakt'] },
], followed: 1, unmatched: 0, unavailable: [] };
it('renders one poster card for an episode batch, with an explicit special label and anime detail link', () => {
  const html = renderToStaticMarkup(createElement(MyAnimeContent, { providers: { trakt: true, mal: false }, connected: { trakt: true, mal: false }, data, start: '2026-10-19', end: '2026-10-25', authError: false }));
  expect(html.match(/class="my-anime-release-card"/g)).toHaveLength(1);
  expect(html).toContain('Speciale 52'); expect(html).not.toContain('Stagione 0');
  expect(html).toContain('/anime/21'); expect(html).toContain('cover.jpg');
  expect(html).toContain('2 episodi'); expect(html).toContain('Caricamento delle tue statistiche anime');
  // A first stats import must not disable the calendar's recovery action.
  expect(html).not.toMatch(/class="my-anime-refresh"[^>]*disabled/);
});
it('labels missing runtimes and partial statistics rather than displaying a false complete total', () => {
  const html = renderToStaticMarkup(createElement(MyAnimeStatsView, { locale: 'it', data: { status: 'ready', series: 2, episodes: 10, plays: 12, rewatches: 2, minutes: 240, partial: true, missingRuntimePlays: 1, unmatched: 1, updatedAt: '2026-10-16T12:00:00Z' } }));
  expect(html).toContain('Totali parziali'); expect(html).toContain('Durata mancante per 1'); expect(html).toContain('Ore guardate');
  expect(html.match(/<dd>/g)).toHaveLength(4);
});
it('keeps all six language dictionaries in sync', () => {
  for (const locale of ['en', 'it', 'es', 'fr', 'de', 'pt']) expect(Object.keys(getDictionary(locale).myAnime).sort()).toEqual(Object.keys(getDictionary('en').myAnime).sort());
});
