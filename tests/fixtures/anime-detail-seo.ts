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

const detailBase: AniListAnime = {
  id: 0, idMal: null, title: { english: null, romaji: null, native: null },
  coverImage: null, bannerImage: null, description: null, startDate: null,
  episodes: null, format: 'TV', status: null, genres: [], averageScore: null,
  studios: null, season: null, seasonYear: null, relations: { edges: [] },
};
const prequel = (id: number): AniListAnime['relations'] => ({ edges: [{
  relationType: 'PREQUEL',
  node: { id, type: 'ANIME', format: 'TV', title: detailBase.title, startDate: null },
}] });

// Offline regression examples. Scores are supplied fixtures, not live lookups;
// One Piece deliberately has no IMDb score in this set.
export const animeSeoRegressionExamples: { anime: AniListAnime; name: string; ratings: Ratings }[] = [
  {
    anime: { ...detailBase, id: 21,
      title: { english: 'One Piece', romaji: 'ONE PIECE', native: 'ONE PIECE' },
      synonyms: ['OP', '海賊王', 'ワンピース', 'ワンピース別名'],
    },
    name: 'One Piece', ratings: {},
  },
  {
    anime: { ...detailBase, id: 185874,
      title: { english: 'BLEACH: Thousand-Year Blood War - The Calamity', romaji: 'BLEACH: Sennen Kessen-hen - Kashin-tan', native: 'BLEACH 千年血戦篇-禍進譚-' },
      relations: prequel(168500),
    },
    name: 'BLEACH: Thousand-Year Blood War - The Calamity', ratings: { imdbRating: '9.0' },
  },
  {
    anime: { ...detailBase, id: 195516,
      title: { english: 'The Apothecary Diaries Season 3', romaji: 'Kusuriya no Hitorigoto 3rd Season', native: '薬屋のひとりごと 第3期' },
      relations: prequel(176301),
    },
    name: 'The Apothecary Diaries Season 3', ratings: { imdbRating: '8.6' },
  },
  {
    anime: { ...detailBase, id: 1,
      title: { english: 'Cowboy Bebop', romaji: 'Cowboy Bebop', native: 'カウボーイビバップ' },
    },
    name: 'Cowboy Bebop', ratings: { imdbRating: '8.9' },
  },
];
