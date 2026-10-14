import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { parseWeek, weekRange } from '@/lib/week';
import { calendarResponse } from '@/lib/ics';
export const revalidate = 900;
export async function GET(_request: Request, { params }: { params: Promise<{ week: string }> }) {
  const { week: slug } = await params; const week = parseWeek(slug);
  if (!week) return new Response('Invalid week', { status: 400 });
  const snapshot = await getWeeklyRatings(slug);
  const names = new Map(Object.entries(snapshot.titles).flatMap(([key, rating]) => rating.anilistId && snapshot.names?.[key] ? [[rating.anilistId, snapshot.names[key]] as const] : []));
  const from = weekRange(week).monday.getTime() / 1000;
  return calendarResponse(snapshot.events.filter(event => event.airingAt >= from && event.airingAt < from + 7 * 86400).map(event => ({
    uid: `anilist-${event.mediaId}-episode-${event.episode}@anime-weekly`, title: names.get(event.mediaId) ?? `Anime #${event.mediaId}`, episode: event.episode, airingAt: event.airingAt,
  })), `anime-weekly-${slug}.ics`);
}
