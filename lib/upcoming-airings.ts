import 'server-only';
import { unstable_cache } from 'next/cache';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import type { CalendarEpisode } from '@/lib/ics';
import { displayTitle } from '@/lib/title-text';
const query = `query ($id: Int!, $page: Int!) {
  Media(id: $id, type: ANIME) {
    id title { english romaji }
    airingSchedule(page: $page, perPage: 50, notYetAired: true) {
      pageInfo { hasNextPage }
      nodes { episode airingAt }
    }
  }
}`;
export const getUpcomingAirings = unstable_cache(async (id: number): Promise<CalendarEpisode[] | null> => {
  const episodes: CalendarEpisode[] = [];
  for (let page = 1; page <= 20; page++) {
    const response = await anilistFetch('https://graphql.anilist.co', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { id, page } }), next: { revalidate: 21600 },
    });
    if (!response.ok) throw new Error('Airing schedule unavailable');
    const result = await response.json() as { errors?: unknown[]; data?: { Media?: { id: number; title: { english?: string; romaji?: string }; airingSchedule?: { pageInfo?: { hasNextPage?: boolean }; nodes?: { episode: number; airingAt: number }[] } } } };
    if (result.errors?.length) throw new Error('Airing schedule unavailable');
    const media = result.data?.Media;
    if (!media && page === 1) return null;
    if (media?.id !== id || !Array.isArray(media.airingSchedule?.nodes)) throw new Error('Invalid airing schedule');
    const title = displayTitle(media.title.english || media.title.romaji || `Anime #${id}`);
    for (const event of media.airingSchedule.nodes) {
      if (Number.isSafeInteger(event.episode) && event.episode > 0 && Number.isSafeInteger(event.airingAt)) episodes.push({
        uid: `anilist-${id}-episode-${event.episode}@anime-weekly`, title, ...event,
      });
    }
    if (!media.airingSchedule.pageInfo?.hasNextPage) return episodes;
  }
  throw new Error('Airing schedule pagination limit');
}, ['upcoming-airings-v1'], { revalidate: 21600 });
