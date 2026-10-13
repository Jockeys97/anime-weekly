import type { Ratings } from '@/lib/ratings';
import type { AnimeAvailability } from '@/lib/tmdb';
export interface CatalogCardSummary {
  ratings: Ratings;
  availability: Omit<AnimeAvailability, 'ratings'>;
}
