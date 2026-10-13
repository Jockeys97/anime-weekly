export type AnimeKind = 'tv' | 'movie';
export interface AnimeSearch {
  kind: AnimeKind;
  originalTitle?: string;
  title: string;
  year?: number;
}
export interface AnimeCandidate {
  id: number;
  type?: string | null;
  format?: string | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  synonyms?: (string | null)[] | null;
  startDate?: { year?: number | null } | null;
  idMal?: number | null;
  averageScore?: number | null;
}
export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
// Prefer the original title, then the closest year. Equally good distinct IDs
// are ambiguous, so leave the rating unavailable instead of guessing.
export function chooseAnimeMatch(candidates: AnimeCandidate[], search: AnimeSearch): AnimeCandidate | null {
  const titles = [search.originalTitle, search.title].filter((title): title is string => Boolean(title?.trim())).map(normalizeTitle).filter(Boolean);
  const formats = search.kind === 'movie' ? ['MOVIE'] : ['TV', 'TV_SHORT', 'ONA'];
  const ranked = new Map<number, { candidate: AnimeCandidate; rank: number }>();
  for (const candidate of candidates) {
    if (candidate.type !== 'ANIME' || !formats.includes(candidate.format || '')) continue;
    const aliases = [candidate.title?.romaji, candidate.title?.english, candidate.title?.native, ...(candidate.synonyms || [])].filter((title): title is string => typeof title === 'string').map(normalizeTitle);
    const titleIndex = titles.findIndex(title => aliases.includes(title));
    if (titleIndex < 0) continue;
    const year = candidate.startDate?.year;
    if (search.year != null && (year == null || Math.abs(year - search.year) > 1)) continue;
    const rank = titleIndex * 2 + (search.year == null ? 0 : Math.abs(year! - search.year));
    ranked.set(candidate.id, { candidate, rank });
  }
  const matches = [...ranked.values()].sort((a, b) => a.rank - b.rank);
  return matches.length && (matches.length === 1 || matches[0].rank < matches[1].rank) ? matches[0].candidate : null;
}

export interface TMDBCandidate {
  id: number;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  first_air_date?: string;
  release_date?: string;
  genre_ids?: number[];
  origin_country?: string[];
}

// Reverse lookup: require an exact normalized alias and a nearby release year.
// Refuse tied matches so unrelated adaptations do not inherit providers or scores.
export function chooseTMDBMatch(candidates: TMDBCandidate[], titles: string[], year?: number): TMDBCandidate | null {
  const aliases = titles.map(normalizeTitle).filter(Boolean);
  const ranked = new Map<number, { candidate: TMDBCandidate; distance: number }>();
  for (const candidate of candidates) {
    if (candidate.genre_ids?.length && !candidate.genre_ids.includes(16)) continue;
    if (candidate.origin_country?.length && !candidate.origin_country.includes('JP')) continue;
    const names = [candidate.name, candidate.title, candidate.original_name, candidate.original_title];
    if (!names.some(name => name && aliases.includes(normalizeTitle(name)))) continue;
    const date = candidate.first_air_date || candidate.release_date;
    const releaseYear = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : undefined;
    if (year != null && (releaseYear == null || Math.abs(releaseYear - year) > 1)) continue;
    ranked.set(candidate.id, { candidate, distance: year == null ? 0 : Math.abs(releaseYear! - year) });
  }
  const matches = [...ranked.values()].sort((a, b) => a.distance - b.distance);
  return matches.length && (matches.length === 1 || matches[0].distance < matches[1].distance) ? matches[0].candidate : null;
}
