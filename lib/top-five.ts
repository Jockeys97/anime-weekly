import type { Ratings } from '@/lib/ratings';
export function cachedScore(ratings: Ratings): number | null {
  const valid = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
  if (valid(ratings.malScore, 10)) return ratings.malScore;
  if (valid(ratings.anilistScore, 100)) return ratings.anilistScore / 10;
  const imdb = ratings.imdbRating?.trim();
  return imdb && valid(Number(imdb), 10) ? Number(imdb) : null;
}
export function topFive<T extends { ratings: Ratings }>(titles: readonly T[]): (T & { score: number })[] {
  return titles.flatMap((title, index) => {
    const score = cachedScore(title.ratings);
    return score == null ? [] : [{ ...title, score, index }];
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5);
}
