import 'server-only';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import { unstable_cache } from 'next/cache';
import { storeImdbRatingIndex, hasImdbRatingIndex, migrateLegacyImdbIndex, ratingBucket, RATING_SHARDS, readImdbRatingShards, type RatingShard } from '@/lib/imdb-rating-index';
import { japanDate } from '@/lib/weekly-episodes';
import { storeImdbEpisodeIndex, hasImdbEpisodeIndex, type EpisodeShard } from '@/lib/imdb-episode-index';

export interface ImdbEpisodeTarget { imdbId: string; seriesImdbId: string }
export interface DatasetEpisodeScore { season: number; episode: number; score: number; votes: number }
export interface ImdbDatasetEpisodes {
  status: 'ready' | 'unavailable';
  ratings: Record<string, DatasetEpisodeScore>;
  updatedAt: string;
  dataUpdatedAt?: string;
}
const MAX_EPISODES = 60;
const MAX_BYTES = 1024 * 1024 * 1024; // Decompressed stream limit.
const MAX_LINE = 4096;
const files = {
  ratings: { name: 'title.ratings.tsv.gz', header: 'tconst\taverageRating\tnumVotes' },
  episodes: { name: 'title.episode.tsv.gz', header: 'tconst\tparentTconst\tseasonNumber\tepisodeNumber' },
} as const;

// Stream the official TSV files instead of loading a complete IMDb database
// into memory or the Next data cache. Index only validated scores, votes and
// episode coordinates; never retain the full title.episode catalogue.
async function matchingRows(file: keyof typeof files, wanted: Set<string>, signal: AbortSignal, shards?: RatingShard[], chart?: { shards: EpisodeShard[]; ratings: Promise<RatingShard[]> }) {
  if (chart) void chart.ratings.catch(() => undefined);
  const response = await fetch(`https://datasets.imdbws.com/${files[file].name}`, { cache: 'no-store', signal });
  if (!response.ok || !response.body) throw new Error('IMDb dataset unavailable');
  const input = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  const output = createGunzip();
  const transfer = pipeline(input, output, { signal });
  // Attach immediately: transfer can reject while the iterator consumes data.
  void transfer.catch(() => undefined);
  const decoder = new StringDecoder('utf8');
  const rows = new Map<string, string[]>();
  let buffer = '', bytes = 0, headerSeen = false, ratingRows = 0, chartRows = 0;
  let chartRatings: RatingShard[] | undefined;
  const consume = (line: string) => {
    if (!headerSeen) {
      if (line.replace(/^\uFEFF/, '').replace(/\r$/, '') !== files[file].header) throw new Error('IMDb dataset schema changed');
      headerSeen = true;
      return;
    }
    if (!line) return;
    if (line.length > MAX_LINE) throw new Error('IMDb dataset row too large');
    const tab = line.indexOf('\t');
    if (file === 'ratings' && shards) {
      if (++ratingRows > 3000000) throw new Error('IMDb rating index size limit reached');
      const columns = line.replace(/\r$/, '').split('\t');
      if (columns.length !== 3 || !/^tt\d+$/.test(columns[0])) throw new Error('Invalid IMDb rating row');
      const [id, scoreText, votesText] = columns;
      if (/^\d+(?:\.\d+)?$/.test(scoreText) && /^\d+$/.test(votesText)) {
        const score = Number(scoreText), votes = Number(votesText);
        if (score > 0 && score <= 10 && Number.isSafeInteger(votes) && votes > 0) {
          const shard = shards[ratingBucket(id)];
          if (shard[id]) throw new Error('Duplicate IMDb rating row');
          shard[id] = [score, votes];
        }
      }
    }
    if (file === 'episodes' && chart && chartRatings) {
      const [id, parent, seasonText, episodeText, extra] = line.replace(/\r$/, '').split('\t');
      const rating = /^tt\d+$/.test(id) ? chartRatings[ratingBucket(id)][id] : undefined;
      if (extra === undefined && rating && /^tt\d+$/.test(parent) && parent !== id && /^\d+$/.test(seasonText) && /^\d+$/.test(episodeText)) {
        const season = Number(seasonText), episode = Number(episodeText);
        if (Number.isSafeInteger(season) && season >= 0 && season <= 10000 && Number.isSafeInteger(episode) && episode > 0 && episode <= 100000) {
          if (++chartRows > 3000000) throw new Error('Episode chart index size limit reached');
          const partition = chart.shards[ratingBucket(parent)];
          const entries = partition[parent] ??= [];
          if (entries.length >= 10000) throw new Error('Episode chart series size limit reached');
          entries.push([id, season, episode, rating[0], rating[1]]);
        }
      }
    }
    if (tab < 0 || !wanted.has(line.slice(0, tab))) return;
    const columns = line.replace(/\r$/, '').split('\t');
    if (columns.length !== (file === 'ratings' ? 3 : 4) || rows.has(columns[0])) throw new Error('Ambiguous IMDb dataset row');
    rows.set(columns[0], columns);
  };
  try {
    // Both HTTP streams start together; backpressure bounds the episode stream
    // while the score index finishes. No full title.episode file is retained.
    if (chart) chartRatings = await chart.ratings;
    for await (const chunk of output) {
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Error('IMDb dataset size limit reached');
      buffer += decoder.write(chunk);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (buffer.length > MAX_LINE) throw new Error('IMDb dataset row too large');
    }
    buffer += decoder.end();
    if (buffer) consume(buffer);
    await transfer;
    if (!headerSeen || (shards && !ratingRows)) throw new Error('Empty IMDb dataset');
    const modified = response.headers.get('last-modified');
    return { rows, modified: modified && Number.isFinite(Date.parse(modified)) ? new Date(modified).toISOString() : undefined };
  } finally {
    input.destroy(); output.destroy();
    await transfer.catch(() => undefined);
  }
}

