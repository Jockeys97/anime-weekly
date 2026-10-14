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
