import 'server-only';
import { unstable_cache } from 'next/cache';
import { CACHE_SECONDS } from '@/lib/config';
import { getAnimeRatingsById, lookupAnimeRatings } from '@/lib/anime-ratings';
import { getAnime } from '@/lib/anilist';
import { recoverJustWatchRegions } from '@/lib/justwatch-recovery';
import { LOCALE_REGIONS } from '@/lib/landing-providers';
import { isExpiredWeeklyIdentity, verifiedWeeklyIdentity, type WeeklyIdentity } from '@/lib/verified-weekly-identities';
import { getRatings, getWeeklyRatingSources, getWeeklyProviders } from '@/lib/tmdb';
import { compactAvailability, PROVIDER_MAX_AGE, type ProviderSnapshot, type ProviderStore, type StoredAvailability } from '@/lib/provider-snapshot';
import type { StreamingRegion } from '@/lib/config';
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
  availability?: ProviderSnapshot;
}
const DAY_MS = 86400000;
const MAX_RATING_AGE = 30 * DAY_MS;
const MAX_STORE_AGE = 120 * DAY_MS;
export { readRatingsStore, storeRatingsStore, type RatingsStore } from '@/lib/ratings-store';
import { readRatingsStore, type RatingsStore } from '@/lib/ratings-store';

const providers = [
  { prefix: 'imdb', id: 'imdbId', score: 'imdbRating', fields: ['imdbRating', 'imdbVotes', 'imdbStatus'] },
  { prefix: 'anilist', id: 'anilistId', score: 'anilistScore', fields: ['anilistScore'] },
  { prefix: 'mal', id: 'malId', score: 'malScore', fields: ['malScore', 'malMembers'] },
] as const;

