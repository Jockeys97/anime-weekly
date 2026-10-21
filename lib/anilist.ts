import 'server-only';
import { cleanSynopsis, displayTitle } from '@/lib/title-text';
import type { AnimeFilters } from '@/lib/anime-search';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import type { AnimeTrailer } from '@/lib/trailer';
import { isSeason, type Season } from '@/lib/season';

export const ANILIST_REVALIDATE = 86400;
export interface AniListAnime {
  tags?: { name: string; rank: number; isMediaSpoiler?: boolean }[];
  recommendations?: { nodes?: { rating?: number; mediaRecommendation?: { id: number } | null }[] };
  relations?: { edges: { relationType: string; node: { id: number; type: string; format: string | null; title: AniListAnime['title']; startDate: { year: number | null } | null } }[] };
  trailer?: AnimeTrailer | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  id: number;
  updatedAt?: number | null;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { large: string | null; extraLarge: string | null; color: string | null } | null;
  bannerImage: string | null;
  description: string | null;
  startDate: { year: number | null; month: number | null; day: number | null } | null;
  episodes: number | null;
  format: string | null;
  status: string | null;
  genres: string[];
  averageScore: number | null;
  stats?: { scoreDistribution?: { amount: number }[] } | null;
  studios: { nodes: { id: number; name: string }[] } | null;
  season: string | null;
  seasonYear: number | null;
}
export interface AniListPage {
  media: AniListAnime[];
  pageInfo: { currentPage: number; hasNextPage: boolean };
}

const fields = `id idMal updatedAt title { romaji english native }
  coverImage { large extraLarge color } bannerImage description
  startDate { year month day } nextAiringEpisode { episode airingAt } episodes format status genres averageScore
  tags { name rank isMediaSpoiler }
  recommendations(perPage: 25, sort: RATING_DESC) { nodes { rating mediaRecommendation { id } } }
  stats { scoreDistribution { amount } }
  studios(isMain: true) { nodes { id name } } season seasonYear
  trailer { id site } relations { edges { relationType node { id type format title { english romaji native } startDate { year } } } }`;
const catalogAnime = new Map<number, { expires: number; anime: AniListAnime }>();
function rememberCatalog(media: AniListAnime[]): void {
  for (const anime of media) {
    if (!Number.isSafeInteger(anime.id) || !anime.relations?.edges || !anime.title || !anime.format) continue;
    if (catalogAnime.size >= 500) catalogAnime.delete(catalogAnime.keys().next().value!);
    catalogAnime.set(anime.id, { anime, expires: Date.now() + 3600000 });
  }
}
const emptyPage = (page: number): AniListPage => ({ media: [], pageInfo: { currentPage: page, hasNextPage: false } });

async function graphql<T>(query: string, variables: Record<string, string | number | boolean | null>): Promise<T | null> {
  try {
    const response = await anilistFetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }), next: { revalidate: ANILIST_REVALIDATE },
    });
    if (!response.ok) return null;
    const result = await response.json() as { data?: T; errors?: unknown[] };
    return result.errors?.length ? null : result.data ?? null;
  } catch { return null; }
}

// `unavailable` separates an upstream failure from a genuinely empty page.
export async function getSeason(year: number, season: Season, page = 1): Promise<AniListPage & { unavailable?: boolean }> {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999 || !isSeason(season) || !Number.isSafeInteger(page) || page < 1) return emptyPage(page);
  const data = await graphql<{ Page?: AniListPage }>(`query ($year: Int!, $season: MediaSeason!, $page: Int!) {
    Page(page: $page, perPage: 50) {
      pageInfo { currentPage hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC,
        format_in: [TV, TV_SHORT, MOVIE, ONA, OVA]) { ${fields} }
    }
  }`, { year, season: season.toUpperCase(), page });
  if (!Array.isArray(data?.Page?.media)) return { ...emptyPage(page), unavailable: true };
  rememberCatalog(data.Page.media);
  return { media: data.Page.media, pageInfo: { currentPage: page, hasNextPage: data.Page.pageInfo?.hasNextPage === true } };
}

