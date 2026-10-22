import 'server-only';
import { BlobNotFoundError, get, put } from '@vercel/blob';
import { revalidateTag, unstable_cache } from 'next/cache';
import { getSeason, type AniListAnime } from '@/lib/anilist';
import { currentSeason, isSeason, shiftSeason, type AnimeSeason, type Season } from '@/lib/season';

export const ANILIST_SNAPSHOT_TAG = 'anilist-snapshot';
export const SNAPSHOT_REVALIDATE = 300;
const MAX_PAGES = 10;
const MANIFEST_KEY = 'anilist/manifest.json';
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
const seasonKey = ({ year, season }: AnimeSeason) => `anilist/seasons/${year}-${season}.json`;
const targets = (now: Date) => { const current = currentSeason(now); return [current, shiftSeason(current, -1)]; };
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const stringOrNull = (value: unknown) => value === null || typeof value === 'string';
const numberOrNull = (value: unknown) => value === null || (typeof value === 'number' && Number.isFinite(value));
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const validTitle = (value: unknown) => record(value) && ['romaji', 'english', 'native'].every(key => stringOrNull(value[key]));

export interface SnapshotSeason {
  version: 1;
  year: number;
  season: Season;
  savedAt: string;
  count: number;
  media: AniListAnime[];
}
interface ManifestSeason { key: string; count: number; savedAt: string }
export interface SnapshotManifest { version: 1; savedAt: string; seasons: ManifestSeason[] }

// Validate every field used by detail/catalog rendering, including optional
// relation and episode inputs. Malformed nested data must never enter HTML.
function validAnime(value: unknown): value is AniListAnime {
  if (!record(value) || !validId(value.id) || !(value.idMal === null || validId(value.idMal)) || !validTitle(value.title)) return false;
  if (!['bannerImage', 'description', 'format', 'status', 'season'].every(key => stringOrNull(value[key]))
    || !['episodes', 'averageScore', 'seasonYear'].every(key => numberOrNull(value[key]))
    || !Array.isArray(value.genres) || !value.genres.every(genre => typeof genre === 'string')) return false;
  const cover = value.coverImage; const start = value.startDate;
  if (cover !== null && !(record(cover) && ['large', 'extraLarge', 'color'].every(key => stringOrNull(cover[key])))) return false;
  if (start !== null && !(record(start) && ['year', 'month', 'day'].every(key => numberOrNull(start[key])))) return false;
  if (value.studios !== null && !(record(value.studios) && Array.isArray(value.studios.nodes) && value.studios.nodes.every(node => record(node) && validId(node.id) && typeof node.name === 'string'))) return false;
  if (value.updatedAt !== undefined && !numberOrNull(value.updatedAt)) return false;
  if (value.trailer != null && !(record(value.trailer) && stringOrNull(value.trailer.id) && stringOrNull(value.trailer.site))) return false;
  if (value.nextAiringEpisode != null && !(record(value.nextAiringEpisode) && validId(value.nextAiringEpisode.episode) && typeof value.nextAiringEpisode.airingAt === 'number' && Number.isFinite(value.nextAiringEpisode.airingAt))) return false;
  if (value.stats != null && !(record(value.stats) && (value.stats.scoreDistribution === undefined || (Array.isArray(value.stats.scoreDistribution) && value.stats.scoreDistribution.every(item => record(item) && typeof item.amount === 'number' && Number.isFinite(item.amount)))))) return false;
  if (value.relations !== undefined && !(record(value.relations) && Array.isArray(value.relations.edges) && value.relations.edges.every(edge => record(edge) && typeof edge.relationType === 'string' && record(edge.node) && validId(edge.node.id) && typeof edge.node.type === 'string' && stringOrNull(edge.node.format) && validTitle(edge.node.title) && (edge.node.startDate === null || (record(edge.node.startDate) && numberOrNull(edge.node.startDate.year)))))) return false;
  return true;
}

