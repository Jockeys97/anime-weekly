import { normalizeTitle } from '@/lib/anime-match';
import { calendarDate } from '@/lib/visitor-time';
import { formatWeek, isoWeek, weekRange, type ISOWeek } from '@/lib/week';
import type { AnimeMapping } from '@/lib/anilist';
import type { WeeklyRatings } from '@/lib/weekly-ratings';
import type { AiringEvent } from '@/lib/airing-schedule';

export interface MalAnime {
  id: number; title: string;
  alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
  start_season?: { year: number; season: string };
  broadcast?: { day_of_the_week?: string; start_time?: string };
  status?: string; num_episodes?: number;
}
export interface TraktShow { title: string; ids: { trakt: number; tmdb?: number | null } }
export interface TraktRelease {
  first_aired: string;
  episode: { season: number; number: number; ids?: { trakt?: number } };
  show: TraktShow;
}
export interface PersonalRelease {
  key: string; title: string; airingAt: number; episode: number; season?: number;
  anilistId?: number; sources: ('trakt' | 'mal')[];
}
export interface WeekCandidate { id: number; malId?: number; names: string[]; tmdbKeys: string[] }
export function romeWeek(now = new Date()) {
  const week = isoWeek(new Date(`${calendarDate(now.getTime(), 'Europe/Rome')}T12:00:00Z`));
  return { week, slug: formatWeek(week), ...weekRange(week) };
}
export function inRomeWeek(timestamp: number, week: ISOWeek): boolean {
  if (!Number.isFinite(timestamp) || Number.isNaN(new Date(timestamp).getTime())) return false;
  const date = calendarDate(timestamp, 'Europe/Rome'), { start, end } = weekRange(week);
  return date >= start && date <= end;
}
export function weekCandidates(snapshot: WeeklyRatings, mappings: AnimeMapping[]): WeekCandidate[] {
  const candidates = new Map<number, WeekCandidate>();
  for (const [key, rating] of Object.entries(snapshot.titles)) {
    if (!Number.isSafeInteger(rating.anilistId) || rating.anilistId! <= 0) continue;
    const id = rating.anilistId!, mapping = mappings.find(anime => anime.id === id);
    const candidate = candidates.get(id) ?? { id, malId: mapping?.idMal ?? rating.malId, names: [], tmdbKeys: [] };
    candidate.names.push(...[snapshot.names?.[key], ...Object.values(mapping?.title ?? {})].filter((name): name is string => Boolean(name?.trim())));
    candidate.tmdbKeys.push(key); candidates.set(id, candidate);
  }
  return [...candidates.values()];
}
function matchNames(names: string[], candidates: WeekCandidate[]): WeekCandidate | undefined {
  const aliases = new Set(names.map(normalizeTitle).filter(Boolean));
  const matches = candidates.filter(candidate => candidate.names.some(name => aliases.has(normalizeTitle(name))));
  return matches.length === 1 ? matches[0] : undefined;
}
export function matchMal(anime: MalAnime, candidates: WeekCandidate[]): WeekCandidate | undefined {
  const ids = candidates.filter(candidate => candidate.malId === anime.id);
  if (ids.length) return ids.length === 1 ? ids[0] : undefined;
  const match = matchNames([anime.title, anime.alternative_titles?.en ?? '', anime.alternative_titles?.ja ?? '', ...(anime.alternative_titles?.synonyms ?? [])], candidates);
  // An authoritative but different MAL ID must never be overridden by a name.
  return match && (match.malId == null || match.malId === anime.id) ? match : undefined;
}
export function matchTrakt(show: TraktShow, candidates: WeekCandidate[]): WeekCandidate | undefined {
  const matches = candidates.filter(candidate => show.ids.tmdb != null && candidate.tmdbKeys.includes(`tv:${show.ids.tmdb}`));
  return matches.length === 1 ? matches[0] : matchNames([show.title], candidates);
}
export function buildPersonalReleases(trakt: TraktRelease[], mal: MalAnime[], candidates: WeekCandidate[], events: AiringEvent[], week: ISOWeek) {
  const releases: PersonalRelease[] = [];
  for (const entry of trakt) {
    if (!entry) continue;
    const airingAt = Date.parse(entry.first_aired);
    if (!inRomeWeek(airingAt, week) || !entry.show?.title || !entry.show.ids || !Number.isSafeInteger(entry.episode?.number) || entry.episode.number <= 0
      || !Number.isSafeInteger(entry.episode.season) || entry.episode.season < 0) continue;
    const match = matchTrakt(entry.show, candidates);
    releases.push({ key: `trakt:${entry.show.ids.trakt}:${entry.episode.season}:${entry.episode.number}`, title: entry.show.title,
      airingAt, episode: entry.episode.number, season: entry.episode.season, anilistId: match?.id, sources: ['trakt'] });
  }
  const follows = new Map<number, MalAnime>();
  for (const anime of mal) { const match = matchMal(anime, candidates); if (match) follows.set(match.id, anime); }
  for (const event of events) {
    const anime = follows.get(event.mediaId), airingAt = event.airingAt * 1000;
    if (!anime || !inRomeWeek(airingAt, week) || !Number.isSafeInteger(event.episode) || event.episode <= 0) continue;
    releases.push({ key: `mal:${event.mediaId}:${event.episode}`, title: anime.title, airingAt, episode: event.episode,
      anilistId: event.mediaId, sources: ['mal'] });
  }
  const unique = new Map<string, PersonalRelease>();
  for (const release of releases) {
    // Absolute AniList episode numbers can differ from Trakt season numbers;
    // merge only on a confirmed ID, episode and Rome date.
    const key = release.anilistId ? `${release.anilistId}:${release.episode}:${calendarDate(release.airingAt)}` : release.key;
    const previous = unique.get(key);
    if (previous) previous.sources = [...new Set([...previous.sources, ...release.sources])];
    else unique.set(key, release);
  }
  return { releases: [...unique.values()].sort((a, b) => a.airingAt - b.airingAt || a.title.localeCompare(b.title)),
    unmatched: mal.filter(anime => !matchMal(anime, candidates)).length };
}
