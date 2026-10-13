import type { AnimeTitle } from '@/lib/tmdb';
import type { AiringEvent } from '@/lib/airing-schedule';
import { weekRange, type ISOWeek } from '@/lib/week';
export interface CalendarRelease { anime: AnimeTitle; date: string; airingAt?: number; episode?: number }
export interface CalendarDay { date: string; releases: CalendarRelease[] }
export function buildWeeklyCalendar(titles: AnimeTitle[], events: AiringEvent[], week: ISOWeek) {
  const { monday } = weekRange(week);
  const start = monday.getTime(), until = start + 7 * 86400000;
  const days: CalendarDay[] = Array.from({ length: 7 }, (_, index) => ({ date: new Date(start + index * 86400000).toISOString().slice(0, 10), releases: [] }));
  const undated: AnimeTitle[] = [];
  for (const anime of titles) {
    if (anime.kind === 'movie') {
      const date = anime.releaseDate;
      const day = days.find(day => day.date === date);
      if (day) day.releases.push({ anime, date: day.date }); else undated.push(anime);
      continue;
    }
    if (!Number.isSafeInteger(anime.ratings.anilistId) || anime.ratings.anilistId! <= 0) { undated.push(anime); continue; }
    const seen = new Set<string>();
    let found = false;
    for (const event of events) {
      const ms = event.airingAt * 1000;
      if (event.mediaId !== anime.ratings.anilistId || !Number.isSafeInteger(event.airingAt) || ms < start || ms >= until
        || !Number.isSafeInteger(event.episode) || event.episode <= 0) continue;
      const key = `${event.episode}:${event.airingAt}`;
      if (seen.has(key)) continue;
      seen.add(key); found = true;
      const day = days[Math.floor((ms - start) / 86400000)];
      day.releases.push({ anime, date: day.date, airingAt: event.airingAt, episode: event.episode });
    }
    if (!found) undated.push(anime);
  }
  for (const day of days) day.releases.sort((a, b) => (a.airingAt ?? Infinity) - (b.airingAt ?? Infinity) || a.anime.name.localeCompare(b.anime.name, 'en'));
  return { days, undated };
}
