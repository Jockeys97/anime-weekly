import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS } from '@/lib/config';
import { lookupAnimeRatings } from '@/lib/anime-ratings';
import { getRatings, getWeeklyRatingSources } from '@/lib/tmdb';
import { primeImdbScore } from '@/lib/imdb';
import { getWeekAirings, type AiringEvent } from '@/lib/airing-schedule';
import { withTimeout } from '@/lib/async-timeout';
import { parseWeek } from '@/lib/week';
import { displayTitle } from '@/lib/title-text';
import type { Ratings } from '@/lib/ratings';
import type { WeeklyEpisodes } from '@/lib/weekly-episodes';

export const WEEKLY_RATINGS_TAG = 'weekly-ratings';
export const WEEKLY_PAGE_TAG = 'weekly-page-output';
// Invalidate HTML after warming without expiring the ratings it just read.
// revalidatePath would also expire Data Cache entries via implicit path tags.
export const trackWeeklyPage = unstable_cache(async () => null, ['weekly-page-output-v1'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_PAGE_TAG] });
export interface WeeklyRatings {
  titles: Record<string, Ratings>;
  events: AiringEvent[];
  names?: Record<string, string>;
  episodes?: WeeklyEpisodes;
}
const DAY_MS = 86400000;
const MAX_RATING_AGE = 30 * DAY_MS;
const MAX_STORE_AGE = 120 * DAY_MS;
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
}
const emptyStore = (): RatingsStore => ({ ratings: {}, sources: {} });
let pendingStore: RatingsStore | undefined;
function ratingsStoreCache(canPopulate: boolean) {
  const loader = async (): Promise<RatingsStore> => {
    if (!canPopulate || !pendingStore) throw new ColdWeeklyRatings();
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

const providers = [
  { prefix: 'imdb', id: 'imdbId', score: 'imdbRating', fields: ['imdbRating', 'imdbVotes', 'imdbStatus'] },
  { prefix: 'anilist', id: 'anilistId', score: 'anilistScore', fields: ['anilistScore'] },
  { prefix: 'mal', id: 'malId', score: 'malScore', fields: ['malScore', 'malMembers'] },
] as const;

function saveRatings(store: RatingsStore, key: string, ratings: Ratings, fetched: Ratings, now: number) {
  const previous = store.sources[key];
  const ids = { imdbId: ratings.imdbId ?? previous?.imdbId, anilistId: ratings.anilistId ?? previous?.anilistId, malId: ratings.malId ?? previous?.malId };
  if (Object.values(ids).some(id => id != null)) {
    const changed = !previous || Object.entries(ids).some(([field, id]) => id !== previous[field as keyof StoredSource]);
    store.sources[key] = { ...ids, fetchedAt: changed ? now : previous.fetchedAt, lastSeenAt: now };
  }
  for (const provider of providers) {
    const id = ratings[provider.id];
    if (id == null || fetched[provider.score] == null) continue;
    const entryKey = `${provider.prefix}:${id}`;
    const values = { ...store.ratings[entryKey]?.values };
    for (const field of provider.fields) if (fetched[field] != null) Object.assign(values, { [field]: fetched[field] });
    store.ratings[entryKey] = { values, fetchedAt: now, lastSeenAt: now };
  }
}
class ColdWeeklyRatings extends Error {}
const empty = (): WeeklyRatings => ({ titles: {}, events: [] });

// Only the cron writer can expose a precomputed value to the shared loader.
let pendingSnapshot: { slug: string; snapshot: WeeklyRatings } | undefined;
function snapshotCache(canPopulate: boolean) {
  const loader = async (slug: string): Promise<WeeklyRatings> => {
    if (!canPopulate || pendingSnapshot?.slug !== slug) throw new ColdWeeklyRatings();
    return pendingSnapshot.snapshot;
  };
  // unstable_cache keys include cb.toString(), which differs between the cron
  // route bundle and page bundles after minification. Pin it so the page reads
  // exactly the entry the cron wrote.
  Object.defineProperty(loader, 'toString', { value: () => 'weekly-ratings-snapshot-loader' });
  return unstable_cache(loader, ['weekly-ratings-snapshot-v2'], { revalidate: CACHE_SECONDS, tags: [WEEKLY_RATINGS_TAG] });
}

export async function readWeeklyRatingsSnapshot(slug: string): Promise<WeeklyRatings> {
  try { return await snapshotCache(false)(slug); }
  catch { return empty(); }
}

export async function getWeeklyRatings(slug: string): Promise<WeeklyRatings> {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host && process.env.VERCEL_ENV === 'production') {
    try {
      const res = await fetch(`https://${host}/api/revalidate?ratings=${encodeURIComponent(slug)}`, { next: { revalidate: 900, tags: [WEEKLY_RATINGS_TAG] }, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json() as WeeklyRatings;
        if (data && data.titles && (Object.keys(data.titles).length || data.episodes)) return data;
        console.error('[weekly-ratings] endpoint empty', slug);
      } else console.error('[weekly-ratings] endpoint status', res.status);
    } catch (e) { console.error('[weekly-ratings] endpoint error', (e as Error)?.message); }
  }
  try { return await snapshotCache(false)(slug); }
  catch (e) { console.error("[weekly-ratings] read miss", slug, (e as Error)?.constructor?.name); return empty(); }
}
export function isWeeklyRatingComplete(rating: Ratings): boolean {
  return rating.malScore != null && Boolean(rating.imdbRating) && rating.anilistScore != null;
}

// Compute before invalidating: provider failures must never erase a good snapshot.
export async function primeWeeklyRatings(slug: string, previous?: WeeklyRatings): Promise<WeeklyRatings & { total: number; store: RatingsStore; storeHits: number }> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const old = previous ?? await readWeeklyRatingsSnapshot(slug);
  const savedStore = await readRatingsStore();
  const store: RatingsStore = {
    ratings: Object.fromEntries(Object.entries(savedStore.ratings).map(([key, entry]) => [key, { ...entry, values: { ...entry.values } }])),
    sources: Object.fromEntries(Object.entries(savedStore.sources).map(([key, entry]) => [key, { ...entry }])),
  };
  const deadline = Date.now() + 260000;
  const sources = await getWeeklyRatingSources(week);
  const names = { ...old.names };
  const snapshot: WeeklyRatings = { ...old, titles: { ...old.titles }, events: [...old.events], names };
  let storeHits = 0;
  // Populate every source before completed ratings or the time budget skip it.
  for (const source of sources) {
    const name = displayTitle(source.title);
    const key = `${source.kind}:${source.id}`;
    if (name) names[key] = name;
    const mapped = store.sources[key];
    const existing: Ratings = { ...old.titles[key] };
    if (mapped) {
      mapped.lastSeenAt = Date.now();
      for (const provider of providers) if (mapped[provider.id] != null) Object.assign(existing, { [provider.id]: mapped[provider.id] });
    }
    // Migrate a pre-store snapshot once. Never renew a stored score's timestamp
    // merely because it appeared in a weekly snapshot again.
    const migrated: Ratings = {};
    for (const provider of providers) if (existing[provider.id] != null && !store.ratings[`${provider.prefix}:${existing[provider.id]}`]) {
      for (const field of provider.fields) if (existing[field] != null) Object.assign(migrated, { [field]: existing[field] });
    }
    saveRatings(store, key, existing, migrated, Date.now());
    let hit = false;
    for (const provider of providers) {
      const entry = store.ratings[`${provider.prefix}:${existing[provider.id]}`];
      if (!entry) continue;
      Object.assign(existing, entry.values);
      entry.lastSeenAt = Date.now();
      if (entry.values[provider.score] != null && Date.now() - entry.fetchedAt <= MAX_RATING_AGE && savedStore.ratings[`${provider.prefix}:${existing[provider.id]}`]) hit = true;
    }
    if (hit) storeHits++;
    if (Object.keys(existing).length) snapshot.titles[key] = existing;
  }
  let omdbAvailable = true;
  let jikanAvailable = true;
  let completed = Object.values(snapshot.titles).filter(rating => rating.imdbRating || rating.anilistScore != null || rating.malScore != null).length;
  const imdb = new Map<string, Ratings>();
  for (const source of sources) {
    const key = `${source.kind}:${source.id}`;
    const existing = { ...snapshot.titles[key] };
    // Another TMDB source may already have refreshed the same stable ID.
    for (const provider of providers) {
      const entry = store.ratings[`${provider.prefix}:${existing[provider.id]}`];
      if (entry) Object.assign(existing, entry.values);
    }
    if (Object.keys(existing).length) snapshot.titles[key] = existing;
    const needs = (provider: typeof providers[number]) => {
      const entry = store.ratings[`${provider.prefix}:${existing[provider.id]}`];
      return existing[provider.score] == null || Boolean(entry && Date.now() - entry.fetchedAt > MAX_RATING_AGE);
    };
    const needsImdb = needs(providers[0]) || Boolean(existing.imdbId && !existing.imdbVotes);
    const needsAnilist = needs(providers[1]);
    const needsMal = needs(providers[2]);
    if (!needsImdb && !needsAnilist && !needsMal) continue;
    if (Date.now() > deadline - 18000) break;
    const animeExisting = { ...existing };
    if (needsAnilist) delete animeExisting.anilistScore;
    if (needsMal) delete animeExisting.malScore;
    const [external, anime] = await Promise.all([
      needsImdb && omdbAvailable && !existing.imdbId
        ? withTimeout(getRatings(source.kind, source.id), 13000).catch(() => ({} as Ratings))
        : Promise.resolve({} as Ratings),
      needsAnilist || (needsMal && jikanAvailable)
        ? withTimeout(lookupAnimeRatings(source, {
          weekly: true, existing: animeExisting, skipJikan: !jikanAvailable || !needsMal,
          onJikanTimeout: () => { jikanAvailable = false; },
        }), 16000).catch(() => ({ ratings: {}, unavailable: true }))
        : Promise.resolve({ ratings: {}, unavailable: false }),
    ]);
    const imdbId = existing.imdbId ?? external.imdbId;
    let score: Ratings = {};
    if (needsImdb && imdbId && omdbAvailable) {
      // Bypass the week cache when refreshing an existing store entry; it may
      // still contain the score (or missing votes) we are trying to refresh.
      score = imdb.get(imdbId) ?? await primeImdbScore(imdbId, slug, Boolean(store.ratings[`imdb:${imdbId}`]));
      imdb.set(imdbId, score);
      if (score.imdbErrorReason === 'quota' || score.imdbErrorReason === 'authentication' || score.imdbStatus === 'unconfigured') omdbAvailable = false;
    }
    const ratings: Ratings = { ...existing };
    // Never merge null/undefined fallbacks or upstream error statuses.
    for (const [field, value] of Object.entries(anime.ratings)) {
      if (value != null) Object.assign(ratings, { [field]: value });
    }
    if (imdbId) ratings.imdbId = imdbId;
    if (score.imdbStatus === 'ready') {
      ratings.imdbRating = score.imdbRating ?? existing.imdbRating;
      ratings.imdbVotes = score.imdbVotes ?? existing.imdbVotes;
      ratings.imdbStatus = 'ready';
    }
    if (!anime.unavailable || score.imdbStatus === 'ready') completed++;
    snapshot.titles[key] = ratings;
    const fetched = { ...anime.ratings, ...(score.imdbStatus === 'ready' ? score : {}) };
    // Jikan's AniList fallback is not a fresh AniList fetch.
    if (!needsAnilist) delete fetched.anilistScore;
    saveRatings(store, key, ratings, fetched, Date.now());
  }
  const ids = Object.values(snapshot.titles).flatMap(rating => rating.anilistId ? [rating.anilistId] : []);
  const airings = await withTimeout(getWeekAirings(ids, week, Math.max(0, Math.min(12000, deadline - Date.now())), true, true), 12000)
    .catch(() => ({ events: [], unavailable: true }));
  const events = new Map(old.events.map(event => [event.id, event]));
  for (const event of airings.events) events.set(event.id, event);
  snapshot.events = [...events.values()];
  if (sources.length && !completed) throw new Error('Weekly ratings unavailable');

  // Storage happens in a separate request (storeWeeklyRatingsSnapshot):
  // an entry rewritten in the same request that invalidated its tag is
  // treated as stale and lost.
  for (const entries of [store.ratings, store.sources]) {
    for (const [key, entry] of Object.entries(entries)) if (Date.now() - entry.lastSeenAt > MAX_STORE_AGE) delete entries[key];
  }
  return { ...snapshot, total: sources.length, store, storeHits };
}

// Called from a fresh request after the cron invalidated WEEKLY_RATINGS_TAG.
export async function storeWeeklyRatingsSnapshot(slug: string, snapshot: WeeklyRatings): Promise<void> {
  pendingSnapshot = { slug, snapshot };
  try { await snapshotCache(true)(slug); }
  finally { pendingSnapshot = undefined; }
}
