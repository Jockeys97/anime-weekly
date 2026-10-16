import type { Ratings } from '@/lib/ratings';

// Jikan's public API closed on 2026-10-01. Tenrai preserves its MAL-ID schema.
export const MAL_API_BASE = 'https://api.tenrai.org/v1';

export function parseMalRating(value: unknown, id: number): Ratings {
  const data = (value as { data?: { mal_id?: unknown; score?: unknown; members?: unknown; scored_by?: unknown } } | null)?.data;
  if (!data || data.mal_id !== id || !('score' in data) || (data.score !== null && (typeof data.score !== 'number' || !Number.isFinite(data.score) || data.score < 0 || data.score > 10))) {
    throw new Error('Invalid MyAnimeList rating');
  }
  // Tenrai uses zero for a score that has not yet been determined.
  const score = data.score === 0 ? null : data.score as number | null;
  const ratings: Ratings = { malId: id, malStatus: score === null ? 'unavailable' : 'ready', malScore: score };
  if (Number.isSafeInteger(data.members) && (data.members as number) >= 0) ratings.malMembers = data.members as number;
  if (Number.isSafeInteger(data.scored_by) && (data.scored_by as number) >= 0) ratings.malScoredBy = data.scored_by as number;
  return ratings;
}
