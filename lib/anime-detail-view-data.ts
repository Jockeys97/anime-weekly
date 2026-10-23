import type { AniListAnime } from '@/lib/anilist';

export type AnimeDetailViewData = Pick<AniListAnime,
  'id' | 'idMal' | 'title' | 'synonyms' | 'coverImage' | 'bannerImage' |
  'startDate' | 'episodes' | 'format' | 'status' | 'genres' | 'studios' |
  'season' | 'seasonYear' | 'nextAiringEpisode' | 'trailer'>;

// Explicit allowlist at the RSC/client boundary: recommendations contain whole
// nested anime objects. Synopses, tags and score histograms stay on the server.
export function animeDetailViewData(anime: AniListAnime): AnimeDetailViewData {
  const { id, idMal, title, synonyms, coverImage, bannerImage, startDate, episodes,
    format, status, genres, studios, season, seasonYear, nextAiringEpisode, trailer } = anime;
  return { id, idMal, title, synonyms, coverImage, bannerImage, startDate, episodes,
    format, status, genres, studios, season, seasonYear, nextAiringEpisode, trailer };
}
