import 'server-only';
import { getAnime, getSeason } from '@/lib/anilist';
import { findSnapshotAnime, readAniListSnapshotSeason } from '@/lib/anilist-snapshot';
import type { Season } from '@/lib/season';

// Snapshot misses during an outage rethrow the original transient error,
// never turn into a cached 404. Live null remains a confirmed not-found.
export async function getAnimeWithSnapshot(id: number) {
  let anime;
  try { anime = await getAnime(id); }
  catch (error) {
    const saved = await findSnapshotAnime(id);
    if (saved) return saved;
    throw error;
  }
  return anime ?? findSnapshotAnime(id);
}

export async function getSeasonWithSnapshot(year: number, season: Season, page = 1) {
  const live = await getSeason(year, season, page);
  if (!live.unavailable) return live;
  const snapshot = await readAniListSnapshotSeason(year, season);
  if (!snapshot) return live;
  const offset = (page - 1) * 50;
  return {
    media: snapshot.media.slice(offset, offset + 50),
    pageInfo: { currentPage: page, hasNextPage: offset + 50 < snapshot.count },
    stale: true,
  };
}
