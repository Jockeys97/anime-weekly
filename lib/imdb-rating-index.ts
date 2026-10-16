import 'server-only';
import { unstable_cache } from 'next/cache';
import { getCache } from '@vercel/functions';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { japanDate } from '@/lib/weekly-episodes';
import type { Ratings } from '@/lib/ratings';

export type RatingShard = Record<string, [number, number]>;
export const RATING_SHARDS = 256;
export const IMDB_DATASET_RATINGS_TAG = 'imdb-dataset-ratings';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
// Runtime Cache reads also work inside Next's nested unstable_cache callbacks.
// Explicit, awaited writes avoid publishing a marker while writes are pending.
const cache = getCache({ namespace: 'anime-weekly-imdb-v2', keyHashFunction: digest });
const options = { ttl: 8 * 86400, tags: [IMDB_DATASET_RATINGS_TAG] };
export function ratingBucket(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % RATING_SHARDS;
}
interface Manifest { hashes: string[] }
const shardKey = (day: string, bucket: number) => `${day}:shard:${bucket}`;
const manifestKey = (day: string) => `${day}:complete`;
function validManifest(value: unknown): value is Manifest {
  return Boolean(value && typeof value === 'object' && 'hashes' in value && Array.isArray(value.hashes)
    && value.hashes.length === RATING_SHARDS && value.hashes.every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)));
}
async function persist(key: string, value: unknown): Promise<void> {
  // Some cache providers report a failed write as a miss rather than throwing.
  // Check the bytes before acknowledging each partition and the final marker.
  for (let attempt = 0; attempt < 2; attempt++) {
    await cache.set(key, value, options);
    if (JSON.stringify(await cache.get(key)) === JSON.stringify(value)) return;
  }
  throw new Error('IMDb index cache write could not be verified');
}
export async function storeImdbRatingIndex(day: string, shards: RatingShard[]): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || shards.length !== RATING_SHARDS) throw new Error('Invalid IMDb rating index');
  const encoded = shards.map(shard => {
    const json = JSON.stringify(shard);
    if (Buffer.byteLength(json) > 1024 * 1024) throw new Error('IMDb rating shard exceeds cache limit');
    return gzipSync(json).toString('base64');
  });
  const hashes = encoded.map(digest);
  let index = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < encoded.length) {
      const bucket = index++;
      await persist(shardKey(day, bucket), encoded[bucket]);
    }
  }));
  await persist(manifestKey(day), { hashes });
}
export async function hasImdbRatingIndex(day: string): Promise<boolean> {
  try { return validManifest(await cache.get(manifestKey(day))); } catch { return false; }
}
function score(id: string, pair: [number, number] | undefined): Ratings | undefined {
  if (!pair) return undefined;
  const [rating, votes] = pair;
  if (!Number.isFinite(rating) || rating <= 0 || rating > 10 || !Number.isSafeInteger(votes) || votes <= 0) return undefined;
  return { imdbId: id, imdbRating: String(rating), imdbVotes: String(votes), imdbStatus: 'ready' };
}

// Read-only compatibility for pre-migration cache entries. Keep the original
// loader identity/arguments; never populate these entries from public requests.
const legacyShardLoader = async (_day: string, _bucket: number): Promise<RatingShard> => { void _day; void _bucket; throw new Error('Cold IMDb rating index'); };
Object.defineProperty(legacyShardLoader, 'toString', { value: () => 'imdb-rating-shard-loader-v1' });
const legacyShard = unstable_cache(legacyShardLoader, ['imdb-rating-shard-v1'], { revalidate: 864000, tags: [IMDB_DATASET_RATINGS_TAG] });
const legacyDayLoader = async (_day: string): Promise<string> => { void _day; throw new Error('Incomplete IMDb rating index'); };
Object.defineProperty(legacyDayLoader, 'toString', { value: () => 'imdb-rating-index-day-loader-v1' });
const legacyDay = unstable_cache(legacyDayLoader, ['imdb-rating-index-day-v1'], { revalidate: 864000, tags: [IMDB_DATASET_RATINGS_TAG] });

// Only the authenticated migration uses this; reuse existing complete data if
// possible, without downloading IMDb again.
export async function migrateLegacyImdbIndex(day: string): Promise<boolean> {
  try {
    await legacyDay(day);
    const shards: RatingShard[] = [];
    for (let bucket = 0; bucket < RATING_SHARDS; bucket++) shards.push(await legacyShard(day, bucket));
    await storeImdbRatingIndex(day, shards);
    return true;
  } catch { return false; }
}
export async function readImdbDatasetRating(id: string, now = new Date()): Promise<Ratings | undefined> {
  if (!/^tt\d+$/.test(id)) return undefined;
  for (let age = 0; age < 7; age++) {
    const day = japanDate(new Date(now.getTime() - age * 86400000));
    try {
      const manifest = await cache.get(manifestKey(day));
      if (validManifest(manifest)) {
        const bucket = ratingBucket(id), encoded = await cache.get(shardKey(day, bucket));
        if (typeof encoded === 'string' && digest(encoded) === manifest.hashes[bucket]) {
          const shard = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 1024 * 1024 }).toString()) as RatingShard;
          return score(id, shard[id]);
        }
      }
    } catch { /* A Runtime Cache outage can still use the legacy store. */ }
    try {
      await legacyDay(day);
      return score(id, (await legacyShard(day, ratingBucket(id)))[id]);
    } catch { /* Retain the previous verified daily partition during an outage. */ }
  }
  return undefined;
}
