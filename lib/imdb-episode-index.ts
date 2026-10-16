import 'server-only';
import { getCache } from '@vercel/functions';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { japanDate } from '@/lib/weekly-episodes';
import { ratingBucket, RATING_SHARDS } from '@/lib/imdb-rating-index';
import { validChartEpisode, validImdbId, type ChartEpisode, type EpisodeChartData } from '@/lib/episode-chart';
import { withTimeout } from '@/lib/async-timeout';

export type EpisodeTuple = [id: string, season: number, episode: number, score: number, votes: number];
export type EpisodeShard = Record<string, EpisodeTuple[]>;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const cache = getCache({ namespace: 'anime-weekly-episode-chart-v1', keyHashFunction: digest });
const options = { ttl: 8 * 86400, tags: ['imdb-episode-chart'] };
const key = (day: string, part: string | number) => `episode-chart:${day}:${part}`;
interface Manifest { hashes: string[]; updatedAt: string; dataUpdatedAt?: string }
function validManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Manifest;
  return Array.isArray(item.hashes) && item.hashes.length === RATING_SHARDS
    && item.hashes.every(hash => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
    && typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt))
    && (item.dataUpdatedAt === undefined || (typeof item.dataUpdatedAt === 'string' && Number.isFinite(Date.parse(item.dataUpdatedAt))));
}
async function persist(id: string, value: unknown) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await cache.set(id, value, options);
    if (JSON.stringify(await cache.get(id)) === JSON.stringify(value)) return;
  }
  throw new Error('Episode chart cache write could not be verified');
}

// Called only by the existing daily dataset collector; no new dataset requests.
export async function storeImdbEpisodeIndex(day: string, shards: EpisodeShard[], updatedAt: string, dataUpdatedAt?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || shards.length !== RATING_SHARDS || !Number.isFinite(Date.parse(updatedAt))) throw new Error('Invalid episode chart index');
  const encoded = shards.map(shard => {
    const json = JSON.stringify(shard);
    if (Buffer.byteLength(json) > 4 * 1024 * 1024) throw new Error('Episode chart partition too large');
    const value = gzipSync(json).toString('base64');
    if (Buffer.byteLength(value) > 900000) throw new Error('Episode chart cache limit reached');
    return value;
  });
  let index = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < encoded.length && !failure) {
      const bucket = index++;
      try { await persist(key(day, bucket), encoded[bucket]); }
      catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure;
  await persist(key(day, 'complete'), { hashes: encoded.map(digest), updatedAt, ...(dataUpdatedAt ? { dataUpdatedAt } : {}) });
}

// An ISR render or retry reads one compact series partition. Never fetch IMDb,
// TMDB, or OMDb here, including on a miss or an incomplete daily write.
export async function readImdbEpisodeChart(seriesId: string, now = new Date()): Promise<EpisodeChartData> {
  if (!validImdbId(seriesId)) return { status: 'unavailable', episodes: [] };
  const deadline = Date.now() + 4000;
  let failed = false;
  for (let age = 0; age < 7; age++) {
    if (Date.now() >= deadline) break;
    const day = japanDate(new Date(now.getTime() - age * 86400000));
    try {
      const manifest = await withTimeout(cache.get(key(day, 'complete')), Math.max(1, Math.min(1000, deadline - Date.now())));
      if (!validManifest(manifest)) continue;
      const bucket = ratingBucket(seriesId), encoded = await withTimeout(cache.get(key(day, bucket)), Math.max(1, Math.min(1000, deadline - Date.now())));
      if (typeof encoded !== 'string' || digest(encoded) !== manifest.hashes[bucket]) { failed = true; continue; }
      const shard = JSON.parse(gunzipSync(Buffer.from(encoded, 'base64'), { maxOutputLength: 4 * 1024 * 1024 }).toString()) as EpisodeShard;
      const tuples = shard[seriesId] ?? [];
      if (!Array.isArray(tuples) || tuples.length > 10000) { failed = true; continue; }
      const episodes: ChartEpisode[] = [];
      let valid = true;
      for (const tuple of tuples) {
        if (!Array.isArray(tuple) || tuple.length !== 5) { valid = false; break; }
        const [imdbId, season, episode, score, votes] = tuple;
        const item = { imdbId, season, episode, score, votes };
        if (!validChartEpisode(item)) { valid = false; break; }
        episodes.push(item);
      }
      if (valid) return { status: 'ready', episodes, updatedAt: manifest.updatedAt, ...(manifest.dataUpdatedAt ? { dataUpdatedAt: manifest.dataUpdatedAt } : {}) };
      failed = true;
    } catch { failed = true; /* Retain the last complete daily index during cache outages. */ }
  }
  return { status: 'unavailable', episodes: [], ...(failed ? { reason: 'cache-error' as const } : {}) };
}

const reads = new Map<string, Promise<EpisodeChartData>>();
// Read through the collector bundle after a local miss, as series scores do.
// The endpoint below is strictly read-only and cannot download a dataset.
export function getImdbEpisodeChart(seriesId: string): Promise<EpisodeChartData> {
  if (!validImdbId(seriesId)) return Promise.resolve({ status: 'unavailable', episodes: [] });
  const previous = reads.get(seriesId);
  if (previous) return previous;
  const request = (async () => {
    const local = await readImdbEpisodeChart(seriesId);
    if (local.status === 'ready') return local;
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    if (host && process.env.VERCEL_ENV === 'production') {
      try {
        return await withTimeout((async () => {
          const response = await fetch(`https://${host}/api/revalidate?episodeChart=${seriesId}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
          if (!response.ok) throw new Error('Shared episode cache unavailable');
          const result = await response.json() as EpisodeChartData & { seriesId?: string };
          if (result.seriesId !== seriesId || !['ready', 'unavailable'].includes(result.status) || !Array.isArray(result.episodes) || result.episodes.length > 10000 || !result.episodes.every(validChartEpisode)) throw new Error('Invalid shared episode cache');
          if (result.status !== 'ready') return result.reason === 'cache-error' ? { ...local, reason: 'cache-error' as const } : local;
          return { status: 'ready' as const, episodes: result.episodes, updatedAt: result.updatedAt, dataUpdatedAt: result.dataUpdatedAt };
        })(), 5000);
      } catch { return { ...local, reason: 'cache-error' as const }; }
    }
    return local;
  })().finally(() => reads.delete(seriesId));
  reads.set(seriesId, request);
  return request;
}
