import 'server-only';
import { unstable_cache } from 'next/cache';
import { getAnimeMappings, type AnimeMapping } from '@/lib/anilist';
import { getWeekAirings } from '@/lib/airing-schedule';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { malFetch, traktFetch, tokenHash, type AuthToken } from '@/lib/my-anime-auth';
import { buildPersonalReleases, matchMal, weekCandidates, type MalAnime, type PersonalRelease, type TraktRelease, type TraktShow } from '@/lib/my-anime-week';
import { formatWeek, weekRange, type ISOWeek } from '@/lib/week';

export interface PersonalWeekData {
  releases: PersonalRelease[]; unmatched: number; followed: number;
  unavailable: ('trakt' | 'mal' | 'anilist')[];
}
async function traktJson<T>(path: string, token: string, maxWaitMs: number): Promise<{ data: T | null; pages: number }> {
  const response = await traktFetch(`https://api.trakt.tv${path}`, { cache: 'no-store', next: undefined,
    headers: { Authorization: `Bearer ${token}`, 'trakt-api-version': '2', 'trakt-api-key': process.env.TRAKT_CLIENT_ID!, Accept: 'application/json' } }, maxWaitMs);
  if (!response.ok) throw new Error('Trakt unavailable');
  return { data: response.status === 204 ? null : await response.json() as T,
    pages: Number(response.headers.get('X-Pagination-Page-Count') || 1) };
}
async function loadTrakt(token: string, week: ISOWeek) {
  const { start, monday } = weekRange(week);
  const previous = new Date(monday.getTime() - 86400000).toISOString().slice(0, 10);
  const deadline = Date.now() + 15000;
  const events: TraktRelease[] = [], followed = new Set<number>();
  let unavailable = false;
  // Trakt dates are UTC. Fetch the previous day's edge as well, then filter
  // every timestamp in Europe/Rome (including DST changes).
  const results = await Promise.allSettled([
    traktJson<TraktRelease[]>(`/calendars/my/shows/${start}/7`, token, 15000),
    traktJson<TraktRelease[]>(`/calendars/my/shows/${previous}/1`, token, 15000),
    traktJson<{ type?: string; show?: TraktShow }>('/users/me/watching', token, 15000),
  ]);
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'rejected') { unavailable = true; continue; }
    if (index < 2) {
      if (Array.isArray(result.value.data)) events.push(...result.value.data as TraktRelease[]);
      else unavailable = true;
    } else {
      const watching = result.value.data as { show?: TraktShow } | null;
      if (watching?.show?.ids?.trakt) followed.add(watching.show.ids.trakt);
    }
  }
  try {
    for (let page = 1; page <= 10; page++) {
      const result = await traktJson<{ show: TraktShow }[]>(`/users/me/watchlist/shows?page=${page}&limit=100`, token, Math.max(0, deadline - Date.now()));
      if (!Array.isArray(result.data)) throw new Error('Invalid watchlist');
      for (const entry of result.data) if (entry?.show?.ids?.trakt) followed.add(entry.show.ids.trakt);
      if (page >= result.pages) break;
      if (page === 10) unavailable = true;
    }
  } catch { unavailable = true; }
  for (const event of events) if (event?.show?.ids?.trakt) followed.add(event.show.ids.trakt);
  return { events, followed: followed.size, unavailable };
}
const malFields = 'id,title,alternative_titles,start_season,broadcast,status,num_episodes';
async function loadMal(token: string) {
  const anime = new Map<number, MalAnime>();
  let unavailable = false;
  const deadline = Date.now() + 15000;
  for (const status of ['watching', 'plan_to_watch']) {
    try {
      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({ status, fields: malFields, limit: '1000', offset: String(page * 1000), nsfw: 'true' });
        const response = await malFetch(`https://api.myanimelist.net/v2/users/@me/animelist?${params}`, {
          cache: 'no-store', next: undefined, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        }, Math.max(0, deadline - Date.now()));
        if (!response.ok) throw new Error('MAL unavailable');
        const result = await response.json() as { data?: { node: MalAnime }[]; paging?: { next?: string } };
        if (!Array.isArray(result.data)) throw new Error('Invalid anime list');
        for (const { node } of result.data) if (node && Number.isSafeInteger(node.id) && node.id > 0 && typeof node.title === 'string') anime.set(node.id, node);
        if (!result.paging?.next) break;
        if (page === 4) unavailable = true;
      }
    } catch { unavailable = true; }
  }
  return { anime: [...anime.values()], unavailable };
}
async function loadPersonalWeek(tokens: { trakt?: AuthToken | null; mal?: AuthToken | null }, week: ISOWeek): Promise<PersonalWeekData> {
  const [snapshot, trakt, mal] = await Promise.all([
    readWeeklyRatingsSnapshot(formatWeek(week)),
    tokens.trakt ? loadTrakt(tokens.trakt.accessToken, week) : Promise.resolve({ events: [], followed: 0, unavailable: false }),
    tokens.mal ? loadMal(tokens.mal.accessToken) : Promise.resolve({ anime: [], unavailable: false }),
  ]);
  const unavailable: PersonalWeekData['unavailable'] = [];
  if (trakt.unavailable) unavailable.push('trakt');
  if (mal.unavailable) unavailable.push('mal');
  const weeklyIds = Object.values(snapshot.titles).flatMap(rating => rating.anilistId ? [rating.anilistId] : []);
  const [weeklyMap, malMap] = await Promise.all([
    getAnimeMappings(weeklyIds), getAnimeMappings(mal.anime.map(anime => anime.id), true),
  ]);
  if (weeklyMap.unavailable || malMap.unavailable) unavailable.push('anilist');
  const mappings = new Map<number, AnimeMapping>();
  for (const mapping of [...weeklyMap.media, ...malMap.media]) mappings.set(mapping.id, mapping);
  const candidates = weekCandidates(snapshot, [...mappings.values()]);
  // MAL IDs can also identify followed anime outside the site's bounded weekly
  // selection; include them only when AniList confirms the ID mapping.
  for (const mapping of malMap.media) if (!candidates.some(candidate => candidate.id === mapping.id)) candidates.push({
    id: mapping.id, malId: mapping.idMal ?? undefined,
    names: Object.values(mapping.title).filter((name): name is string => Boolean(name)), tmdbKeys: [],
  });
  const selected = mal.anime.flatMap(anime => { const match = matchMal(anime, candidates); return match ? [match.id] : []; });
  const airings = await getWeekAirings(selected, week, 15000, true, true);
  if (airings.unavailable) unavailable.push('anilist');
  const events = new Map(snapshot.events.map(event => [event.id, event]));
  for (const event of airings.events) events.set(event.id, event);
  return { ...buildPersonalReleases(trakt.events, mal.anime, candidates, [...events.values()], week),
    followed: trakt.followed + mal.anime.length, unavailable: [...new Set(unavailable)] };
}
export async function getPersonalWeek(tokens: { trakt?: AuthToken | null; mal?: AuthToken | null }, week: ISOWeek): Promise<PersonalWeekData> {
  // Tokens live only in the closure: cache keys/arguments contain hashes, never
  // credentials. Upstream authenticated responses always use no-store.
  const key = ['my-anime-week-v1', formatWeek(week),
    tokens.trakt ? tokenHash(tokens.trakt.accessToken) : '-', tokens.mal ? tokenHash(tokens.mal.accessToken) : '-'];
  try { return await unstable_cache(() => loadPersonalWeek(tokens, week), key, { revalidate: 600 })(); }
  catch { return { releases: [], followed: 0, unmatched: 0, unavailable: [
    ...(tokens.trakt ? ['trakt' as const] : []), ...(tokens.mal ? ['mal' as const] : []),
  ] }; }
}