function targetsForCache(targets: readonly ImdbEpisodeTarget[]): ImdbEpisodeTarget[] {
  if (targets.length > MAX_EPISODES) throw new Error('Too many IMDb episode targets');
  const unique = new Map<string, ImdbEpisodeTarget>();
  const ambiguous = new Set<string>();
  for (const target of targets) {
    if (!/^tt\d+$/.test(target.imdbId) || !/^tt\d+$/.test(target.seriesImdbId)) throw new Error('Invalid IMDb identity');
    if (unique.has(target.imdbId) && unique.get(target.imdbId)!.seriesImdbId !== target.seriesImdbId) ambiguous.add(target.imdbId);
    unique.set(target.imdbId, { imdbId: target.imdbId, seriesImdbId: target.seriesImdbId });
  }
  return [...unique.values()].filter(target => !ambiguous.has(target.imdbId)).sort((a, b) => a.imdbId.localeCompare(b.imdbId));
}

interface DailyDatasetEpisodes extends ImdbDatasetEpisodes { indexVersion?: number; parents: Record<string, string>; chartStatus?: 'ready' | 'unavailable' }
const pendingTargets = new Map<string, ImdbEpisodeTarget[]>();
const inFlight = new Map<string, Promise<DailyDatasetEpisodes>>();
const dailyLoader = async (day: string): Promise<DailyDatasetEpisodes> => {
  const key = day;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const targets = pendingTargets.get(day);
  if (!targets) throw new Error('Cold IMDb daily dataset cache');
  const task = (async (): Promise<DailyDatasetEpisodes> => {
    const updatedAt = new Date().toISOString();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const wanted = new Set(targets.map(target => target.imdbId));
      const shards: RatingShard[] = Array.from({ length: RATING_SHARDS }, () => ({}));
      const chartShards: EpisodeShard[] = Array.from({ length: RATING_SHARDS }, () => ({}));
      const ratingTask = matchingRows('ratings', wanted, controller.signal, shards);
      const [ratingResult, episodeResult] = await Promise.allSettled([
        ratingTask, matchingRows('episodes', wanted, controller.signal, undefined, { shards: chartShards, ratings: ratingTask.then(() => shards) }),
      ]);
      if (ratingResult.status === 'rejected') throw ratingResult.reason;
      const ratings = ratingResult.value;
      // The optional global episode stream must never prevent a complete
      // title-rating file from refreshing, including days with no weekly targets.
      await storeImdbRatingIndex(day, shards);
      if (episodeResult.status === 'rejected') return {
        status: targets.length ? 'unavailable' : 'ready', indexVersion: 2, chartStatus: 'unavailable', ratings: {}, parents: {}, updatedAt,
        ...(ratings.modified ? { dataUpdatedAt: ratings.modified } : {}),
      };
      const episodes = episodeResult.value;
      const result: Record<string, DatasetEpisodeScore> = {};
      const parents: Record<string, string> = {};
      for (const target of targets) {
        const rating = ratings.rows.get(target.imdbId), identity = episodes.rows.get(target.imdbId);
        // Membership in title.episode proves this is an episode, and the exact
        // parent must agree. IMDb numbering replaces the TMDB coordinates.
        if (!rating || !identity || identity[1] !== target.seriesImdbId || !/^\d+(?:\.\d+)?$/.test(rating[1])
          || !/^\d+$/.test(rating[2]) || !/^\d+$/.test(identity[2]) || !/^\d+$/.test(identity[3])) continue;
        const score = Number(rating[1]), votes = Number(rating[2]), season = Number(identity[2]), episode = Number(identity[3]);
        if (!Number.isFinite(score) || score <= 0 || score > 10 || !Number.isSafeInteger(votes) || votes <= 0
          || !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode <= 0) continue;
        result[target.imdbId] = { score, votes, season, episode };
        parents[target.imdbId] = target.seriesImdbId;
      }
      // Chart storage is optional: a failed partition must not remove a valid
      // title-score index or the weekly Top 5 result. Readers retain yesterday.
      const chartReady = await storeImdbEpisodeIndex(day, chartShards, updatedAt, ratings.modified).then(() => true).catch(() => {
        console.warn('[episode-chart] daily cache write unavailable'); return false;
      });
      return { status: 'ready', indexVersion: 2, chartStatus: chartReady ? 'ready' : 'unavailable', ratings: result, parents, updatedAt, ...(ratings.modified ? { dataUpdatedAt: ratings.modified } : {}) };
    } catch {
      controller.abort();
      // Cache the failed daily attempt too; tomorrow has a different key.
      return { status: 'unavailable', chartStatus: 'unavailable', ratings: {}, parents: {}, updatedAt };
    } finally { clearTimeout(timeout); }
  })();
  inFlight.set(key, task);
  try { return await task; }
  finally { inFlight.delete(key); }
};
Object.defineProperty(dailyLoader, 'toString', { value: () => 'imdb-official-episode-daily-loader-v2' });
// Key only by date: changing the candidate list or redeploying cannot download
// a third file on the same day. Newly identified episodes wait until tomorrow.
const dailyEpisodes = unstable_cache(dailyLoader, ['imdb-official-episode-daily-v2'], { revalidate: 172800, tags: ['imdb-datasets'] });

