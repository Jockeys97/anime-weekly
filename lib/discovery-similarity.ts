import type { AniListAnime } from './anilist';

const FRANCHISE_RELATIONS = new Set([
  'SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE',
  'SPIN_OFF', 'SUMMARY', 'COMPILATION',
]);
export const MAX_SIMILAR_PER_FRANCHISE = 2;

function tagRanks(anime: AniListAnime): Map<string, number> {
  const tags = new Map<string, number>();
  for (const tag of anime.tags ?? []) {
    if (tag.isMediaSpoiler || tag.isGeneralSpoiler || tag.isAdult || !Number.isFinite(tag.rank) || tag.rank <= 0) continue;
    tags.set(tag.name, Math.max(tags.get(tag.name) ?? 0, Math.min(100, tag.rank) / 100));
  }
  return tags;
}

// Document frequency is per unique, non-adult title, independent of source or
// recommendation votes. Duplicate tags/titles cannot change their rarity.
export function buildSimilarTagIdf(catalog: readonly AniListAnime[]): Map<string, number> {
  const media = [...new Map(catalog.filter(anime => !anime.isAdult).map(anime => [anime.id, anime])).values()];
  const frequency = new Map<string, number>();
  for (const anime of media) for (const name of tagRanks(anime).keys()) frequency.set(name, (frequency.get(name) ?? 0) + 1);
  return new Map([...frequency].map(([name, count]) => [name, 1 + Math.log(1 + media.length / (1 + count))]));
}

function franchiseGroups(media: readonly AniListAnime[]): Map<number, number> {
  const parent = new Map<number, number>();
  const root = (id: number): number => {
    const next = parent.get(id);
    if (next == null) { parent.set(id, id); return id; }
    if (next === id) return id;
    const result = root(next);
    parent.set(id, result);
    return result;
  };
  for (const anime of media) {
    root(anime.id);
    for (const { relationType, node } of anime.relations?.edges ?? []) {
      if (node.type !== 'ANIME' || !FRANCHISE_RELATIONS.has(relationType)) continue;
      const a = root(anime.id), b = root(node.id);
      // Include missing intermediate nodes and reverse edges; titles/slug
      // prefixes are never used to guess franchise membership.
      parent.set(Math.max(a, b), Math.min(a, b));
    }
  }
  return new Map([...parent.keys()].map(id => [id, root(id)]));
}

function logBoost(value: number | null | undefined, ceiling: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(1, Math.log1p(value) / Math.log1p(ceiling)) : 0;
}

export function rankSimilar(source: AniListAnime, catalog: readonly AniListAnime[]) {
  const candidates = new Map(catalog.map(anime => [anime.id, anime]));
  const recommendations = new Map<number, number>();
  for (const node of source.recommendations?.nodes ?? []) {
    const anime = node.mediaRecommendation;
    const rating = node.rating ?? 0;
    if (!anime || !Number.isFinite(rating) || rating <= 0) continue;
    recommendations.set(anime.id, Math.max(recommendations.get(anime.id) ?? 0, rating));
    // Details contain complete cards. Legacy ID-only nodes can still vote for
    // existing candidates, but must never manufacture an incomplete card.
    if (!candidates.has(anime.id) && anime.title && Array.isArray(anime.genres) && anime.coverImage !== undefined) {
      candidates.set(anime.id, anime as AniListAnime);
    }
  }
  const idf = buildSimilarTagIdf(catalog);
  const sourceTags = tagRanks(source);
  const weight = (name: string) => idf.get(name) ?? 1;
  const mass = (tags: Map<string, number>) => [...tags].reduce((sum, [name, rank]) => sum + rank * weight(name), 0);
  const sourceMass = mass(sourceTags);
  const groups = franchiseGroups([source, ...candidates.values()]);
  const ranked = [...candidates.values()].flatMap(anime => {
    if (anime.id === source.id || anime.isAdult) return [];
    const genres = [...new Set(anime.genres.filter(genre => source.genres.includes(genre)))];
    const tags = tagRanks(anime);
    let overlap = 0;
    for (const [name, rank] of tags) overlap += Math.min(rank, sourceTags.get(name) ?? 0) * weight(name);
    const rating = recommendations.get(anime.id) ?? 0;
    const sameFranchise = groups.get(anime.id) === groups.get(source.id);
    if (!genres.length && !overlap && !rating && !sameFranchise) return [];
    // Weighted Dice keeps the many-tag titles from winning by tag count alone.
    // Topic similarity is 0–10, broad genres at most 0.6. Community votes are
    // strong evidence (rating 1 ≈ 6.1, 10 ≈ 11.2, 100 ≈ 17.8), bounded at 18.
    const tagScore = overlap ? 10 * 2 * overlap / (sourceMass + mass(tags)) : 0;
    const recommendationScore = rating > 0 ? Math.min(18, 4 + 3 * Math.log1p(rating)) : 0;
    const obscurityPenalty = typeof anime.popularity === 'number' && Number.isFinite(anime.popularity) && anime.popularity >= 0
      ? 0.35 * Math.max(0, 1 - anime.popularity / 1000) : 0;
    const score = tagScore + Math.min(0.6, genres.length * 0.15) + recommendationScore
      + (sameFranchise ? 3 : 0) + 0.35 * logBoost(anime.popularity, 1_000_000)
      + 0.25 * logBoost(anime.averageScore, 100) - obscurityPenalty;
    return [{ anime, score, genres }];
  }).sort((a, b) => b.score - a.score || a.anime.id - b.anime.id);
  const counts = new Map<number, number>();
  return ranked.filter(({ anime }) => {
    const group = groups.get(anime.id)!;
    const count = counts.get(group) ?? 0;
    if (count >= MAX_SIMILAR_PER_FRANCHISE) return false;
    counts.set(group, count + 1);
    return true;
  });
}
