import 'server-only';
import { unstable_cache } from 'next/cache';
import { tokenHash } from '@/lib/my-anime-auth';
import { traktJson } from '@/lib/my-anime-trakt';
import { resolvePersonalAnime } from '@/lib/my-anime-identity';
import { animeHistoryStats, type TraktHistoryPlay, type PersonalAnimeStats } from '@/lib/my-anime-stats-model';
import type { TraktShow } from '@/lib/my-anime-week';
import { personalCacheTag, personalAggregates } from '@/lib/my-anime-cache';
interface HistoryPage { plays: TraktHistoryPlay[]; shows: TraktShow[]; pages: number; partial: boolean; capturedAt: string }
function historyPage(token: string, page: number, capturedAt?: string, maxWaitMs = 15000): Promise<HistoryPage> {
  // Cache compact private pages too, so a large import resumes without fetching
  // the same history over and over. Freeze end_at for stable pagination.
  return unstable_cache(async () => {
    const endAt = capturedAt ?? new Date().toISOString();
    const result = await traktJson<TraktHistoryPlay[]>(`/users/me/history/episodes?page=${page}&limit=1000&extended=full&end_at=${encodeURIComponent(endAt)}`, token, maxWaitMs);
    if (!Array.isArray(result.data)) throw new Error('Invalid watched history');
    const plays: TraktHistoryPlay[] = [], shows = new Map<number, TraktShow>();
    let partial = false;
    for (const item of result.data) {
      if (!Number.isSafeInteger(item?.id) || item.id <= 0 || !Number.isSafeInteger(item.show?.ids?.trakt) || item.show.ids.trakt <= 0 || typeof item.show.title !== 'string'
        || !Number.isSafeInteger(item.episode?.season) || item.episode.season < 0 || !Number.isSafeInteger(item.episode.number) || item.episode.number <= 0 || item.type !== 'episode') { partial = true; continue; }
      plays.push({ id: item.id, type: item.type, show: { title: item.show.title, ids: item.show.ids }, episode: { season: item.episode.season, number: item.episode.number, runtime: item.episode.runtime } });
      shows.set(item.show.ids.trakt, { title: item.show.title, ids: item.show.ids, year: item.show.year, country: item.show.country, genres: item.show.genres });
    }
    return { plays, shows: [...shows.values()], pages: result.pages, partial, capturedAt: endAt };
  }, ['my-anime-history-v1', tokenHash(token), String(page), capturedAt ?? 'latest'], { revalidate: 900, tags: [personalCacheTag(token)] })();
}
async function loadStats(token: string): Promise<PersonalAnimeStats> {
  const deadline = Date.now() + 25000;
  const history = new Map<number, TraktHistoryPlay>(), shows = new Map<number, TraktShow>();
  let partial = false, loaded = false, syncing = false, capturedAt: string | undefined;
  // Imports exceeding one request's budget resume from private cached pages.
  // 1,000 pages is a defensive bound; exceeding it is explicitly a subtotal.
  for (let page = 1; page <= 1000; page++) {
    if (Date.now() >= deadline) { partial = true; syncing = true; break; }
    try {
      const result = await historyPage(token, page, capturedAt, Math.max(1, deadline - Date.now()));
      loaded = true; capturedAt = result.capturedAt; partial ||= result.partial;
      for (const play of result.plays) history.set(play.id, play);
      for (const show of result.shows) shows.set(show.ids.trakt, show);
      if (page >= result.pages) break;
      if (page === 1000) partial = true;
    } catch { partial = true; syncing = Date.now() >= deadline; break; }
  }
  if (!loaded) throw new Error('Watched history unavailable');
  const resolved = await resolvePersonalAnime([...shows.values()], [], 25000);
  if (!resolved.identities.size && resolved.unavailable && !resolved.deferred) throw new Error('Anime identities unavailable');
  const data = { ...animeHistoryStats([...history.values()], resolved.identities, partial || resolved.unavailable || resolved.unmatched > 0, resolved.unmatched),
    syncing: syncing || resolved.deferred, updatedAt: capturedAt! };
  return data;
}
const pending = new Map<string, Promise<PersonalAnimeStats>>();
export async function getPersonalStats(token: string): Promise<PersonalAnimeStats> {
  const hash = tokenHash(token);
  const current = pending.get(hash);
  if (current) return current;
  // Keep the aggregate outside Next's unstable_cache callback: nested
  // unstable_cache calls bypass reads, which would re-fetch every history page
  // during a continuation. Page/catalog caches execute in the request context.
  const request = (async () => {
    try {
      const cached = await personalAggregates.get(hash) as PersonalAnimeStats | null;
      if (cached?.status === 'ready' && !cached.syncing && Number.isFinite(cached.minutes)
        && Date.now() - Date.parse(cached.updatedAt) < 900000) return cached;
    } catch { /* The private page cache can still serve the import. */ }
    const data = await loadStats(token);
    if (!data.syncing) {
      try { await personalAggregates.set(hash, data, { ttl: 900, tags: [personalCacheTag(token)] }); }
      catch { /* Return valid totals even if the aggregate cache is unavailable. */ }
    }
    return data;
  })().catch((): PersonalAnimeStats => ({ status: 'unavailable', series: 0, episodes: 0, plays: 0, rewatches: 0, minutes: 0, missingRuntimePlays: 0,
      unmatched: 0, partial: true, updatedAt: new Date().toISOString() }));
  pending.set(hash, request);
  try { return await request; } finally { pending.delete(hash); }
}
