import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { CACHE_TAG } from '@/lib/config';
import type { AniListAnime } from '@/lib/anilist';
import type { AiringEvent } from '@/lib/airing-schedule';
import { episodeInSitemap } from '@/lib/discovery';

// One batch over catalog IDs, not one request per anime or locale. Keep the
// newest 2,000 real airings; long-running series remain accessible on demand.
const readAirings = unstable_cache(async (ids: number[], until: number | null, episodes: number[] = [], maxPages = 40) => {
  const events: AiringEvent[] = [];
  // AniList distinguishes omitted filters from explicit nulls. A detail lookup
  // has no time bound; the sitemap has no episode-number filter.
  const definitions = ['$ids: [Int]', '$page: Int!'];
  const filters = ['mediaId_in: $ids'];
  const variables: Record<string, number | number[]> = { ids };
  if (until != null) {
    definitions.push('$until: Int!'); filters.push('airingAt_lesser: $until'); variables.until = until;
  }
  if (episodes.length) {
    definitions.push('$episodes: [Int]'); filters.push('episode_in: $episodes'); variables.episodes = episodes;
  }
  for (let page = 1; page <= (episodes.length ? 1 : maxPages); page++) {
    const query = `query (${definitions.join(', ')}) { Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage } airingSchedules(${filters.join(', ')}, sort: TIME_DESC) { id mediaId episode airingAt }
    } }`;
    const response = await anilistFetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { ...variables, page } }), next: { revalidate: 21600, tags: [CACHE_TAG] },
    });
    if (!response.ok) throw new Error('Episode schedule unavailable');
    const result = await response.json() as { data?: { Page?: { pageInfo?: { hasNextPage?: boolean }; airingSchedules?: AiringEvent[] } }; errors?: unknown[] };
    const data = result.data?.Page;
    if (result.errors?.length || !Array.isArray(data?.airingSchedules)) throw new Error('Episode schedule unavailable');
    events.push(...data.airingSchedules.filter(e => ids.includes(e.mediaId) && Number.isSafeInteger(e.episode) && e.episode > 0 && e.episode <= 100000 && Number.isSafeInteger(e.airingAt) && e.airingAt > 0));
    if (!data.pageInfo?.hasNextPage) break;
  }
  return events;
}, ['discovery-airing-schedules-v2'], { revalidate: 21600, tags: [CACHE_TAG] });

export const getAnimeEpisodes = cache(async (anime: AniListAnime, episode?: number) => {
  if (anime.format === 'MOVIE') return [];
  const events = [...await readAirings([anime.id], null, episode == null ? [] : [episode - 1, episode, episode + 1].filter(n => n > 0), 1).catch(() => [] as AiringEvent[])];
  const next = anime.nextAiringEpisode;
  if (next && !events.some(e => e.episode === next.episode) && Number.isSafeInteger(next.episode) && next.episode > 0 && Number.isSafeInteger(next.airingAt) && next.airingAt > 0) {
    events.push({ id: 0, mediaId: anime.id, ...next });
  }
  // Do not pick an arbitrary date when upstream gives conflicting coordinates.
  const slots = new Map<number, AiringEvent>();
  const conflicts = new Set<number>();
  for (const event of events) {
    if (slots.has(event.episode) && slots.get(event.episode)!.airingAt !== event.airingAt) conflicts.add(event.episode);
    slots.set(event.episode, event);
  }
  return [...slots.values()].filter(e => !conflicts.has(e.episode)).sort((a, b) => a.episode - b.episode);
});
export async function getSitemapEpisodes(catalog: AniListAnime[], now = new Date()) {
  const ids = catalog.filter(a => a.format !== 'MOVIE').map(a => a.id).sort((a, b) => a - b);
  if (!ids.length) return [];
  // Round to a UTC day for shared fetch keys; apply the precise window afterward.
  const until = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 15) / 1000);
  const events = [...await readAirings(ids, until)];
  for (const anime of catalog) if (anime.format !== 'MOVIE' && anime.nextAiringEpisode && !events.some(e => e.mediaId === anime.id && e.episode === anime.nextAiringEpisode!.episode)) events.push({ id: 0, mediaId: anime.id, ...anime.nextAiringEpisode });
  const slots = new Map<string, AiringEvent>();
  const conflicts = new Set<string>();
  for (const event of events) {
    const key = `${event.mediaId}:${event.episode}`;
    if (slots.has(key) && slots.get(key)!.airingAt !== event.airingAt) conflicts.add(key);
    slots.set(key, event);
  }
  return [...slots].filter(([key, e]) => !conflicts.has(key) && Number.isSafeInteger(e.episode) && e.episode > 0 && episodeInSitemap(e.airingAt, now)).map(([, e]) => e);
}
