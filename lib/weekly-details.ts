import type { AnimeTitle } from '@/lib/tmdb';
import type { AiringEvent } from '@/lib/airing-schedule';
import type { EpisodeDate } from '@/lib/episode-dates';
export interface WeeklyTitleDetails {
  id: number;
  kind: 'tv' | 'movie';
  recommendation: string | null;
  providers: AnimeTitle['providers'];
  providersUnavailable: boolean;
}
export interface WeeklySchedule {
  events: AiringEvent[];
  episodeDates: EpisodeDate[];
  unavailable: boolean;
}
export interface WeeklyCalendarSchedule extends WeeklySchedule {
  anilistIds: Record<string, number>;
}

// A partial retry must not erase dates already confirmed by an earlier response.
export function mergeWeeklyCalendar(previous: WeeklyCalendarSchedule | null, next: WeeklyCalendarSchedule): WeeklyCalendarSchedule {
  const events = new Map((previous?.events ?? []).map(event => [event.id, event]));
  for (const event of next.events) events.set(event.id, event);
  const episodes = new Map((previous?.episodeDates ?? []).map(event => [`${event.seriesId}:${event.season}:${event.episode}`, event]));
  for (const event of next.episodeDates) episodes.set(`${event.seriesId}:${event.season}:${event.episode}`, event);
  return { ...next, events: [...events.values()], episodeDates: [...episodes.values()], anilistIds: { ...previous?.anilistIds, ...next.anilistIds } };
}
