export interface Ratings { imdbSeriesTitle?: string; imdbId?: string; anilistId?: number; malId?: number; imdbRating?: string; imdbVotes?: string; malScore?: number | null; malMembers?: number | null; anilistScore?: number | null }
export function formatMembers(value: number | null | undefined): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return 'n/a';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export function formatAnimeScore(ratings: Ratings): string {
  const score = ratings.malScore;
  if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10) {
    const members = formatMembers(ratings.malMembers);
    return `MAL ${score.toFixed(2)}${members === 'n/a' ? '' : ` · ${members} members`}`;
  }
  const average = ratings.anilistScore;
  return typeof average === 'number' && Number.isFinite(average) && average >= 0 && average <= 100 ? `AniList ${average}%` : 'n/a';
}
export function formatRating(value: string | number | null | undefined, maximum = 10): string {
  if (value == null || String(value).trim() === '') return 'n/a';
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= maximum ? String(numeric) : 'n/a';
}
export function formatVotes(value: string | null | undefined): string {
  if (!value || !/^\d+(,\d{3})*$/.test(value)) return 'n/a';
  const numeric = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(numeric) ? new Intl.NumberFormat('en').format(numeric) : 'n/a';
}

export function ratingSourceLink(source: 'imdb' | 'anilist' | 'myanimelist', ratings: Ratings): string | undefined {
  if (source === 'imdb') return ratings.imdbId && /^tt\d+$/.test(ratings.imdbId) ? `https://www.imdb.com/title/${ratings.imdbId}/` : undefined;
  const id = source === 'anilist' ? ratings.anilistId : ratings.malId;
  if (!Number.isSafeInteger(id) || id! <= 0) return undefined;
  return source === 'anilist' ? `https://anilist.co/anime/${id}/` : `https://myanimelist.net/anime/${id}`;
}
