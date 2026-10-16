import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeTitle } from '../lib/tmdb';

vi.mock('../components/DubbingStatus', () => ({ DubbingStatus: () => null }));
vi.mock('../components/AnimeActions', () => ({ AnimeActions: () => null }));
vi.mock('../components/RatingSummary', () => ({ RatingSummary: () => null }));
vi.mock('../components/StreamingAvailability', () => ({ StreamingAvailability: () => null }));

import { AnimeCard } from '../components/AnimeCard';

describe('weekly title navigation', () => {
  describe.each([null, '/cover.jpg'])('with poster %s', poster => {
  it.each([
    { kind: 'tv' as const, anilistId: 161645, href: '/anime/161645' },
    { kind: 'movie' as const, anilistId: 21519, href: '/anime/21519' },
    { kind: 'tv' as const, anilistId: undefined, href: '/search?q=Example+series' },
    { kind: 'tv' as const, anilistId: -1, href: '/search?q=Example+series' },
  ])('keeps title and details together for $kind with AniList ID $anilistId', ({ kind, anilistId, href }) => {
    const anime: AnimeTitle = { id: 134667, kind, name: 'Example series', overview: 'Synopsis.', poster,
      ratings: { anilistId }, recommendation: null, providers: {}, providersUnavailable: false };
    const html = renderToStaticMarkup(createElement(AnimeCard, { anime }));
    expect(html).toContain(`<h3><a href="${href}">Example series</a></h3>`);
    const detailsLink = html.match(/<a\b[^>]*class="catalog-details"[^>]*>/)?.[0];
    expect(detailsLink).toContain(`href="${href}"`);
    const coverLink = html.match(/<a\b[^>]*class="poster"[^>]*>/)?.[0];
    expect(coverLink).toContain(`href="${href}"`);
    expect(coverLink).toContain('aria-label="Example series"');
    expect(html).not.toContain('themoviedb.org');
    expect(html).not.toContain('target="_blank"');
  });
  });
});
