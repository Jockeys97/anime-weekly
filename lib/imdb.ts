import 'server-only';
import { unstable_cache } from 'next/cache';
import { readImdbDatasetRating } from '@/lib/imdb-rating-index';
import { readRatingsStore } from '@/lib/ratings-store';
import { CACHE_SECONDS } from '@/lib/config';
import { formatWeek, isoWeek } from '@/lib/week';
export const IMDB_CACHE_TAG = 'weekly-imdb-scores';
import type { Ratings } from '@/lib/ratings';
export function hasImdbScore(ratings: Ratings): boolean {
  const text = ratings.imdbRating?.trim();
  const score = text ? Number(text) : NaN;
  return Number.isFinite(score) && score >= 0 && score <= 10;
}
let quotaUntil = 0;
class UncachedImdb extends Error {
  constructor(readonly ratings: Ratings) {
    super('IMDb score unavailable');
    if (ratings.imdbErrorReason === 'quota' && Date.now() >= quotaUntil) quotaUntil = Date.now() + 60000;
  }
}
// Reader and cron writer use the SAME function source, arguments and key parts.
// On a reader cache miss, throwing prevents an empty/error value from being
// persisted and, crucially, never makes an OMDb request. Only the cron can fill it.
function scoreCache(week: string, canPopulate: boolean) {
  const loader = async (id: string): Promise<Ratings> => {
    if (!canPopulate) throw new UncachedImdb({ imdbId: id, imdbStatus: 'unavailable' });
    return fetchScore(id);
  };
  Object.defineProperty(loader, 'toString', { value: () => 'imdb-weekly-score-loader-v2' });
  return unstable_cache(loader, ['imdb-weekly-valid-v2', week], { revalidate: CACHE_SECONDS, tags: [IMDB_CACHE_TAG, `${IMDB_CACHE_TAG}:${week}`] });
}
async function fetchScore(id: string): Promise<Ratings> {
  const key = process.env.OMDB_API_KEY?.trim();
  const base: Ratings = { imdbId: id };
  if (!key) throw new UncachedImdb({ ...base, imdbStatus: 'unconfigured' });
  // Checked inside the cache fill: existing valid cached scores still bypass
  // this pause. Suppress repeated vendor calls briefly, never cache an N/A vote.
  if (Date.now() < quotaUntil) throw new UncachedImdb({ ...base, imdbStatus: 'error', imdbErrorReason: 'quota' });
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('i', id); url.searchParams.set('apikey', key);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Cache validated successful scores, never HTTP error bodies or quota errors.
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        const retryAfter = response.headers.get('Retry-After');
        const numeric = retryAfter ? Number(retryAfter) : 0;
        const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(retryAfter || '') - Date.now()) / 1000;
        if (attempt === 0 && (response.status === 429 || response.status >= 500) && (!Number.isFinite(seconds) || seconds <= 1)) {
          await response.body?.cancel();
          await new Promise(resolve => setTimeout(resolve, Math.max(250, Number.isFinite(seconds) ? seconds * 1000 : 0)));
          continue;
        }
        let message = '';
        try { message = ((await response.json()) as { Error?: string }).Error || ''; } catch { /* A gateway may return non-JSON. */ }
        throw new UncachedImdb({ ...base, imdbStatus: 'error', imdbErrorReason: /limit|quota/i.test(message) ? 'quota' : /key|auth/i.test(message) || response.status === 401 ? 'authentication' : 'upstream' });
      }
      const data = await response.json() as { Response?: string; Error?: string; imdbRating?: string; imdbVotes?: string };
      if (data.Response !== 'True') {
        if (/not found/i.test(data.Error || '')) throw new UncachedImdb({ ...base, imdbStatus: 'unavailable' });
        throw new UncachedImdb({ ...base, imdbStatus: 'error', imdbErrorReason: /limit|quota/i.test(data.Error || '') ? 'quota' : /key|auth/i.test(data.Error || '') ? 'authentication' : 'upstream' });
      }
      const ratings: Ratings = { ...base, imdbRating: data.imdbRating, imdbVotes: data.imdbVotes };
      if (!hasImdbScore(ratings)) throw new UncachedImdb({ ...base, imdbStatus: 'unavailable' });
      return { ...ratings, imdbStatus: 'ready' };
    } catch (error) {
      if (error instanceof UncachedImdb) throw error;
      if (attempt === 1) throw new UncachedImdb({ ...base, imdbStatus: 'error', imdbErrorReason: 'network' });
    }
  }
  throw new UncachedImdb({ ...base, imdbStatus: 'error' });
}
const pending = new Map<string, Promise<Ratings>>();
const scoreWeek = () => formatWeek(isoWeek(new Date()));
function accessScore(id: string, week: string, canPopulate: boolean, fresh = false): Promise<Ratings> {
  if (!/^tt\d+$/.test(id)) return Promise.resolve({ imdbStatus: 'unmatched' });
  const key = `${week}:${id}:${canPopulate}:${fresh}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
    if (canPopulate) {
      const daily = await readImdbDatasetRating(id);
      if (daily) return daily;
    }
    return fresh && canPopulate ? fetchScore(id) : scoreCache(week, canPopulate)(id);
  })().catch(error => error instanceof UncachedImdb ? error.ratings : { imdbId: id, imdbStatus: 'error' as const })
    .finally(() => { pending.delete(key); });
  pending.set(key, promise);
  return promise;
}
// All visitor paths are read-only, including retries and catalog/detail lookups.
export async function readSharedImdbScore(id: string, week = scoreWeek()): Promise<Ratings> {
  if (!/^tt\d+$/.test(id)) return { imdbStatus: 'unmatched' };
  const daily = await readImdbDatasetRating(id);
  if (daily) return daily;
  const stored = (await readRatingsStore()).ratings[`imdb:${id}`];
  if (stored && hasImdbScore(stored.values) && Date.now() - stored.fetchedAt <= 120 * 86400000) {
    return { ...stored.values, imdbId: id, imdbStatus: 'ready' };
  }
  return accessScore(id, week, false);
}
const reads = new Map<string, Promise<Ratings>>();
export function getImdbScore(id: string, week = scoreWeek()): Promise<Ratings> {
  if (!/^tt\d+$/.test(id)) return Promise.resolve({ imdbStatus: 'unmatched' });
  const key = `${week}:${id}`;
  const pending = reads.get(key);
  if (pending) return pending;
  const task = (async () => {
    const local = await readSharedImdbScore(id, week);
    if (hasImdbScore(local)) return local;
    // Read through the collector's bundle as well: deployments can isolate
    // Data Cache entries by route. This endpoint is strictly cache-only.
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (host && process.env.VERCEL_ENV === 'production') {
      try {
        // Revalidating (not no-store): no-store inside an ISR render throws static-to-dynamic,
        // which the catch below swallowed, so cold pages showed IMDb n/d.
        const response = await fetch(`https://${host}/api/revalidate?imdb=${id}`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const result = await response.json() as Ratings;
          if (result.imdbId === id && hasImdbScore(result)) return { ...result, imdbStatus: 'ready' as const };
        }
      } catch { /* Retain the local result without a vendor request. */ }
    }
    return local;
  })().finally(() => { reads.delete(key); });
  reads.set(key, task);
  return task;
}
// Called only by the authenticated weekly cron. Successful values dedupe across
// the week's titles; errors throw inside unstable_cache and are never persisted.
// The cross-week store can request a fresh fetch and persists its success itself.
export function primeImdbScore(id: string, week = scoreWeek(), fresh = false): Promise<Ratings> {
  return accessScore(id, week, true, fresh);
}
