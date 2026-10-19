import { describe, expect, it } from 'vitest';
import { animeDetailLink } from '../lib/anime-detail-link';
describe('weekly anime detail navigation', () => {
  it('opens the exact internal detail page for a matched AniList ID', () => {
    expect(animeDetailLink({ name: 'Example', ratings: { anilistId: 21 } })).toBe('/anime/21-example');
  });
  it.each([undefined, 0, -1, 1.5, 2147483648])('uses a title search for unavailable or invalid ID %s', anilistId => {
    expect(animeDetailLink({ name: 'Example & sequel', ratings: { anilistId } })).toBe('/search?q=Example+%26+sequel');
  });
});
