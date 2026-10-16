'use client';
import type { Ratings } from '@/lib/ratings';
import { withTimeout } from '@/lib/async-timeout';

const requests = new Map<string, { promise: Promise<Ratings>; expires: number }>();
export function loadMalRating(query: string): Promise<Ratings> {
  const previous = requests.get(query);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const promise = withTimeout((async () => {
    const response = await fetch(`/api/myanimelist?${query}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('MyAnimeList unavailable');
    return await response.json() as Ratings;
  })(), 15000).catch(error => { requests.delete(query); throw error; });
  if (requests.size >= 100) requests.delete(requests.keys().next().value!);
  requests.set(query, { promise, expires: Date.now() + 86400000 });
  return promise;
}
