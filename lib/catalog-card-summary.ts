import type { Ratings } from '@/lib/ratings';
import type { DetailAvailability } from '@/lib/detail-availability';
export interface CatalogCardSummary {
  ratings: Ratings;
  availability: Omit<DetailAvailability, 'ratings'>;
}
