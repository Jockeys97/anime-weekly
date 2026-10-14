import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_TAG } from '@/lib/config';
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
const cachedScore = unstable_cache(async (id: string): Promise<Ratings> => {
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
}, ['imdb-valid-score-v1'], { revalidate: 86400, tags: [CACHE_TAG] });
const pending = new Map<string, Promise<Ratings>>();
export function getImdbScore(id: string): Promise<Ratings> {
  if (!/^tt\d+$/.test(id)) return Promise.resolve({ imdbStatus: 'unmatched' });
  if (!process.env.OMDB_API_KEY?.trim()) return Promise.resolve({ imdbId: id, imdbStatus: 'unconfigured' });
  const existing = pending.get(id);
  if (existing) return existing;
  const promise = cachedScore(id).catch(error => error instanceof UncachedImdb ? error.ratings : { imdbId: id, imdbStatus: 'error' as const })
    .finally(() => { pending.delete(id); });
  pending.set(id, promise);
  return promise;
}
