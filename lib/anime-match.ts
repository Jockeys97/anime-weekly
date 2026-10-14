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
  return title.replaceAll('½', '1/2').normalize('NFKC').normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu, '$1').normalize('NFC')
    .replaceAll('×', 'x').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function canonicalTitle(title: string): string {
  return title.replaceAll('½', '1/2').normalize('NFKC').replaceAll('⁄', '/')
    .replace(/(\d+)(?:st|nd|rd|th)\s+season/giu, 'Season $1');
}
function seasonNumber(title: string): string | undefined {
  return canonicalTitle(title).match(/(?:season|part|cour)\s*(\d+)\s*$/iu)?.[1];
}
function baseTitle(title: string): string {
  return canonicalTitle(title).replace(/\s*(?:[-:–]\s*)?(?:season|part|cour)\s*\d+\s*$/iu, '').split(/[:：]/u)[0].trim();
}
export function animeSearchTitles(search: AnimeSearch): string[] {
  const full = [search.originalTitle, search.title].filter((title): title is string => Boolean(title?.trim())).map(title => canonicalTitle(title).trim());
  return [...new Set([...full, ...full.map(baseTitle)])].filter(Boolean).slice(0, 4);
}
function aliasDistance(input: string, alias: string, yearKnown: boolean): number | null {
  if (normalizeTitle(canonicalTitle(input)) === normalizeTitle(canonicalTitle(alias))) return 0;
  // Relax only named subtitles and explicit season suffixes, never substrings.
  // A bare series title must not inherit a later season's scores.
  const inputSeason = seasonNumber(input), aliasSeason = seasonNumber(alias);
  if (aliasSeason && aliasSeason !== inputSeason && aliasSeason !== '1') return null;
  if (inputSeason && aliasSeason && inputSeason !== aliasSeason) return null;
  if (/[:：]/u.test(input) && /[:：]/u.test(alias) && !inputSeason && !aliasSeason) return null;
  if (!yearKnown || !normalizeTitle(baseTitle(input)) || normalizeTitle(baseTitle(input)) !== normalizeTitle(baseTitle(alias))) return null;
  return 1;
}
// Prefer exact native/original aliases, then exact display aliases, then a
// unique base-title match in the same premiere year (with ±1 tolerance).
export function chooseAnimeMatch(candidates: AnimeCandidate[], search: AnimeSearch): AnimeCandidate | null {
  const titles = [search.originalTitle, search.title].filter((title): title is string => Boolean(title?.trim()));
  const formats = search.kind === 'movie' ? ['MOVIE'] : ['TV', 'TV_SHORT', 'ONA'];
  const ranked = new Map<number, { candidate: AnimeCandidate; rank: number }>();
  for (const candidate of candidates) {
    if (!Number.isSafeInteger(candidate.id) || candidate.id <= 0 || candidate.type !== 'ANIME' || !formats.includes(candidate.format || '')) continue;
    const year = candidate.startDate?.year;
    if (search.year != null && (year == null || Math.abs(year - search.year) > 1)) continue;
    const aliases = [candidate.title?.romaji, candidate.title?.english, candidate.title?.native, ...(candidate.synonyms || [])].filter((title): title is string => typeof title === 'string' && Boolean(normalizeTitle(title)));
    const scores = titles.flatMap((title, index) => aliases.map(alias => {
      const distance = aliasDistance(title, alias, search.year != null);
      return distance == null ? Infinity : distance * 10 + index * 2 + (search.year == null ? 0 : Math.abs(year! - search.year));
    }));
    const rank = Math.min(...scores);
    if (!Number.isFinite(rank)) continue;
    const previous = ranked.get(candidate.id);
    if (!previous || rank < previous.rank) ranked.set(candidate.id, { candidate, rank });
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