// Explicit projection prevents future GraphQL additions (or arbitrary upstream
// fields) from silently expanding the persisted snapshot.
function displayedFields(anime: AniListAnime): AniListAnime {
  const title = (value: AniListAnime['title']) => ({ romaji: value.romaji, english: value.english, native: value.native });
  return {
    id: anime.id, idMal: anime.idMal, title: title(anime.title), updatedAt: anime.updatedAt,
    coverImage: anime.coverImage && { large: anime.coverImage.large, extraLarge: anime.coverImage.extraLarge, color: anime.coverImage.color },
    bannerImage: anime.bannerImage, description: anime.description,
    startDate: anime.startDate && { year: anime.startDate.year, month: anime.startDate.month, day: anime.startDate.day },
    episodes: anime.episodes, format: anime.format, status: anime.status, genres: [...anime.genres], averageScore: anime.averageScore,
    studios: anime.studios && { nodes: anime.studios.nodes.map(({ id, name }) => ({ id, name })) },
    season: anime.season, seasonYear: anime.seasonYear,
    stats: anime.stats && { scoreDistribution: anime.stats.scoreDistribution?.map(({ amount }) => ({ amount })) },
    trailer: anime.trailer && { id: anime.trailer.id, site: anime.trailer.site },
    nextAiringEpisode: anime.nextAiringEpisode && { episode: anime.nextAiringEpisode.episode, airingAt: anime.nextAiringEpisode.airingAt },
    relations: anime.relations && { edges: anime.relations.edges.map(({ relationType, node }) => ({ relationType, node: {
      id: node.id, type: node.type, format: node.format, title: title(node.title), startDate: node.startDate && { year: node.startDate.year },
    } })) },
  };
}

function validSnapshot(value: unknown, target: AnimeSeason): value is SnapshotSeason {
  if (!record(value) || value.version !== 1 || value.year !== target.year || value.season !== target.season || !validDate(value.savedAt)) return false;
  return Number.isSafeInteger(value.count) && Number(value.count) > 0 && Number(value.count) <= MAX_PAGES * 50
    && Array.isArray(value.media) && value.media.length === value.count && value.media.every(validAnime)
    && new Set(value.media.map(anime => anime.id)).size === value.count;
}
function validManifest(value: unknown): value is SnapshotManifest {
  return record(value) && value.version === 1 && validDate(value.savedAt) && Array.isArray(value.seasons)
    && value.seasons.length > 0 && value.seasons.length <= 2
    && value.seasons.every(entry => record(entry) && typeof entry.key === 'string' && /^anilist\/seasons\/[1-9]\d{0,3}-(winter|spring|summer|fall)\.json$/.test(entry.key)
      && Number.isSafeInteger(entry.count) && Number(entry.count) > 0 && Number(entry.count) <= MAX_PAGES * 50 && validDate(entry.savedAt))
    && new Set(value.seasons.map(entry => entry.key)).size === value.seasons.length;
}

class SnapshotMissingError extends Error {}
async function readBlob(key: string): Promise<unknown> {
  const result = await get(key, { access: 'private', useCache: false, abortSignal: AbortSignal.timeout(10000) });
  // Throw on misses/invalid files too: a cold Blob must be retried next time,
  // rather than caching absence throughout an upstream outage.
  if (!result) throw new SnapshotMissingError('Snapshot missing');
  if (result.statusCode !== 200) throw new Error('Snapshot read failed');
  return new Response(result.stream).json();
}
async function readSeason(target: AnimeSeason): Promise<SnapshotSeason> {
  const payload = await readBlob(seasonKey(target));
  if (!validSnapshot(payload, target)) throw new Error('Invalid season snapshot');
  return { ...payload, media: payload.media.map(displayedFields) };
}
export async function readAniListSnapshotSeason(year: number, season: Season): Promise<SnapshotSeason | null> {
  if (!configured() || !Number.isSafeInteger(year) || year < 1 || year > 9999 || !isSeason(season)) return null;
  const target = { year, season }; const key = seasonKey(target);
  try {
    return await unstable_cache(() => readSeason(target), ['anilist-season-v1', key], {
      revalidate: SNAPSHOT_REVALIDATE, tags: [ANILIST_SNAPSHOT_TAG, key],
    })();
  } catch { return null; } // Outside cache: failures never become cached misses.
}
export async function readSnapshotManifest(): Promise<SnapshotManifest | null> {
  if (!configured()) return null;
  try {
    return await unstable_cache(async () => {
      const payload = await readBlob(MANIFEST_KEY);
      if (!validManifest(payload)) throw new Error('Invalid snapshot manifest');
      return payload;
    }, ['anilist-manifest-v1'], { revalidate: SNAPSHOT_REVALIDATE, tags: [ANILIST_SNAPSHOT_TAG, MANIFEST_KEY] })();
  } catch { return null; }
}

export async function findSnapshotAnime(id: number): Promise<AniListAnime | null> {
  if (!validId(id)) return null;
  const seasons = await Promise.all(targets(new Date()).map(({ year, season }) => readAniListSnapshotSeason(year, season)));
  const byId = new Map<number, AniListAnime>();
  // Current-season data takes precedence when an ID appears in both files.
  for (const snapshot of seasons.reverse()) for (const anime of snapshot?.media ?? []) byId.set(anime.id, anime);
  return byId.get(id) ?? null;
}

