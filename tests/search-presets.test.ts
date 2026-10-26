import { describe, expect, it } from 'vitest';
import { parseAnimeFilters } from '@/lib/anime-search';
import { isSearchPreset, presetForFilters, presetSearchParams, searchPresetPath } from '@/lib/search-presets';

describe('search presets', () => {
  it('maps clean paths to the MAL content filter', () => {
    expect(presetSearchParams('hentai', {})).toEqual({ malRating: 'hx' });
    expect(presetSearchParams('mild-nudity', { malRating: 'hx', page: '2' })).toEqual({ malRating: 'r-plus', page: '2' });
    expect(isSearchPreset('hentai')).toBe(true);
    expect(isSearchPreset('toString')).toBe(false);
    expect(searchPresetPath('hentai')).toBe('/search/hentai');
  });
  it('detects only plain single-filter searches as landings', () => {
    expect(presetForFilters(parseAnimeFilters({ malRating: 'hx' }))).toBe('hentai');
    expect(presetForFilters(parseAnimeFilters({ malRating: 'r-plus' }))).toBe('mild-nudity');
    expect(presetForFilters(parseAnimeFilters({ malRating: 'hx', genre: 'Romance' }))).toBeUndefined();
    expect(presetForFilters(parseAnimeFilters({ malRating: 'hx', page: '2' }))).toBeUndefined();
    expect(presetForFilters(parseAnimeFilters({}))).toBeUndefined();
  });
});