function saveRatings(store: RatingsStore, key: string, ratings: Ratings, fetched: Ratings, now: number) {
  const previous = store.sources[key];
  const ids = { imdbId: ratings.imdbId ?? previous?.imdbId, anilistId: ratings.anilistId ?? previous?.anilistId, malId: ratings.malId ?? previous?.malId };
  if (Object.values(ids).some(id => id != null)) {
    const changed = !previous || Object.entries(ids).some(([field, id]) => id !== previous[field as keyof RatingsStore['sources'][string]]);
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
        if (data && data.titles && (Object.keys(data.titles).length || data.episodes || data.availability)) return data;
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

// Countries the site defaults to for its languages: TMDB gaps there are worth
// a JustWatch lookup during the daily cron, never from a visitor's request.
const RECOVERY_REGIONS = [...new Set(Object.values(LOCALE_REGIONS).flat())] as StreamingRegion[];

function mergeRecovered(entry: StoredAvailability, found: Awaited<ReturnType<typeof recoverJustWatchRegions>>, table: ProviderSnapshot['providers']) {
  const countries = { ...entry.countries };
  for (const [region, offers] of Object.entries(found ?? {}) as [StreamingRegion, { providers: { provider_id: number; provider_name: string }[] }][]) {
    if (!offers.providers.length) continue;
    // JustWatch package IDs are TMDB provider IDs; logos come only from TMDB.
    for (const offer of offers.providers) table[offer.provider_id] ??= { name: offer.provider_name, logo: null };
    countries[region] = [...new Set(offers.providers.map(offer => offer.provider_id))];
  }
  return countries;
}

// A verified identity's scores come from its own AniList/MAL IDs: a title
// search would match the older series TMDB merged it with.
async function identityRatings(identity: WeeklyIdentity, existing: Ratings, skipJikan: boolean, onTimeout: () => void): Promise<{ ratings: Ratings; unavailable: boolean }> {
  const ratings: Ratings = { anilistId: identity.anilistId, malId: identity.malId };
  let score = existing.anilistScore;
  if (score == null) {
    const anime = await getAnime(identity.anilistId);
    if (!anime) return { ratings, unavailable: true };
    if (anime.averageScore != null) ratings.anilistScore = score = anime.averageScore;
  }
  if (existing.malScore == null && !skipJikan) Object.assign(ratings, await getAnimeRatingsById(identity.malId, score, CACHE_SECONDS, 6000, true, onTimeout));
  return { ratings, unavailable: false };
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
    availability: { titles: Object.fromEntries(Object.entries(savedStore.availability?.titles ?? {}).map(([key, entry]) => [key, { ...entry }])), providers: { ...savedStore.availability?.providers } },
  };
  const deadline = Date.now() + 260000;
  const sources = await getWeeklyRatingSources(week);
  const names = { ...old.names };
  const snapshot: WeeklyRatings = { ...old, titles: { ...old.titles }, events: [...old.events], names };
  const availability: ProviderSnapshot = { titles: { ...old.availability?.titles }, providers: { ...old.availability?.providers, ...store.availability!.providers } };
  snapshot.availability = availability;
  const watchStore = store.availability as ProviderStore;
  // Availability has its own budget and runs before rating work can exhaust
  // the cron. Four TMDB requests at a time; successful empty results are data.
  let watchCursor = 0;
  let watchSuccesses = 0;
  const watchDeadline = Math.min(Date.now() + 50000, deadline - 18000);
  await Promise.all(Array.from({ length: Math.min(4, sources.length) }, async () => {
    while (watchCursor < sources.length) {
      const source = sources[watchCursor++];
      const key = `${source.kind}:${source.id}`;
      const identity = verifiedWeeklyIdentity(key)?.imdbId;
      const saved = watchStore.titles[key];
      const previous = availability.titles[key];
      const latest = saved && (!previous || saved.fetchedAt >= previous.fetchedAt) ? saved : previous;
      // Offers of a different identity (the merged older series, or an expired
      // pin) are never shown in place of the airing work's own.
      const existing = latest?.identity === identity ? latest : undefined;
      if (latest && !existing) { delete availability.titles[key]; delete watchStore.titles[key]; }
      if (existing) {
        const { lastSeenAt, ...entry } = existing as StoredAvailability & { lastSeenAt?: number };
        void lastSeenAt;
        availability.titles[key] = entry;
        watchStore.titles[key] = { ...entry, lastSeenAt: Date.now() };
      }
      if (existing && Date.now() - existing.fetchedAt < PROVIDER_MAX_AGE) { watchSuccesses++; continue; }
      // Verified identities are resolved from JustWatch in the recovery pass.
      if (identity || Date.now() >= watchDeadline) continue;
      try {
        const watch = await withTimeout(getWeeklyProviders(source.kind, source.id, true), 13000);
        if (watch.providersUnavailable) continue;
        const entry = compactAvailability(watch.providers, availability.providers, Date.now());
        availability.titles[key] = entry;
        watchStore.titles[key] = { ...entry, lastSeenAt: Date.now() };
        watchSuccesses++;
      } catch { /* Retain previous offers and timestamp so the next run retries. */ }
    }
  }));
  // Fill TMDB gaps in the default countries from JustWatch, once per TMDB
  // refresh (recoveredAt), with its own budget. IMDb IDs come from mappings
  // saved by earlier runs; a title without one waits for the next run.
  const recoveryDeadline = Math.min(Date.now() + 30000, deadline - 60000);
  type Recovery = { key: string; kind: 'tv' | 'movie'; name: string; imdbId: string; regions: StreamingRegion[]; identity?: string };
  const recoveries = sources.flatMap((source): Recovery[] => {
    const key = `${source.kind}:${source.id}`;
    const identity = verifiedWeeklyIdentity(key);
    const entry = availability.titles[key];
    if (identity) return entry && Date.now() - entry.fetchedAt < PROVIDER_MAX_AGE ? [] : [{ key, kind: source.kind, name: identity.justWatchName, imdbId: identity.imdbId, regions: RECOVERY_REGIONS, identity: identity.imdbId }];
    if (!entry || (entry.recoveredAt != null && entry.recoveredAt >= entry.fetchedAt)) return [];
    const regions = RECOVERY_REGIONS.filter(region => !entry.countries[region]?.length);
    const imdbId = store.sources[key]?.imdbId ?? old.titles[key]?.imdbId;
    return regions.length && imdbId ? [{ key, kind: source.kind, name: source.title, imdbId, regions }] : [];
  });
  let recoveryCursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, recoveries.length) }, async () => {
    while (recoveryCursor < recoveries.length && Date.now() < recoveryDeadline) {
      const task = recoveries[recoveryCursor++];
      const found = await withTimeout(recoverJustWatchRegions(task.name, task.imdbId, task.regions, task.kind), 25000).catch(() => null);
      if (!found) continue;
      const now = Date.now();
      const base: StoredAvailability = task.identity ? { countries: {}, fetchedAt: now, identity: task.identity } : availability.titles[task.key];
      const entry: StoredAvailability = { ...base, countries: mergeRecovered(base, found, availability.providers), recoveredAt: now };
      availability.titles[task.key] = entry;
      watchStore.titles[task.key] = { ...entry, lastSeenAt: now };
      if (task.identity) watchSuccesses++;
    }
  }));
  Object.assign(watchStore.providers, availability.providers);
  let storeHits = 0;
  // Populate every source before completed ratings or the time budget skip it.
  for (const source of sources) {
    const name = displayTitle(source.title);
    const key = `${source.kind}:${source.id}`;
    if (name) names[key] = name;
    const identity = verifiedWeeklyIdentity(key);
    // An expired pin is re-resolved from scratch rather than kept forever.
    if (!identity && store.sources[key] && isExpiredWeeklyIdentity(key, store.sources[key])) delete store.sources[key];
    const mapped = store.sources[key];
    let existing: Ratings = { ...old.titles[key] };
    if (identity ? existing.anilistId !== identity.anilistId : isExpiredWeeklyIdentity(key, existing)) existing = {};
    if (mapped) {
      mapped.lastSeenAt = Date.now();
      for (const provider of providers) if (mapped[provider.id] != null) Object.assign(existing, { [provider.id]: mapped[provider.id] });
    }
    if (identity) Object.assign(existing, { anilistId: identity.anilistId, malId: identity.malId, imdbId: identity.imdbId });
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
        ? verifiedWeeklyIdentity(key)
          ? withTimeout(identityRatings(verifiedWeeklyIdentity(key)!, animeExisting, !jikanAvailable || !needsMal, () => { jikanAvailable = false; }), 16000).catch(() => ({ ratings: {}, unavailable: true }))
          : withTimeout(lookupAnimeRatings(source, {
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
  if (sources.length && !completed && !watchSuccesses) throw new Error('Weekly ratings unavailable');

  // Storage happens in a separate request (storeWeeklyRatingsSnapshot):
  // an entry rewritten in the same request that invalidated its tag is
  // treated as stale and lost.
  for (const entries of [store.ratings, store.sources, watchStore.titles]) {
    for (const [key, entry] of Object.entries(entries)) if (Date.now() - entry.lastSeenAt > MAX_STORE_AGE) delete entries[key];
  }
  const usedProviders = new Set(Object.values(watchStore.titles).flatMap(entry => Object.values(entry.countries).flat()).map(String));
  for (const id of Object.keys(watchStore.providers)) if (!usedProviders.has(id)) delete watchStore.providers[id];
  const snapshotProviders = new Set(Object.values(availability.titles).flatMap(entry => Object.values(entry.countries).flat()).map(String));
  for (const id of Object.keys(availability.providers)) if (!snapshotProviders.has(id)) delete availability.providers[id];
  return { ...snapshot, total: sources.length, store, storeHits };
}

// Called from a fresh request after the cron invalidated WEEKLY_RATINGS_TAG.
export async function storeWeeklyRatingsSnapshot(slug: string, snapshot: WeeklyRatings): Promise<void> {
  pendingSnapshot = { slug, snapshot };
  try { await snapshotCache(true)(slug); }
  finally { pendingSnapshot = undefined; }
}
