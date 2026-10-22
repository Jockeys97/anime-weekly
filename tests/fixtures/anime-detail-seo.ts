import type { AniListAnime } from '../../lib/anilist';
import type { Locale } from '../../lib/locales';
import type { Ratings } from '../../lib/ratings';

// Illustrative fixtures only: these scores are not live IMDb facts.
export const animeSeoExamples: { anime: AniListAnime; names: Record<Locale, string>; ratings: Ratings }[] = [
  {
    anime: { id: 1, title: { english: "My Girlfriend's Friend", romaji: 'Kanojo no Tomodachi', native: '彼女の友達' }, format: 'TV', genres: [] } as unknown as AniListAnime,
    names: { it: "My Girlfriend's Friend", en: "My Girlfriend's Friend", es: "My Girlfriend's Friend", fr: "My Girlfriend's Friend", de: "My Girlfriend's Friend", pt: "My Girlfriend's Friend" },
    ratings: { imdbRating: '7.2' },
  },
  {
    anime: { id: 2, title: { english: 'Your Name', romaji: 'Kimi no Na wa.', native: '君の名は。' }, format: 'MOVIE', genres: [] } as unknown as AniListAnime,
    names: { it: 'Your Name', en: 'Your Name', es: 'Tu nombre', fr: 'Your Name', de: 'Your Name', pt: 'Seu Nome' },
    ratings: { imdbRating: '8.4' },
  },
  {
    anime: { id: 3, title: { english: 'Akira', romaji: 'AKIRA', native: 'アキラ' }, format: 'MOVIE', genres: [] } as unknown as AniListAnime,
    names: { it: 'Akira', en: 'Akira', es: 'Akira', fr: 'Akira', de: 'Akira', pt: 'Akira' },
    ratings: {},
  },
];
