import type { AnimeTitle } from '@/lib/tmdb';
export function animeDetailLink(anime: Pick<AnimeTitle, 'name' | 'ratings'>): string {
  const id = anime.ratings.anilistId;
  return Number.isSafeInteger(id) && id! > 0 && id! <= 2147483647
    ? `/anime/${id}` : `/search?${new URLSearchParams({ q: anime.name })}`;
}
