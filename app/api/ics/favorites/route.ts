import { calendarResponse, type CalendarEpisode } from '@/lib/ics';
import { favoriteIds } from '@/lib/favorites';
import { favoriteName, resolveFavoriteAnime } from '@/lib/favorites-server';
import { getUpcomingAirings } from '@/lib/upcoming-airings';

const MAX_SCHEDULES = 40;
// Subscribable calendar of the visitor's favourites: the list travels in the
// URL (no account); each airing or announced season contributes its upcoming
// episodes. Calendar apps poll it, so everything below is cached.
export async function GET(request: Request) {
  const ids = favoriteIds(new URL(request.url).searchParams.get('ids')).filter(id => id.startsWith('anilist:')).map(id => Number(id.slice(8)));
  if (!ids.length) return new Response('No favourites', { status: 400 });
  try {
    const { entries } = await resolveFavoriteAnime(ids);
    const targets = [...new Map(entries.map(({ media, sequel }) => {
      const target = sequel ?? media;
      return [target.id, { id: target.id, name: favoriteName(target), status: target.status }] as const;
    })).values()].filter(target => ['RELEASING', 'NOT_YET_RELEASED', 'HIATUS'].includes(target.status || '')).slice(0, MAX_SCHEDULES);
    const episodes: CalendarEpisode[] = [];
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
      while (cursor < targets.length) {
        const target = targets[cursor++];
        const upcoming = await getUpcomingAirings(target.id).catch(() => null);
        for (const event of upcoming ?? []) if (event.airingAt > Date.now() / 1000) episodes.push({ ...event, title: target.name });
      }
    }));
    return calendarResponse(episodes, 'weekly-anime-preferiti.ics', 'Weekly Anime · I miei preferiti');
  } catch { return new Response('Favourites calendar unavailable', { status: 502 }); }
}
