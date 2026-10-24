export const SEARCH_GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Horror', 'Mahou Shoujo', 'Martial Arts', 'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'] as const;
export const SEARCH_FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC'] as const;
export const SEARCH_STATUSES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'] as const;
export const SEARCH_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export const SEARCH_SORTS = ['relevance', 'popular', 'score', 'newest', 'trending'] as const;
export type SearchParams = Record<string, string | string[] | undefined>;
export interface AnimeFilters {
  q: string; genres: (typeof SEARCH_GENRES[number])[]; format?: typeof SEARCH_FORMATS[number];
  status?: typeof SEARCH_STATUSES[number]; season?: typeof SEARCH_SEASONS[number];
  malRating?: 'r-plus';
  year?: number; minScore?: number; sort: typeof SEARCH_SORTS[number]; page: number;
}
const single = (value: string | string[] | undefined) => typeof value === 'string' ? value.trim() : '';
const member = <T extends string>(value: string, allowed: readonly T[]): T | undefined => allowed.find(item => item === value);
const integer = (value: string, min: number, max: number) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined;
export function parseAnimeFilters(params: SearchParams): AnimeFilters {
  const q = single(params.q).slice(0, 200);
  return { ...(single(params.malRating) === 'r-plus' ? { malRating: 'r-plus' as const } : {}), q, genres: SEARCH_GENRES.filter(genre => (Array.isArray(params.genre) ? params.genre : [params.genre]).some(value => value?.trim() === genre)), format: member(single(params.format), SEARCH_FORMATS),
    status: member(single(params.status), SEARCH_STATUSES), season: member(single(params.season), SEARCH_SEASONS),
    year: integer(single(params.year), 1900, new Date().getFullYear() + 5), minScore: integer(single(params.minScore), 1, 10),
    sort: member(single(params.sort), SEARCH_SORTS) || (q ? 'relevance' : 'popular'), page: integer(single(params.page), 1, 500) || 1 };
}
export function searchHref(filters: AnimeFilters, page = 1): string {
  const params = new URLSearchParams();
  for (const genre of filters.genres) params.append('genre', genre);
  for (const [key, value] of Object.entries({ ...filters, page })) if (key !== 'genres' && value != null && value !== '' && !(key === 'page' && value === 1)) params.set(key, String(value));
  return `/search?${params}`;
}

/** Preserve repeated genres on API requests, just like Next searchParams. */
export function searchParamsRecord(params: URLSearchParams): SearchParams {
  const result: SearchParams = Object.fromEntries(params);
  if (params.has('genre')) result.genre = params.getAll('genre');
  return result;
}
