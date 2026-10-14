import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS } from '@/lib/config';
import { formatWeek, isoWeek } from '@/lib/week';
export const IMDB_CACHE_TAG = 'weekly-imdb-scores';
import type { Ratings } from '@/lib/ratings';
export function hasImdbScore(ratings: Ratings): boolean {
  const text = ratings.imdbRating?.trim();
  const score = text ? Number(text) : NaN;
  return Number.isFinite(score) && score >= 0 && score <= 10;
}
class UncachedImdb extends Error {
  constructor(readonly ratings: Ratings) { super('IMDb score unavailable'); }
}
// Reader and cron writer use the SAME function source, arguments and key parts.
// On a reader cache miss, throwing prevents an empty/error value from being
// persisted and, crucially, never makes an OMDb request. Only the cron can fill it.
function scoreCache(week: string, canPopulate: boolean) {
  return unstable_cache(async (id: string): Promise<Ratings> => {
    if (!canPopulate) throw new UncachedImdb({ imdbId: id, imdbStatus: 'unavailable' });
    return fetchScore(id);
  }, ['imdb-weekly-valid-v2', week], { revalidate: CACHE_SECONDS, tags: [IMDB_CACHE_TAG, `${IMDB_CACHE_TAG}:${week}`] });
}
async function fetchScore(id: string): Promise<Ratings> {
  const key = process.env.OMDB_API_KEY?.trim();
  const base: Ratings = { imdbId: id };
  if (!key) throw new UncachedImdb({ ...base, imdbStatus: 'unconfigured' });
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
function accessScore(id: string, week: string, canPopulate: boolean): Promise<Ratings> {
  if (!/^tt\d+$/.test(id)) return Promise.resolve({ imdbStatus: 'unmatched' });
  const key = `${week}:${id}:${canPopulate}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = scoreCache(week, canPopulate)(id).catch(error => error instanceof UncachedImdb ? error.ratings : { imdbId: id, imdbStatus: 'error' as const })
    .finally(() => { pending.delete(key); });
  pending.set(key, promise);
  return promise;
}
// All visitor paths are read-only, including retries and catalog/detail lookups.
export function getImdbScore(id: string, week = scoreWeek()): Promise<Ratings> {
  return accessScore(id, week, false);
}
// Called only by the authenticated weekly cron. Successful values dedupe across
// the week's titles; errors throw inside unstable_cache and are never persisted.
export function primeImdbScore(id: string, week = scoreWeek()): Promise<Ratings> {
  return accessScore(id, week, true);
}
