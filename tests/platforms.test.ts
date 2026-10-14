import { describe, expect, it } from 'vitest';
import { PLATFORM_COUNTRIES, platformMapping, platformPaths, platformTitle } from '../lib/platforms';
import { animeDetailLink } from '../lib/anime-detail-link';
describe('platform and country mapping', () => {
  it.each([['netflix', 8], ['crunchyroll', 283], ['prime-video', 119], ['disney-plus', 337], ['apple-tv', 350], ['max', 1899]])('maps %s to standalone TMDB provider %i', (provider, id) => {
    expect(platformMapping(provider, 'it')?.provider.id).toBe(id);
  });
  it.each(Object.keys(PLATFORM_COUNTRIES))('maps %s to its uppercase watch region', country => {
    expect(platformMapping('netflix', country)?.country.region).toBe(country.toUpperCase());
  });
  it.each([['unknown', 'it'], ['netflix', 'ca'], ['toString', 'it'], ['netflix', '__proto__'], ['Netflix', 'IT']])('rejects %s/%s', (provider, country) => {
    expect(platformMapping(provider, country)).toBeNull();
  });
  it('labels the Italian landing and enumerates every unique combination', () => {
    expect(platformTitle('netflix', 'it')).toBe('Anime su Netflix Italia');
    expect(new Set(platformPaths()).size).toBe(42);
  });
  it('links only an existing valid mapping to a detail page', () => {
    expect(animeDetailLink({ name: 'Anime & film', ratings: { anilistId: 21 } })).toBe('/anime/21');
    expect(animeDetailLink({ name: 'Anime & film', ratings: {} })).toBe('/search?q=Anime+%26+film');
  });
});
