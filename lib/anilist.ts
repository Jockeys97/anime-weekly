import { readMildNudityIds } from '@/lib/mal-content';
import 'server-only';
import { cleanSynopsis, displayTitle } from '@/lib/title-text';
import type { AnimeFilters } from '@/lib/anime-search';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import type { AnimeTrailer } from '@/lib/trailer';
import { isSeason, type Season } from '@/lib/season';
import { discoveryCandidate, DISCOVERY_DETAIL_FIELDS, DISCOVERY_MEDIA_FIELDS, popularCatalogQuery, POPULAR_PAGES_PER_BATCH } from '@/lib/anilist-discovery-query';

export const ANILIST_REVALIDATE = 86400;
export interface AniListAnime {
  popularity?: number | null;
  isAdult?: boolean;
  tags?: { name: string; rank: number; isMediaSpoiler?: boolean; isGeneralSpoiler?: boolean; isAdult?: boolean }[];
  recommendations?: { nodes?: { rating?: number; mediaRecommendation?: (Partial<AniListAnime> & { id: number }) | null }[] };
  relations?: { edges: { relationType: string; node: { id: number; type: string; format: string | null; title: AniListAnime['title']; startDate: { year: number | null } | null } }[] };
  trailer?: AnimeTrailer | null;
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  id: number;
  updatedAt?: number | null;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms?: string[] | null;
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

const fields = `${DISCOVERY_MEDIA_FIELDS}
  recommendations(perPage: 25, sort: RATING_DESC) { nodes { rating mediaRecommendation { id } } }`;
const catalogAnime = new Map<number, { expires: number; anime: AniListAnime }>();
function rememberCatalog(media: AniListAnime[]): void {
  for (const anime of media) {
    // Sparse list recommendations must never replace the richer detail query.
    if (!Number.isSafeInteger(anime.id) || !anime.relations?.edges || !anime.title || !anime.format
      || !anime.recommendations?.nodes || anime.recommendations.nodes.some(node => node.mediaRecommendation
        && (!node.mediaRecommendation.title || !Array.isArray(node.mediaRecommendation.genres)))) continue;
    if (catalogAnime.size >= 500) catalogAnime.delete(catalogAnime.keys().next().value!);
    catalogAnime.set(anime.id, { anime, expires: Date.now() + 3600000 });
  }
}
const emptyPage = (page: number): AniListPage => ({ media: [], pageInfo: { currentPage: page, hasNextPage: false } });

interface FetchOptions { fresh?: boolean; maxWaitMs?: number }
async function graphql<T>(query: string, variables: Record<string, string | number | boolean | null | number[]>, options: FetchOptions = {}): Promise<T | null> {
  try {
    const response = await anilistFetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      ...(options.fresh ? { cache: 'no-store' as const, next: undefined } : { next: { revalidate: ANILIST_REVALIDATE } }),
    }, options.maxWaitMs);
    if (!response.ok) return null;
    const result = await response.json() as { data?: T; errors?: unknown[] };
    return result.errors?.length ? null : result.data ?? null;
  } catch { return null; }
}

// `unavailable` separates an upstream failure from a genuinely empty page.
export async function getSeason(year: number, season: Season, page = 1, options: FetchOptions = {}): Promise<AniListPage & { unavailable?: boolean }> {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999 || !isSeason(season) || !Number.isSafeInteger(page) || page < 1) return emptyPage(page);
  const data = await graphql<{ Page?: AniListPage }>(`query ($year: Int!, $season: MediaSeason!, $page: Int!) {
    Page(page: $page, perPage: 50) {
      pageInfo { currentPage hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC,
        format_in: [TV, TV_SHORT, MOVIE, ONA, OVA]) { ${fields} }
    }
  }`, { year, season: season.toUpperCase(), page }, options);
  if (!Array.isArray(data?.Page?.media)) return { ...emptyPage(page), unavailable: true };
  rememberCatalog(data.Page.media);
  return { media: data.Page.media, pageInfo: { currentPage: page, hasNextPage: data.Page.pageInfo?.hasNextPage === true } };
}

// Called only by the shared weekly catalog loader, through the same AniList
// rate limiter as detail and season requests. Never cache raw error responses.
export async function getPopularCatalogBatch(firstPage: number, maxWaitMs?: number): Promise<AniListPage[]> {
  if (!Number.isSafeInteger(firstPage) || firstPage < 1) throw new RangeError('Invalid catalog page');
  const data = await graphql<Record<string, AniListPage>>(popularCatalogQuery(firstPage), {}, { fresh: true, maxWaitMs });
  return Array.from({ length: POPULAR_PAGES_PER_BATCH }, (_, offset) => {
    const page = data?.[`page${firstPage + offset}`];
    if (!Array.isArray(page?.media)) throw new Error('Popular discovery catalog unavailable');
    return { ...page, media: page.media.map(discoveryCandidate) };
  });
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
  const variables: Record<string, string | number | number[]> = { page: filters.page, sort: sorts[filters.sort] };
  const definitions = ['$page: Int!', '$sort: [MediaSort!]'];
  const argumentsList = ['type: ANIME', 'isAdult: false', 'sort: $sort'];
  let verifiedMalIds: Set<number> | undefined;
  if (filters.malRating === 'r-plus') {
    const ids = await readMildNudityIds();
    if (!ids?.length) return { ...emptyPage(filters.page), unavailable: true };
    definitions.push('$malIds: [Int]');
    argumentsList.push('idMal_in: $malIds');
    variables.malIds = ids;
    verifiedMalIds = new Set(ids);
  }
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
  if (verifiedMalIds && data.Page.media.some(anime => !anime.idMal || !verifiedMalIds.has(anime.idMal))) return { ...emptyPage(filters.page), unavailable: true };
  rememberCatalog(data.Page.media);
  return { media: data.Page.media, pageInfo: { currentPage: filters.page, hasNextPage: data.Page.pageInfo?.hasNextPage === true } };
}

// Rich recommendations and safety/popularity metadata invalidate old details.
const getCachedAnime = unstable_cache(async (id: number): Promise<AniListAnime | null> => {
  const query = `query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${DISCOVERY_DETAIL_FIELDS} }
  }`;
  const response = await anilistFetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables: { id } }), next: { revalidate: ANILIST_REVALIDATE },
  });
  // Only explicit AniList not-found responses may become cached empty details.
  if (response.status !== 200 && response.status !== 404) throw new Error(`Anime details unavailable (HTTP ${response.status})`);
  const result = await response.json() as {
    data?: { Media?: AniListAnime | null };
    errors?: { message?: string; status?: number }[];
  };
  if (result.errors?.length) {
    if (result.errors.every(error => error.status === 404 && /^not found\.?$/i.test(error.message?.trim() || ''))) return null;
    throw new Error('Anime details unavailable');
  }
  if (result.data?.Media === null) return null;
  if (response.status !== 200 || result.data?.Media?.id !== id) throw new Error('Anime details unavailable');
  return result.data.Media;
}, ['anime-detail-v10-similar-recommendations'], { revalidate: ANILIST_REVALIDATE, tags: [CACHE_TAG] });

export async function getAnime(id: number): Promise<AniListAnime | null> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return null;
  const known = catalogAnime.get(id);
  if (known && known.expires > Date.now()) return known.anime;
  try { return await getCachedAnime(id); }
  catch (error) {
    console.error('[anilist] getAnime failed', { id, message: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
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
        next: { revalidate: 86400 },
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
        ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: 86400 } }),
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
