import 'server-only';
import { unstable_cache } from 'next/cache';
import { japanDate } from '@/lib/weekly-episodes';
import type { Ratings } from '@/lib/ratings';

// Compact score/vote pairs only. No titles, plots or complete TSV files.
export type RatingShard = Record<string, [number, number]>;
export const RATING_SHARDS = 256;
export const IMDB_DATASET_RATINGS_TAG = 'imdb-dataset-ratings';
const pending = new Map<string, RatingShard>();
let pendingDay: string | undefined;
export function ratingBucket(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) % RATING_SHARDS;
}
const shardLoader = async (day: string, bucket: number): Promise<RatingShard> => {
  const value = pending.get(`${day}:${bucket}`);
  if (!value) throw new Error('Cold IMDb rating index');
  return value;
};
Object.defineProperty(shardLoader, 'toString', { value: () => 'imdb-rating-shard-loader-v1' });
const shardCache = unstable_cache(shardLoader, ['imdb-rating-shard-v1'], { revalidate: 864000, tags: [IMDB_DATASET_RATINGS_TAG] });
const dayLoader = async (day: string): Promise<string> => {
  if (pendingDay !== day) throw new Error('Incomplete IMDb rating index');
  return day;
};
Object.defineProperty(dayLoader, 'toString', { value: () => 'imdb-rating-index-day-loader-v1' });
const dayCache = unstable_cache(dayLoader, ['imdb-rating-index-day-v1'], { revalidate: 864000, tags: [IMDB_DATASET_RATINGS_TAG] });

// Authenticated daily collector only: publish the completion marker last.
// A failed/truncated stream cannot expose a partially parsed score table.
export async function storeImdbRatingIndex(day: string, shards: RatingShard[]): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || shards.length !== RATING_SHARDS) throw new Error('Invalid IMDb rating index');
  for (const shard of shards) {
    if (Buffer.byteLength(JSON.stringify(shard)) > 1024 * 1024) throw new Error('IMDb rating shard exceeds cache limit');
  }
  let index = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (index < shards.length) {
      const bucket = index++, key = `${day}:${bucket}`;
      pending.set(key, shards[bucket]);
      try { await shardCache(day, bucket); }
      finally { pending.delete(key); }
    }
  }));
  pendingDay = day;
  try { await dayCache(day); }
  finally { pendingDay = undefined; }
}

// Read one small partition by exact IMDb ID. Misses throw inside the cache,
// never download IMDb/OMDb and never persist an empty score.
export async function readImdbDatasetRating(id: string, now = new Date()): Promise<Ratings | undefined> {
  if (!/^tt\d+$/.test(id)) return undefined;
  for (let age = 0; age < 7; age++) {
    const day = japanDate(new Date(now.getTime() - age * 86400000));
    try {
      await dayCache(day);
      const pair = (await shardCache(day, ratingBucket(id)))[id];
      // The latest complete file is authoritative, even for an unrated title.
      if (!pair) return undefined;
      const [score, votes] = pair;
      if (!Number.isFinite(score) || score <= 0 || score > 10 || !Number.isSafeInteger(votes) || votes <= 0) return undefined;
      return { imdbId: id, imdbRating: String(score), imdbVotes: String(votes), imdbStatus: 'ready' };
    } catch { /* Keep the previous complete daily file available during outages. */ }
  }
  return undefined;
}
