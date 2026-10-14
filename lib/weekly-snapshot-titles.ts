import type { WeeklyRatings } from '@/lib/weekly-ratings';
import { topFive } from '@/lib/top-five';
export function snapshotTopFive(snapshot: WeeklyRatings) {
  return topFive(Object.entries(snapshot.titles).flatMap(([key, ratings]) => {
    const name = snapshot.names?.[key];
    return name ? [{ key, name, ratings }] : [];
  }));
}
