import type { AnimeTitle } from '@/lib/tmdb';
import type { Ratings } from '@/lib/ratings';

// A score needs 1,000 actual ratings. MAL members include non-voters and must
// never substitute for scored_by; old snapshots without it are omitted.
export const MIN_IMDB_VOTES = 1000;
export const MIN_MAL_SCORED_BY = 1000;
export type RankingSource = 'imdb' | 'mal';
export interface RankingEntry { anime: AnimeTitle; anilistId: number; score: number; votes: number }
export function imdbVoteCount(value: Ratings['imdbVotes']): number {
  if (!value || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return 0;
  const count = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}
export function rankWeeklyAnime(titles: readonly AnimeTitle[], source: RankingSource): RankingEntry[] {
  const rows: RankingEntry[] = [];
  for (const anime of titles) {
    const { ratings } = anime;
    const anilistId = ratings.anilistId;
    if (anime.kind !== 'tv' || !anime.name.trim() || !Number.isSafeInteger(anilistId) || anilistId! <= 0 || anilistId! > 2147483647) continue;
    const score = source === 'imdb' ? Number(ratings.imdbRating) : ratings.malScore;
    const votes = source === 'imdb' ? imdbVoteCount(ratings.imdbVotes) : ratings.malScoredBy;
    const minimum = source === 'imdb' ? MIN_IMDB_VOTES : MIN_MAL_SCORED_BY;
    if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0 || score > 10
      || !Number.isSafeInteger(votes) || votes! < minimum) continue;
    rows.push({ anime, anilistId: anilistId!, score, votes: votes! });
  }
  rows.sort((a, b) => b.score - a.score || b.votes - a.votes || a.anilistId - b.anilistId);
  const seen = new Set<number>();
  return rows.filter(row => { if (seen.has(row.anilistId)) return false; seen.add(row.anilistId); return true; });
}
export function weeklyRankings(titles: readonly AnimeTitle[]) {
  return { imdb: rankWeeklyAnime(titles, 'imdb'), mal: rankWeeklyAnime(titles, 'mal') };
}
