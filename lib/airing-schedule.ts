import 'server-only';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { CACHE_TAG } from '@/lib/config';
import { weekRange, type ISOWeek } from '@/lib/week';

export interface AiringEvent { id: number; mediaId: number; episode: number; airingAt: number }
export interface WeekAirings { events: AiringEvent[]; unavailable: boolean }
const query = `query ($ids: [Int], $from: Int!, $until: Int!, $page: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage }
    airingSchedules(mediaId_in: $ids, airingAt_greater: $from, airingAt_lesser: $until, sort: TIME) {
      id mediaId episode airingAt
    }
  }
}`;

export async function getWeekAirings(ids: number[], week: ISOWeek, maxWaitMs?: number, includeTimezoneEdges = false, fresh = false): Promise<WeekAirings> {
  const selected = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647))];
  if (!selected.length) return { events: [], unavailable: false };
  const monday = Math.floor(weekRange(week).monday.getTime() / 1000);
  const start = monday - (includeTimezoneEdges ? 86400 : 0);
  const until = monday + (includeTimezoneEdges ? 8 : 7) * 86400;
  if (start - 1 < -2147483648 || until > 2147483647) return { events: [], unavailable: true };
  const deadline = maxWaitMs == null ? undefined : Date.now() + maxWaitMs;
  const events: AiringEvent[] = [];
  const seen = new Set<number>();
  try {
    for (let page = 1; page <= 4; page++) {
      const response = await anilistFetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { ids: selected, from: start - 1, until, page } }),
        next: { revalidate: 21600, tags: [CACHE_TAG] },
        ...(fresh ? { cache: 'no-store' as const, next: undefined } : {}),
      }, deadline == null ? undefined : Math.max(0, deadline - Date.now()));
      if (!response.ok) return { events, unavailable: true };
      const result = await response.json() as { data?: { Page?: { pageInfo?: { hasNextPage?: boolean }; airingSchedules?: AiringEvent[] } }; errors?: unknown[] };
      const data = result.data?.Page;
      if (result.errors?.length || !Array.isArray(data?.airingSchedules)) return { events, unavailable: true };
      for (const event of data.airingSchedules) {
        if (!event || !Number.isSafeInteger(event.id) || event.id <= 0 || !selected.includes(event.mediaId)
          || !Number.isSafeInteger(event.episode) || event.episode <= 0 || !Number.isSafeInteger(event.airingAt)
          || event.airingAt < start || event.airingAt >= until || seen.has(event.id)) continue;
        seen.add(event.id); events.push(event);
      }
      if (!data.pageInfo?.hasNextPage) return { events, unavailable: false };
    }
    return { events, unavailable: true };
  } catch { return { events, unavailable: true }; }
}
