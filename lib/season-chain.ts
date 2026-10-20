import 'server-only';
import { getFavoriteAnime, type FavoriteAnime, type FavoriteSequel } from '@/lib/anilist';
import { activeSequel, missingSequelIds, SEQUEL_HOPS } from '@/lib/favorites';

// Shared by the favourites and the weekly cron: AniList files each season
// separately, so a finished entry is followed through series sequels.
/** Saved AniList favourites with their airing (or announced) sequel, one batched request per hop. */
export async function resolveFavoriteAnime(ids: number[], fresh = false): Promise<{ entries: { media: FavoriteAnime; sequel: FavoriteSequel | null }[]; unavailable: boolean }> {
  if (!ids.length) return { entries: [], unavailable: false };
  const anime = await getFavoriteAnime(ids, 12000, fresh);
  const lookup = new Map<number, FavoriteAnime>(anime.media.map(media => [media.id, media]));
  let unavailable = anime.unavailable;
  for (let hop = 0; hop < SEQUEL_HOPS; hop++) {
    const missing = [...new Set(anime.media.flatMap(media => missingSequelIds(media, lookup)))].filter(id => !lookup.has(id));
    if (!missing.length) break;
    const more = await getFavoriteAnime(missing, 12000, fresh);
    for (const media of more.media) lookup.set(media.id, media);
    if (more.unavailable) { unavailable = true; break; }
  }
  return { entries: anime.media.map(media => ({ media, sequel: activeSequel(media, lookup) })), unavailable };
}
