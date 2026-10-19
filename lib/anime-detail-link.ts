import type { AnimeTitle } from '@/lib/tmdb';
import { animePath } from '@/lib/anime-url';
export function animeDetailLink(anime: Pick<AnimeTitle, 'name' | 'ratings'>): string {
  const id = anime.ratings.anilistId;
  return Number.isSafeInteger(id) && id! > 0 && id! <= 2147483647
    ? animePath(id!, anime.name) : `/search?${new URLSearchParams({ q: anime.name })}`;
}