export async function searchAnime(query: string): Promise<AniListAnime[]> {
  const search = query.trim();
  if (!search) return [];
  const data = await graphql<{ Page?: { media?: AniListAnime[] } }>(`query ($search: String!) {
    Page(page: 1, perPage: 50) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH) { ${fields} }
    }
  }`, { search });
  const media = Array.isArray(data?.Page?.media) ? data.Page.media : [];
  rememberCatalog(media);
  return media;
}

// Fetch season siblings and their prequel edges in one bounded request. Exact
// relation IDs are still verified by the caller; search results alone prove nothing.
export async function getSeasonFamily(search: string): Promise<AniListAnime[]> {
  if (!search.trim()) return [];
  const data = await graphql<{ Page?: { media?: AniListAnime[] } }>(`query ($search: String!) {
    Page(page: 1, perPage: 50) {
      media(type: ANIME, search: $search, sort: SEARCH_MATCH, format_in: [TV, TV_SHORT, ONA]) {
        ${fields}
        relations { edges { relationType node { id type format title { english romaji native } startDate { year } } } }
      }
    }
  }`, { search: search.trim() });
  const media = Array.isArray(data?.Page?.media) ? data.Page.media : [];
  rememberCatalog(media);
  return media;
}

export async function discoverAnime(filters: AnimeFilters): Promise<AniListPage & { unavailable?: boolean }> {
  const sorts = { relevance: filters.q ? 'SEARCH_MATCH' : 'POPULARITY_DESC', popular: 'POPULARITY_DESC', score: 'SCORE_DESC', newest: 'START_DATE_DESC', trending: 'TRENDING_DESC' };
  const variables: Record<string, string | number> = { page: filters.page, sort: sorts[filters.sort] };
  const definitions = ['$page: Int!', '$sort: [MediaSort!]'];
  const argumentsList = ['type: ANIME', 'isAdult: false', 'sort: $sort'];
  const optional = [
    ['search', 'String', filters.q || undefined], ['genre', 'String', filters.genre],
    ['format', 'MediaFormat', filters.format], ['status', 'MediaStatus', filters.status],
    ['season', 'MediaSeason', filters.season], ['seasonYear', 'Int', filters.year],
    ['averageScore_greater', 'Int', filters.minScore == null ? undefined : filters.minScore * 10 - 1],
  ] as const;
  // AniList distinguishes omitted filters from explicit nulls. Only send active
  // filters; all user values remain GraphQL variables, never query source.
  for (const [name, type, value] of optional) {
    if (value == null) continue;
    variables[name] = value;
    definitions.push(`$${name}: ${type}`);
    argumentsList.push(`${name}: $${name}`);
  }
  const data = await graphql<{ Page?: AniListPage }>(`query (${definitions.join(', ')}) {
    Page(page: $page, perPage: 20) {
      pageInfo { currentPage hasNextPage }
      media(${argumentsList.join(', ')}) { ${fields} }
    }
  }`, variables);
  if (!Array.isArray(data?.Page?.media)) return { ...emptyPage(filters.page), unavailable: true };
  rememberCatalog(data.Page.media);
  return { media: data.Page.media, pageInfo: { currentPage: filters.page, hasNextPage: data.Page.pageInfo?.hasNextPage === true } };
}

const getCachedAnime = unstable_cache(async (id: number): Promise<AniListAnime | null> => {
  const data = await graphql<{ Media?: AniListAnime }>(`query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${fields} trailer { id site } relations { edges { relationType node { id type format title { english romaji native } startDate { year } } } } }
  }`, { id });
  // Reject transient upstream failures so they never become cached empty details.
  if (!data) throw new Error('Anime details unavailable');
  return data.Media?.id === id ? data.Media : null;
}, ['anime-detail-v7-discovery'], { revalidate: ANILIST_REVALIDATE, tags: [CACHE_TAG] });

