import type { AnimeFilters, SearchParams } from '@/lib/anime-search';

/**
 * Clean, indexable Search landings for the MAL content filters:
 * /search/hentai = ?malRating=hx, /search/mild-nudity = ?malRating=r-plus.
 * Same slug in every locale (the terms are what searchers type everywhere).
 */
export const SEARCH_PRESETS = { hentai: 'hx', 'mild-nudity': 'r-plus' } as const satisfies Record<string, NonNullable<AnimeFilters['malRating']>>;
export type SearchPreset = keyof typeof SEARCH_PRESETS;
export const isSearchPreset = (value: string): value is SearchPreset => Object.hasOwn(SEARCH_PRESETS, value);
export const searchPresetPath = (preset: SearchPreset) => `/search/${preset}`;
export function presetForRating(rating: AnimeFilters['malRating']): SearchPreset | undefined {
  return (Object.keys(SEARCH_PRESETS) as SearchPreset[]).find(key => SEARCH_PRESETS[key] === rating);
}
/** The preset a filter set equals exactly (only malRating, default sort, page 1). */
export function presetForFilters(filters: AnimeFilters): SearchPreset | undefined {
  const plain = !filters.q && !filters.genres.length && !filters.format && !filters.status && !filters.season && filters.year == null && filters.minScore == null && filters.sort === 'popular' && filters.page === 1;
  return plain ? presetForRating(filters.malRating) : undefined;
}
/** Merge the preset rating into the query (an explicit malRating in the query is overridden). */
export function presetSearchParams(preset: SearchPreset, query: SearchParams): SearchParams {
  return { ...query, malRating: SEARCH_PRESETS[preset] };
}
