import 'server-only';
import { getAnime, getSeason } from '@/lib/anilist';
import { findSnapshotAnime, readAniListSnapshotSeason } from '@/lib/anilist-snapshot';
import { withTimeout } from '@/lib/async-timeout';
import type { Season } from '@/lib/season';

// Lists and details use the same complete daily catalog. Opening a title that
// is already in it must not queue another live AniList lookup first.
export async function getAnimeWithSnapshot(id: number) {
  const saved = await withTimeout(findSnapshotAnime(id), 3000).catch(() => null);
  if (saved) {
    if (typeof saved.isAdult === 'boolean') return saved;
    // Older snapshots (still warm in cache) lack isAdult, which detail SEO
    // needs. Prefer live details; on failure keep the saved soft fallback.
    const live = await withTimeout(getAnime(id), 6000).catch(() => null);
    return live ?? saved;
  }
  // Historical titles still use live/cached details; a timeout is transient,
  // never a confirmed not-found and never cached as an empty detail page.
  return withTimeout(getAnime(id), 6000);
}

export async function getSeasonWithSnapshot(year: number, season: Season, page = 1) {
  // Serve the last complete season immediately, even if its daily refresh
  // failed. Reads never replace it with an empty or partial live response.
  const snapshot = await withTimeout(readAniListSnapshotSeason(year, season), 4000).catch(() => null);
  if (snapshot) {
    const media = snapshot.media.filter(anime => !anime.isAdult);
    const offset = (page - 1) * 50;
    return {
      media: media.slice(offset, offset + 50),
      pageInfo: { currentPage: page, hasNextPage: offset + 50 < media.length },
      stale: true,
    };
  }
  return withTimeout(getSeason(year, season, page, { maxWaitMs: 6000 }), 6000)
    .catch(() => ({ media: [], pageInfo: { currentPage: page, hasNextPage: false }, unavailable: true }));
}
