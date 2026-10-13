import 'server-only';
import { animeName, getAnime, type AniListAnime } from '@/lib/anilist';
import { normalizeTitle } from '@/lib/anime-match';
import { getAnimeAvailability, type AnimeAvailability } from '@/lib/tmdb';

const titlesOf = (anime: Pick<AniListAnime, 'title'>) => [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
const seriesFormats = ['TV', 'TV_SHORT', 'ONA'];
// Strip explicit season/cour suffixes only: numbers within names remain intact.
export function seriesBaseTitle(title: string): string {
  let base = title.trim();
  for (let i = 0; i < 4; i++) {
    const next = base.replace(/\s*(?:[-:–]\s*)?(?:season\s+\d+|\d+(?:st|nd|rd|th)?\s+season|part\s+\d+|第\s*\d+\s*(?:期|クール))\s*$/iu, '').trim();
    if (next === base) break;
    base = next;
  }
  return base;
}

export async function findSeasonSeries(anime: AniListAnime): Promise<AniListAnime | null> {
  if (!seriesFormats.includes(anime.format || '') || !titlesOf(anime).some(title => seriesBaseTitle(title) !== title.trim())) return null;
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
    if (!titlesOf(parent).some(title => seriesBaseTitle(title) !== title.trim())) return parent;
    current = parent;
  }
  return null;
}

export async function getDetailAvailability(anime: AniListAnime): Promise<AnimeAvailability> {
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const direct = await getAnimeAvailability(titlesOf(anime), year);
  if (direct.ratings.imdbId) return direct;
  const series = await findSeasonSeries(anime);
  if (!series) return direct;
  const original = await getAnimeAvailability(titlesOf(series), series.startDate?.year ?? undefined);
  if (!original.ratings.imdbId) return direct;
  // Inherit only IMDb. Series-wide watch providers do not prove this season is streaming.
  return { ...direct, ratings: { ...direct.ratings, ...original.ratings, imdbSeriesTitle: animeName(series) } };
}