export async function getAnime(id: number): Promise<AniListAnime | null> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return null;
  const known = catalogAnime.get(id);
  if (known && known.expires > Date.now()) return known.anime;
  try { return await getCachedAnime(id); }
  catch (error) {
    console.error('[anilist] getAnime failed', { id, message: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
}

export type AnimeMapping = Pick<AniListAnime, 'id' | 'idMal' | 'title'> & { coverImage?: AniListAnime['coverImage'] };
// Separate bounded lookups for the personal calendar; catalog cache semantics
// and the weekly snapshot writer remain unchanged.
export async function getAnimeMappings(ids: number[], byMal = false, maxWaitMs = 20000): Promise<{ media: AnimeMapping[]; unavailable: boolean }> {
  const selected = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647))];
  const media: AnimeMapping[] = [];
  const deadline = Date.now() + maxWaitMs;
  try {
    for (let offset = 0; offset < selected.length; offset += 50) {
      const response = await anilistFetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: `query ($ids: [Int]) { Page(page: 1, perPage: 50) {
          pageInfo { hasNextPage } media(type: ANIME, ${byMal ? 'idMal_in' : 'id_in'}: $ids) { id idMal title { romaji english native } coverImage { large extraLarge color } }
        } }`, variables: { ids: selected.slice(offset, offset + 50) } }),
        next: { revalidate: 600 },
      }, Math.max(0, deadline - Date.now()));
      if (!response.ok) return { media, unavailable: true };
      const result = await response.json() as { data?: { Page?: { media?: AnimeMapping[]; pageInfo?: { hasNextPage?: boolean } } }; errors?: unknown[] };
      const page = result.data?.Page;
      if (result.errors?.length || !Array.isArray(page?.media)) return { media, unavailable: true };
      media.push(...page.media.filter(anime => Number.isSafeInteger(anime.id) && anime.id > 0 && anime.title
        && selected.slice(offset, offset + 50).includes(byMal ? anime.idMal! : anime.id)));
      if (page.pageInfo?.hasNextPage) return { media, unavailable: true };
    }
    return { media, unavailable: false };
  } catch { return { media, unavailable: true }; }
}

export type FavoriteSequel = Pick<AniListAnime, 'id' | 'idMal' | 'title' | 'format' | 'status'> & { nextAiringEpisode?: { episode: number; airingAt: number } | null };
export type FavoriteAnime = Pick<AniListAnime, 'id' | 'idMal' | 'title' | 'format' | 'status' | 'episodes'> & { coverImage?: AniListAnime['coverImage']; nextAiringEpisode?: { episode: number; airingAt: number } | null;
  relations?: { edges?: { relationType: string; node: FavoriteSequel }[] } };
// "My favourites": covers, status and the next episode for a saved list, 50 per request.
export async function getFavoriteAnime(ids: number[], maxWaitMs = 12000, fresh = false): Promise<{ media: FavoriteAnime[]; unavailable: boolean }> {
  const selected = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647))].slice(0, 200);
  const media: FavoriteAnime[] = [];
  const deadline = Date.now() + maxWaitMs;
  try {
    for (let offset = 0; offset < selected.length; offset += 50) {
      const chunk = selected.slice(offset, offset + 50);
      const response = await anilistFetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: `query ($ids: [Int]) { Page(page: 1, perPage: 50) {
          media(type: ANIME, id_in: $ids) { id idMal title { romaji english native } coverImage { large extraLarge color } format status episodes nextAiringEpisode { episode airingAt }
            relations { edges { relationType node { id idMal type format status title { romaji english native } nextAiringEpisode { episode airingAt } } } } }
        } }`, variables: { ids: chunk } }),
        // The weekly cron caches only its validated snapshot, never raw responses.
        ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 600 } }),
      }, Math.max(0, deadline - Date.now()));
      if (!response.ok) return { media, unavailable: true };
      const result = await response.json() as { data?: { Page?: { media?: FavoriteAnime[] } }; errors?: unknown[] };
      const page = result.data?.Page;
      if (result.errors?.length || !Array.isArray(page?.media)) return { media, unavailable: true };
      media.push(...page.media.filter(anime => Number.isSafeInteger(anime.id) && chunk.includes(anime.id) && anime.title));
    }
    return { media, unavailable: false };
  } catch { return { media, unavailable: true }; }
}

export function animeName(anime: AniListAnime): string {
  return displayTitle([anime.title.english, anime.title.romaji].find(title => title?.trim() && !/[\u3040-\u30ff\u3400-\u9fff]/.test(title)) || `Anime #${anime.id}`);
}

// Render upstream descriptions as text, never as untrusted HTML.
export function animeDescription(description: string | null): string {
  return cleanSynopsis((description || '').replace(/<\/?(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[entity] || entity).trim());
}
