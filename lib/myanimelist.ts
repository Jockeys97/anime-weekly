import 'server-only';
import { unstable_cache } from 'next/cache';
import { jikanFetch } from '@/lib/rate-limited-fetch';
import type { Ratings } from '@/lib/ratings';

export const MAL_REVALIDATE = 86400;
const cachedScore = unstable_cache(async (id: number): Promise<Ratings> => {
  // Cache the validated result, rather than an HTTP error or a response for a
  // different anime. An unrated title is a valid daily result; an outage is not.
  const response = await jikanFetch(`https://api.jikan.moe/v4/anime/${id}`, { cache: 'no-store', next: undefined }, 8000);
  if (!response.ok) throw new Error('MyAnimeList unavailable');
  const { data } = await response.json() as { data?: { mal_id?: number; score?: number | null; members?: number; scored_by?: number } };
  if (!data || data.mal_id !== id || !('score' in data) || (data.score != null && (typeof data.score !== 'number' || !Number.isFinite(data.score) || data.score < 0 || data.score > 10))) throw new Error('Invalid MyAnimeList rating');
  const ratings: Ratings = { malId: id, malStatus: data.score == null ? 'unavailable' : 'ready', malScore: data.score ?? null };
  if (Number.isSafeInteger(data.members) && data.members! >= 0) ratings.malMembers = data.members;
  if (Number.isSafeInteger(data.scored_by) && data.scored_by! >= 0) ratings.malScoredBy = data.scored_by;
  return ratings;
}, ['myanimelist-score-v1'], { revalidate: MAL_REVALIDATE, tags: ['myanimelist-scores'] });

const pending = new Map<number, Promise<Ratings>>();
export async function getMyAnimeListScore(id: number): Promise<Ratings> {
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return { malStatus: 'unmatched' };
  let request = pending.get(id);
  if (!request) {
    request = cachedScore(id).catch((): Ratings => ({ malId: id, malStatus: 'error' })).finally(() => pending.delete(id));
    pending.set(id, request);
  }
  return request;
}
