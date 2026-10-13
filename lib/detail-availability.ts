import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
import { animeName, getAnime, type AniListAnime } from '@/lib/anilist';
import { normalizeTitle } from '@/lib/anime-match';
import { getAnimeAvailability, type AnimeAvailability } from '@/lib/tmdb';

const titlesOf = (anime: Pick<AniListAnime, 'title'>) => [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
const seriesFormats = ['TV', 'TV_SHORT', 'ONA'];
// Strip explicit season/cour suffixes only: numbers within names remain intact.
export function seriesBaseTitle(title: string): string {
  let base = title.normalize("NFKC").trim();
  for (let i = 0; i < 4; i++) {
    const next = base.replace(/\s*(?:[-:–]\s*)?(?:(?:the\s+)?final\s+season|season\s*\d+|\d+(?:st|nd|rd|th)?\s+season|part\s*\.?\s*\d+|第\s*\d+\s*(?:期|クール))\s*$/iu, '').trim();
    if (next === base) break;
    base = next;
  }
  return base;
}

export async function findSeasonSeries(anime: AniListAnime): Promise<AniListAnime | null> {
  if (!seriesFormats.includes(anime.format || '') || !titlesOf(anime).some(title => seriesBaseTitle(title) !== title.normalize('NFKC').trim())) return null;
  const bases = titlesOf(anime).map(seriesBaseTitle).map(normalizeTitle).filter(Boolean);
  const visited = new Set([anime.id]);
  let current = anime;
  for (let hop = 0; hop < 8; hop++) {
    const candidates = (current.relations?.edges || []).filter(edge => edge.relationType === 'PREQUEL'
      && edge.node.type === 'ANIME' && seriesFormats.includes(edge.node.format || '')
      && titlesOf(edge.node).some(title => bases.includes(normalizeTitle(seriesBaseTitle(title)))));
    const unique = [...new Map(candidates.map(edge => [edge.node.id, edge.node])).values()];
    if (unique.length !== 1 || visited.has(unique[0].id)) return null;
    const parent = await getAnime(unique[0].id);
    if (!parent || !seriesFormats.includes(parent.format || '') || !titlesOf(parent).some(title => bases.includes(normalizeTitle(seriesBaseTitle(title))))) return null;
    const parentYear = parent.startDate?.year;
    if (!parentYear || (current.startDate?.year && parentYear > current.startDate.year)) return null;
    visited.add(parent.id);
    if (!titlesOf(parent).some(title => seriesBaseTitle(title) !== title.normalize('NFKC').trim())) return parent;
    current = parent;
  }
  return null;
}

export interface DetailAvailability extends AnimeAvailability {
  seriesWatch?: { id: number; kind: 'tv'; name: string; providers: AnimeAvailability['providers']; providersUnavailable: boolean };
}

export async function getDetailAvailability(anime: AniListAnime): Promise<DetailAvailability> {
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const [direct, series] = await Promise.all([
    getAnimeAvailability(titlesOf(anime), year),
    findSeasonSeries(anime),
  ]);
  if (!series) return direct;
  const original = await getAnimeAvailability(titlesOf(series), series.startDate?.year ?? undefined);
  // Keep exact-season providers separate. The client selects a series reference only
  // when the chosen country has no direct offers, without claiming season coverage.
  return {
    ...direct,
    ratings: !direct.ratings.imdbId && original.ratings.imdbId
      ? { ...direct.ratings, ...original.ratings, imdbSeriesTitle: animeName(series) }
      : direct.ratings,
    ...(original.match?.kind === 'tv' && original.match.id !== direct.match?.id ? {
      seriesWatch: { id: original.match.id, kind: 'tv' as const, name: animeName(series), providers: original.providers, providersUnavailable: original.providersUnavailable },
    } : {}),
  };
}

// Cache the completed season-to-series resolution, not just each upstream fetch.
// Unmatched titles and upstream outages remain retryable on the next request.
class UncachedAvailability extends Error {
  constructor(readonly result: DetailAvailability) { super('Incomplete detail availability'); }
}
const cachedDetailAvailability = unstable_cache(async (anime: AniListAnime) => {
  const result = await getDetailAvailability(anime);
  if ((!result.match && !result.seriesWatch) || result.providersUnavailable || result.seriesWatch?.providersUnavailable
    || (result.ratings.imdbId && !result.ratings.imdbRating)) throw new UncachedAvailability(result);
  return result;
}, ['detail-availability-v1-series-watch'], { revalidate: 86400, tags: [CACHE_TAG] });

export async function getCachedDetailAvailability(anime: AniListAnime): Promise<DetailAvailability> {
  try { return await cachedDetailAvailability(anime); }
  catch (error) {
    if (error instanceof UncachedAvailability) return error.result;
    throw error;
  }
}
