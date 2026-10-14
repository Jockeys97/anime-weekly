import { parseWeek, weekRange } from '@/lib/week';

export interface WeeklyEpisode {
  imdbId: string;
  seriesId: number;
  seriesName: string;
  poster: string | null;
  title: string;
  season: number;
  episode: number;
  date: string;
  score: number;
  votes: number;
}
export interface WeeklyEpisodes {
  entries: WeeklyEpisode[];
  status: 'pending' | 'ready' | 'partial' | 'unavailable';
  updatedAt?: string;
}
export function japanDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function topWeeklyEpisodes(entries: readonly WeeklyEpisode[], slug: string, today = japanDate()): WeeklyEpisode[] {
  const week = parseWeek(slug);
  if (!week) return [];
  const { start, end } = weekRange(week);
  const unique = new Map<string, WeeklyEpisode>();
  for (const entry of entries) {
    if (!/^tt\d+$/.test(entry.imdbId) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || entry.date < start || entry.date > end || entry.date > today
      || !Number.isFinite(entry.score) || entry.score <= 0 || entry.score > 10 || !Number.isSafeInteger(entry.votes) || entry.votes <= 0
      || !Number.isSafeInteger(entry.season) || entry.season < 0 || !Number.isSafeInteger(entry.episode) || entry.episode <= 0) continue;
    const previous = unique.get(entry.imdbId);
    if (!previous || entry.votes >= previous.votes) unique.set(entry.imdbId, entry);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score || b.votes - a.votes || a.imdbId.localeCompare(b.imdbId)).slice(0, 5);
}
