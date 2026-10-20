import 'server-only';
import { animeName, getFavoriteAnime, type AniListAnime, type FavoriteAnime, type FavoriteSequel } from '@/lib/anilist';
import { activeSequel, missingSequelIds, SEQUEL_HOPS } from '@/lib/favorites';

/** Saved AniList favourites with their airing (or announced) sequel, one batched request per hop. */
export async function resolveFavoriteAnime(ids: number[]): Promise<{ entries: { media: FavoriteAnime; sequel: FavoriteSequel | null }[]; unavailable: boolean }> {
  if (!ids.length) return { entries: [], unavailable: false };
  const anime = await getFavoriteAnime(ids);
  const lookup = new Map<number, FavoriteAnime>(anime.media.map(media => [media.id, media]));
  let unavailable = anime.unavailable;
  for (let hop = 0; hop < SEQUEL_HOPS; hop++) {
    const missing = [...new Set(anime.media.flatMap(media => missingSequelIds(media, lookup)))].filter(id => !lookup.has(id));
    if (!missing.length) break;
    const more = await getFavoriteAnime(missing);
    for (const media of more.media) lookup.set(media.id, media);
    if (more.unavailable) { unavailable = true; break; }
  }
  return { entries: anime.media.map(media => ({ media, sequel: activeSequel(media, lookup) })), unavailable };
}
export const favoriteName = (anime: FavoriteAnime | FavoriteSequel) => animeName(anime as AniListAnime);
