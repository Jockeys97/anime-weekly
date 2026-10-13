import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { isSeason, type Season } from '@/lib/season';

export const ANILIST_REVALIDATE = 86400;
export interface AniListAnime {
  id: number;
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
  studios: { nodes: { id: number; name: string }[] } | null;
  season: string | null;
  seasonYear: number | null;
}
export interface AniListPage {
  media: AniListAnime[];
  pageInfo: { currentPage: number; hasNextPage: boolean };
}

const fields = `id idMal title { romaji english native }
  coverImage { large extraLarge color } bannerImage description
  startDate { year month day } episodes format status genres averageScore
  studios(isMain: true) { nodes { id name } } season seasonYear`;
const emptyPage = (page: number): AniListPage => ({ media: [], pageInfo: { currentPage: page, hasNextPage: false } });

async function graphql<T>(query: string, variables: Record<string, string | number>): Promise<T | null> {
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

export async function getSeason(year: number, season: Season, page = 1): Promise<AniListPage> {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999 || !isSeason(season) || !Number.isSafeInteger(page) || page < 1) return emptyPage(page);
  const data = await graphql<{ Page?: AniListPage }>(`query ($year: Int!, $season: MediaSeason!, $page: Int!) {
    Page(page: $page, perPage: 50) {
      pageInfo { currentPage hasNextPage }
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC,
        format_in: [TV, TV_SHORT, MOVIE, ONA, OVA]) { ${fields} }
    }
  }`, { year, season: season.toUpperCase(), page });
  if (!Array.isArray(data?.Page?.media)) return emptyPage(page);
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
  return Array.isArray(data?.Page?.media) ? data.Page.media : [];
}

const getCachedAnime = unstable_cache(async (id: number): Promise<AniListAnime | null> => {
  const data = await graphql<{ Media?: AniListAnime }>(`query ($id: Int!) {
    Media(id: $id, type: ANIME) { ${fields} }
  }`, { id });
  // Reject transient upstream failures so they never become cached empty details.
  if (!data) throw new Error('Anime details unavailable');
  return data.Media?.id === id ? data.Media : null;
}, ['anime-detail-v1'], { revalidate: ANILIST_REVALIDATE, tags: [CACHE_TAG] });

export async function getAnime(id: number): Promise<AniListAnime | null> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return null;
  try { return await getCachedAnime(id); } catch { return null; }
}

export function animeName(anime: AniListAnime): string {
  return anime.title.english || anime.title.romaji || anime.title.native || `Anime #${anime.id}`;
}

// Render upstream descriptions as text, never as untrusted HTML.
export function animeDescription(description: string | null): string {
  return (description || '').replace(/<\/?(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[entity] || entity).trim();
}
