import type { WeeklyRatings } from '@/lib/weekly-ratings';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';
import { expandAvailability } from '@/lib/provider-snapshot';

// Reuse cron data by confirmed AniList identity; no title search or vendor calls.
export function snapshotCatalog(snapshot: WeeklyRatings): Record<string, CatalogCardSummary> {
  const entries: Record<string, CatalogCardSummary> = {};
  for (const [key, ratings] of Object.entries(snapshot.titles)) {
    if (!ratings.anilistId) continue;
    const [kind, id] = key.split(':');
    if ((kind !== 'tv' && kind !== 'movie') || !/^[1-9]\d*$/.test(id)) continue;
    entries[ratings.anilistId] = { ratings, availability: {
      match: { id: Number(id), kind }, providers: expandAvailability(snapshot.availability, key), providersUnavailable: false,
    } };
  }
  return entries;
}
