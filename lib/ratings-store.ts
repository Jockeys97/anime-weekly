import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Ratings } from '@/lib/ratings';
import type { ProviderStore } from '@/lib/provider-snapshot';
const WEEKLY_RATINGS_TAG = 'weekly-ratings';
interface StoredRating {
  values: Ratings;
  fetchedAt: number;
  lastSeenAt: number;
}
interface StoredSource {
  imdbId?: string;
  anilistId?: number;
  malId?: number;
  fetchedAt: number;
  lastSeenAt: number;
}
export interface RatingsStore {
  ratings: Record<string, StoredRating>;
  sources: Record<string, StoredSource>;
  availability?: ProviderStore;
}
const emptyStore = (): RatingsStore => ({ ratings: {}, sources: {} });
let pendingStore: RatingsStore | undefined;
function ratingsStoreCache(canPopulate: boolean) {
  const loader = async (): Promise<RatingsStore> => {
    if (!canPopulate || !pendingStore) throw new Error('Cold ratings store');
    return pendingStore;
  };
  Object.defineProperty(loader, 'toString', { value: () => 'cross-week-ratings-store-loader' });
  // Keep this entry until explicit cron invalidation; freshness and retention
  // are per entry, not tied to the one-week snapshot cache lifetime.
  return unstable_cache(loader, ['cross-week-ratings-store-v1'], { revalidate: false, tags: [WEEKLY_RATINGS_TAG] });
}
export async function readRatingsStore(): Promise<RatingsStore> {
  try { return await ratingsStoreCache(false)(); }
  catch { return emptyStore(); }
}
export async function storeRatingsStore(store: RatingsStore): Promise<void> {
  pendingStore = store;
  try { await ratingsStoreCache(true)(); }
  finally { pendingStore = undefined; }
}

