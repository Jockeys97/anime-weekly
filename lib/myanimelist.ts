import 'server-only';
import { unstable_cache } from 'next/cache';
import { jikanFetch } from '@/lib/rate-limited-fetch';
import type { Ratings } from '@/lib/ratings';
import { MAL_API_BASE, parseMalRating } from '@/lib/mal-provider';

export const MAL_REVALIDATE = 86400;
const cachedScore = unstable_cache(async (id: number): Promise<Ratings> => {
  // Cache the validated result, rather than an HTTP error or a response for a
  // different anime. An unrated title is a valid daily result; an outage is not.
  const response = await jikanFetch(`${MAL_API_BASE}/anime/${id}`, { cache: 'no-store', next: undefined }, 8000);
  if (!response.ok) throw new Error('MyAnimeList unavailable');
  return parseMalRating(await response.json(), id);
}, ['myanimelist-score-tenrai-v2'], { revalidate: MAL_REVALIDATE, tags: ['myanimelist-scores'] });

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
