'use client';
import type { Ratings } from '@/lib/ratings';
import { withTimeout } from '@/lib/async-timeout';

const requests = new Map<string, { promise: Promise<Ratings>; expires: number }>();
const waiting: Array<() => void> = [];
let active = 0;

function drain() {
  while (active < 2 && waiting.length) waiting.shift()!();
}

function queuedLookup(query: string): Promise<Ratings> {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      active++;
      // Start the deadline when dispatched, never while a card waits in the queue.
      void withTimeout((async () => {
        const response = await fetch(`/api/myanimelist?${query}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('MyAnimeList unavailable');
        const result = await response.json() as Ratings;
        if (!result || result.malStatus === 'error' || (result.malStatus !== 'unavailable' && result.malStatus !== 'unmatched' && !(typeof result.malScore === 'number' && Number.isFinite(result.malScore) && result.malScore > 0 && result.malScore <= 10))) throw new Error('Invalid MyAnimeList rating');
        return result;
      })(), 15000).then(resolve, reject).finally(() => { active--; drain(); });
    });
    drain();
  });
}

export function loadMalRating(query: string): Promise<Ratings> {
  const previous = requests.get(query);
  if (previous && previous.expires > Date.now()) return previous.promise;
  const promise = queuedLookup(query).then(result => {
    requests.set(query, { promise, expires: Date.now() + 86400000 });
    for (const [key, entry] of requests) {
      if (requests.size <= 100) break;
      if (Number.isFinite(entry.expires)) requests.delete(key);
    }
    return result;
  }).catch(error => { requests.delete(query); throw error; });
  // Keep pending lookups deduplicated even when many cards are queued.
  requests.set(query, { promise, expires: Infinity });
  return promise;
}