export async function snapshotHealth(now = new Date()) {
  const snapshots = await Promise.all(targets(now).map(({ year, season }) => readAniListSnapshotSeason(year, season)));
  const seasons = snapshots.flatMap(snapshot => snapshot ? [{ key: seasonKey(snapshot), count: snapshot.count }] : []);
  const savedAt = snapshots.flatMap(snapshot => snapshot ? [snapshot.savedAt] : []).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
  const ageHours = savedAt ? Math.max(0, (now.getTime() - Date.parse(savedAt)) / 3600000) : null;
  const stale = seasons.length !== 2 || ageHours === null || ageHours > 24;
  return { ok: !stale, ageHours, stale, savedAt, seasons };
}
export function warnSnapshotStale(health: Awaited<ReturnType<typeof snapshotHealth>>) {
  if (health.stale) console.warn(JSON.stringify({ event: 'anilist_snapshot_stale', ...health }));
}

type RefreshSeason = { key: string; season: string; status: 'written' | 'failed'; count?: number; reason?: string };
export async function refreshAniListSnapshot(now = new Date()) {
  const results: RefreshSeason[] = [];
  const writtenSnapshots = new Map<string, SnapshotSeason>();
  const deadline = Date.now() + 240000;
  const savedAt = now.toISOString();
  const fail = (season: string, reason: string) => console.error(JSON.stringify({ event: 'anilist_snapshot_failed', season, reason, savedAt }));
  for (const target of targets(now)) {
    const key = seasonKey(target); const season = `${target.year}-${target.season}`;
    try {
      if (!configured()) throw new Error('Blob storage not configured');
      const media = new Map<number, AniListAnime>();
      for (let page = 1; page <= MAX_PAGES; page++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Refresh time budget exhausted');
        // Bypass the daily live cache: savedAt must represent a fresh fetch.
        const data = await getSeason(target.year, target.season, page, { fresh: true, maxWaitMs: remaining });
        if (data.unavailable) throw new Error('AniList unavailable');
        if (!data.media.every(validAnime)) throw new Error('Invalid AniList media');
        for (const anime of data.media) media.set(anime.id, displayedFields(anime));
        if (!data.pageInfo.hasNextPage) break;
        if (!data.media.length || page === MAX_PAGES) throw new Error('Incomplete season pagination');
      }
      if (!media.size) throw new Error('Empty AniList season');
      const payload: SnapshotSeason = { version: 1, ...target, savedAt, count: media.size, media: [...media.values()] };
      if (!validSnapshot(payload, target)) throw new Error('Invalid AniList media');
      await put(key, JSON.stringify(payload), {
        access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
        cacheControlMaxAge: 60, abortSignal: AbortSignal.timeout(10000),
      });
      revalidateTag(key, { expire: 0 });
      writtenSnapshots.set(key, payload);
      results.push({ key, season, status: 'written', count: media.size });
    } catch (error) {
      // Use fixed reasons for external errors; SDK messages can contain URLs
      // or credentials. Never log arbitrary upstream response bodies.
      const reason = error instanceof Error && /^(Blob storage not configured|Refresh time budget exhausted|AniList unavailable|Invalid AniList media|Incomplete season pagination|Empty AniList season)$/.test(error.message)
        ? error.message : 'Snapshot refresh failed';
      fail(season, reason);
      results.push({ key, season, status: 'failed', reason });
    }
  }
  let manifestFailed = false;
  if (results.some(result => result.status === 'written')) {
    try {
      // Read origin directly: tag expiry may not take effect inside the same
      // invocation. Retain metadata for an unchanged, previously good season.
      const snapshots = await Promise.all(targets(now).map(async target => {
        const written = writtenSnapshots.get(seasonKey(target));
        if (written) return written;
        try { return await readSeason(target); }
        catch (error) {
          if (error instanceof SnapshotMissingError || error instanceof BlobNotFoundError) return null;
          throw error;
        }
      }));
      const seasons = snapshots.flatMap(snapshot => snapshot ? [{ key: seasonKey(snapshot), count: snapshot.count, savedAt: snapshot.savedAt }] : []);
      const manifest: SnapshotManifest = { version: 1, savedAt, seasons };
      if (!validManifest(manifest)) throw new Error('Invalid manifest');
      await put(MANIFEST_KEY, JSON.stringify(manifest), {
        access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
        cacheControlMaxAge: 60, abortSignal: AbortSignal.timeout(10000),
      });
      revalidateTag(MANIFEST_KEY, { expire: 0 });
    } catch { manifestFailed = true; fail('manifest', 'Manifest update failed'); }
  }
  const written = results.filter(result => result.status === 'written').length;
  return { ok: written === 2 && !manifestFailed, written, manifestFailed, seasons: results };
}
