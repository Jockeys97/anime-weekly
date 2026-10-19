/* eslint-disable react/no-children-prop */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }));
// Run mount effects after SSR with visible DOM refs, without a browser or
// real APIs. This exercises the hydration paths SSR-only tests cannot see.
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof React>('react');
  return { ...actual, useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
    useRef: (initial: unknown) => actual.useRef(initial ?? { querySelectorAll: () => [], dataset: {} }),
  };
});
vi.mock('../lib/weekly-client', () => ({ loadWeeklyLookup: vi.fn().mockResolvedValue({ events: [], episodeDates: [], anilistIds: {}, unavailable: false }), invalidateWeeklyLookup: vi.fn() }));
vi.mock('../lib/weekly-episode-client', () => ({ loadWeeklyEpisodes: vi.fn().mockResolvedValue({ entries: [], status: 'pending' }) }));
vi.mock('../lib/mal-rating-client', () => ({ loadMalRating: vi.fn().mockResolvedValue({ malStatus: 'unavailable' }) }));
vi.mock('../lib/dubbing-client', () => ({ loadDubbing: vi.fn().mockResolvedValue({ status: 'unverified', language: 'it' }) }));
import { loadWeeklyLookup } from '../lib/weekly-client';
import { loadWeeklyEpisodes } from '../lib/weekly-episode-client';
import { loadMalRating } from '../lib/mal-rating-client';
import { loadDubbing } from '../lib/dubbing-client';
import { WeeklyContent } from '../components/WeeklyContent';
import { StreamingCountryProvider } from '../components/StreamingCountry';
import { LocaleProvider } from '../components/LanguageSelector';
import type { Locale } from '../lib/locales';
import type { WeekData } from '../lib/tmdb';

const initial: WeekData = { status: 'ready', titles: [{ id: 1, kind: 'tv', name: 'Saved title', overview: 'Base language story', poster: null, ratings: { anilistId: 123, malId: 456, malStatus: 'error' }, providers: {}, providersUnavailable: false, recommendation: null }] };
const event = { id: 1, mediaId: 123, episode: 2, airingAt: Date.parse('2026-10-08T08:00:00Z') / 1000 };
beforeEach(() => {
  hooks.effects = []; vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ locale: 'it' })));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function mount(frozen: boolean, locale: Locale = 'it') {
  const html = renderToStaticMarkup(React.createElement(LocaleProvider, { locale, children: React.createElement(StreamingCountryProvider, {
    children: React.createElement(WeeklyContent, { initial, week: { year: 2026, week: 41 }, initialEvents: [event],
      initialCalendar: { events: [event], episodeDates: [], anilistIds: { 'tv:1': 123 }, unavailable: true },
      initialEpisodes: { entries: [], status: 'pending' }, frozen }),
  }) }));
  const cleanups = hooks.effects.map(effect => effect());
  await vi.runAllTimersAsync();
  for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
  return html;
}
it.each(['it', 'en', 'fr'] as const)('keeps archived %s hydration offline, including stale/missing scores and partial calendars', async locale => {
  const html = await mount(true, locale);
  expect(html).toContain('Saved title'); expect(html).toContain('Base language story');
  expect(html).not.toContain('<button type="button" class="button"'); // No calendar retry for frozen data.
  for (const load of [loadWeeklyLookup, loadWeeklyEpisodes, loadMalRating, loadDubbing, fetch]) expect(load).not.toHaveBeenCalled();
});
it('preserves live client lookups for pages without an archive', async () => {
  await mount(false);
  for (const load of [loadWeeklyLookup, loadWeeklyEpisodes, loadMalRating, loadDubbing, fetch]) expect(load).toHaveBeenCalled();
});
