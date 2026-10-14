import type { AnimeTitle } from '@/lib/tmdb';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';
export interface PlatformMetadata {
  providers: AnimeTitle['providers'];
  providersUnavailable: boolean;
  match?: CatalogCardSummary['availability']['match'];
}
export interface PlatformSnapshot { titles: Record<string, PlatformMetadata>; unavailable: boolean }
export function mergePlatformSnapshot(previous: PlatformSnapshot | null, next: PlatformSnapshot): PlatformSnapshot {
  const titles = { ...previous?.titles };
  for (const [key, value] of Object.entries(next.titles)) {
    if (!value.providersUnavailable || !titles[key]) titles[key] = value;
  }
  return { titles, unavailable: next.unavailable };
}
