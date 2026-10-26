import 'server-only';
import { animeName, getSeason, type AniListAnime } from '@/lib/anilist';
import { readAniListSnapshotSeason } from '@/lib/anilist-snapshot';
import { readSharedSimilarCatalog } from '@/lib/similar-catalog-client';
import { withTimeout } from '@/lib/async-timeout';
import type { AnimeSeason } from '@/lib/season';
import type { TierItem } from '@/lib/tier-list';

const MAX_PAGES = 4;
const TOTAL_WAIT_MS = 8000;
const CATALOG_WAIT_MS = 1500;
const formats = new Set(['TV', 'TV_SHORT', 'MOVIE', 'ONA', 'OVA']);
function seasonItems(media: AniListAnime[], season: AnimeSeason): TierItem[] {
  const unique = new Map<number, AniListAnime>();
  for (const anime of media) {
    if (anime.isAdult || anime.seasonYear !== season.year || anime.season?.toLowerCase() !== season.season || !formats.has(anime.format || '')) continue;
    if (!unique.has(anime.id)) unique.set(anime.id, anime);
  }
  return [...unique.values()].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.id - b.id).slice(0, 200)
    .map(anime => ({ id: anime.id, name: animeName(anime), poster: anime.coverImage?.large || anime.coverImage?.extraLarge || null,
      exportPoster: anime.coverImage?.extraLarge || anime.coverImage?.large || null }));
}

export async function getTierListData(season: AnimeSeason): Promise<{ items: TierItem[]; unavailable: boolean }> {
  const deadline = Date.now() + TOTAL_WAIT_MS;
  const saved = await withTimeout(readAniListSnapshotSeason(season.year, season.season), 3000).catch(() => null);
  if (saved) return { items: seasonItems(saved.media, season), unavailable: false };
  // Read the daily cron's existing catalog. A miss never starts its crawler.
  try {
    const items = seasonItems(await withTimeout(readSharedSimilarCatalog('seasonal'), CATALOG_WAIT_MS), season);
    if (items.length) return { items, unavailable: false };
  } catch { /* Historical seasons or a cold catalog use the cached AniList query. */ }
  const media: AniListAnime[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Tier catalog deadline');
      const result = await withTimeout(getSeason(season.year, season.season, page, { maxWaitMs: remaining }), remaining);
      if (result.unavailable) throw new Error('Tier catalog unavailable');
      media.push(...result.media);
      if (!result.pageInfo.hasNextPage || !result.media.length) break;
    }
    return { items: seasonItems(media, season), unavailable: false };
  } catch {
    // Do not mount an incomplete board: saving it could drop placements whose
    // IDs are on pages that did not load. The browser's saved board stays intact.
    return { items: [], unavailable: true };
  }
}