// One-time migration of an older daily result whose deferred Next cache writes
// were incomplete. Reuse complete legacy partitions first. Otherwise download
// only the rating file once for this migration day; never consume OMDb quota.
const repairIndexLoader = async (day: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const shards: RatingShard[] = Array.from({ length: RATING_SHARDS }, () => ({}));
    await matchingRows('ratings', new Set(), controller.signal, shards);
    await storeImdbRatingIndex(day, shards);
    return true;
  } catch { return false; }
  finally { clearTimeout(timer); }
};
Object.defineProperty(repairIndexLoader, 'toString', { value: () => 'imdb-runtime-index-migration-loader-v1' });
const repairDailyIndex = unstable_cache(repairIndexLoader, ['imdb-runtime-index-migration-v1'], { revalidate: 172800, tags: ['imdb-datasets'] });
export async function repairLegacyImdbRatingIndex(day = japanDate()): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid IMDb index day');
  if (await hasImdbRatingIndex(day)) return true;
  if (await migrateLegacyImdbIndex(day)) return true;
  return repairDailyIndex(day);
}

// Migrate a completed daily result from before chart collection was introduced.
// Reuse every verified rating partition; fetch only episode metadata, once per
// date including failures. Normal daily attempts (including failed ones) never
// enter this repair, so a chart outage cannot double the daily downloads.
const repairEpisodeIndexLoader = async (day: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  let stage = 'cached-ratings';
  try {
    const ratings = await readImdbRatingShards(day);
    if (!ratings) { console.warn('[episode-chart] bootstrap unavailable', { stage }); return false; }
    const shards: EpisodeShard[] = Array.from({ length: RATING_SHARDS }, () => ({}));
    stage = 'episode-stream';
    const metadata = await matchingRows('episodes', new Set(), controller.signal, undefined, { shards, ratings: Promise.resolve(ratings) });
    stage = 'chart-storage';
    await storeImdbEpisodeIndex(day, shards, new Date().toISOString(), metadata.modified);
    console.info('[episode-chart] bootstrap complete', { day });
    return true;
  } catch { console.warn('[episode-chart] bootstrap unavailable', { stage }); return false; }
  finally { clearTimeout(timer); }
};
Object.defineProperty(repairEpisodeIndexLoader, 'toString', { value: () => 'imdb-episode-index-migration-loader-v1' });
const repairDailyEpisodeIndex = unstable_cache(repairEpisodeIndexLoader, ['imdb-episode-index-migration-v1'], { revalidate: 172800, tags: ['imdb-datasets'] });
const chartRepairs = new Map<string, Promise<boolean>>();
// Call only from the authenticated cron, even when its weekly snapshot is warm.
export function ensureImdbEpisodeIndex(day = japanDate()): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return Promise.reject(new Error('Invalid IMDb index day'));
  const pending = chartRepairs.get(day);
  if (pending) return pending;
  const task = (async () => {
    if (await hasImdbEpisodeIndex(day)) return true;
    if (!pendingTargets.has(day)) pendingTargets.set(day, []);
    let collected: DailyDatasetEpisodes;
    try { collected = await dailyEpisodes(day); }
    finally { pendingTargets.delete(day); }
    if (await hasImdbEpisodeIndex(day)) return true;
    // chartStatus means this day was already attempted by the new collector.
    if (collected.chartStatus || collected.status !== 'ready') return false;
    return repairDailyEpisodeIndex(day);
  })().finally(() => chartRepairs.delete(day));
  chartRepairs.set(day, task);
  return task;
}

// Only the authenticated collector calls this writer. Public pages read the
// small stored weekly snapshot and never download either dataset.
export async function primeImdbDatasetEpisodes(targets: readonly ImdbEpisodeTarget[], day = japanDate()): Promise<ImdbDatasetEpisodes> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Invalid IMDb dataset day');
  const selected = targetsForCache(targets);
  if (!pendingTargets.has(day)) pendingTargets.set(day, selected);
  try {
    const cached = await dailyEpisodes(day);
    if (cached.status === 'ready' && cached.indexVersion !== 2) await repairLegacyImdbRatingIndex(day);
    // A cache hit still requires the exact parent requested by this collector.
    const ratings = Object.fromEntries(selected.filter(target => cached.parents[target.imdbId] === target.seriesImdbId && cached.ratings[target.imdbId]).map(target => [target.imdbId, cached.ratings[target.imdbId]]));
    return { status: cached.status, ratings, updatedAt: cached.updatedAt, ...(cached.dataUpdatedAt ? { dataUpdatedAt: cached.dataUpdatedAt } : {}) };
  } finally { pendingTargets.delete(day); }
}
