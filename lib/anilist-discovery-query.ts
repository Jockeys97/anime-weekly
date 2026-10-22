// Query fragments shared with the offline-cache-free evaluation script.
// No Next.js/server-only imports: the evaluator uses the production payloads.
import type { AniListAnime } from './anilist';

export const DISCOVERY_MEDIA_FIELDS = `id idMal updatedAt popularity isAdult
  title { romaji english native } synonyms
  coverImage { large extraLarge color } bannerImage description
  startDate { year month day } nextAiringEpisode { episode airingAt } episodes format status genres averageScore
  tags { name rank isMediaSpoiler isGeneralSpoiler isAdult }
  stats { scoreDistribution { amount } }
  studios(isMain: true) { nodes { id name } } season seasonYear
  trailer { id site }
  relations { edges { relationType node { id type format title { english romaji native } startDate { year } } } }`;

export const DISCOVERY_DETAIL_FIELDS = `${DISCOVERY_MEDIA_FIELDS}
  recommendations(perPage: 25, sort: RATING_DESC) {
    nodes { rating mediaRecommendation { ${DISCOVERY_MEDIA_FIELDS} } }
  }`;

export const POPULAR_CATALOG_PAGES = 10;
export const POPULAR_PAGES_PER_BATCH = 2;

// Keep the shared 500-title cache small: no synopses, score distributions,
// trailers or recommendations for every candidate.
const CANDIDATE_FIELDS = `id idMal popularity isAdult title { romaji english native }
  coverImage { large extraLarge color } genres averageScore format status season seasonYear
  tags { name rank isMediaSpoiler isGeneralSpoiler isAdult }
  relations { edges { relationType node { id type format title { english romaji native } startDate { year } } } }`;
type CatalogCandidate = Pick<AniListAnime, 'id' | 'idMal' | 'title' | 'coverImage' | 'genres' | 'averageScore'
  | 'format' | 'status' | 'season' | 'seasonYear' | 'popularity' | 'isAdult' | 'tags' | 'relations'>;
export function discoveryCandidate(anime: CatalogCandidate): AniListAnime {
  return {
    bannerImage: null, description: null, startDate: null, episodes: null, studios: null,
    ...anime,
    // Drop unsafe tags and redundant false flags before the shared cache write.
    tags: anime.tags?.filter(tag => !tag.isMediaSpoiler && !tag.isGeneralSpoiler && !tag.isAdult)
      .map(({ name, rank }) => ({ name, rank })),
  };
}

// Two aliased 50-title pages per request: 500 titles in five paced requests.
export function popularCatalogQuery(firstPage: number): string {
  return `query { ${Array.from({ length: POPULAR_PAGES_PER_BATCH }, (_, offset) => {
    const page = firstPage + offset;
    return `page${page}: Page(page: ${page}, perPage: 50) {
      pageInfo { currentPage hasNextPage }
      media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC, ID],
        format_in: [TV, TV_SHORT, MOVIE, ONA, OVA]) { ${CANDIDATE_FIELDS} }
    }`;
  }).join('\n')} }`;
}
