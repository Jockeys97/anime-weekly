import 'server-only';
import { CACHE_SECONDS, CACHE_TAG, MAX_TITLES_PER_WEEK, STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import type { Ratings } from '@/lib/ratings';
import { getAnimeRatings } from '@/lib/anime-ratings';
import { chooseTMDBMatch, type TMDBCandidate } from '@/lib/anime-match';
import { weekRange, type ISOWeek } from '@/lib/week';

type Kind = 'tv' | 'movie';
interface RawTitle { id: number; name?: string; title?: string; original_name?: string; original_title?: string; first_air_date?: string; release_date?: string; overview?: string; poster_path?: string | null }
interface Page { results: RawTitle[]; total_pages: number }
export interface Provider { provider_id: number; provider_name: string; logo_path: string | null }
interface WatchRegion { link?: string; flatrate?: Provider[]; free?: Provider[]; ads?: Provider[] }
export interface AnimeTitle { id: number; kind: Kind; name: string; overview: string; poster: string | null; releaseDate?: string | null; ratings: Ratings; recommendation: string | null; providers: Partial<Record<StreamingRegion, { link: string; providers: Provider[] }>>; providersUnavailable: boolean }
export type WeekData = { status: 'unconfigured' | 'error' | 'ready'; titles: AnimeTitle[]; partial?: boolean };
export function isTMDBConfigured() { return Boolean(process.env.TMDB_READ_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim()); }
export function isOMDBConfigured() { return Boolean(process.env.OMDB_API_KEY?.trim()); }
async function tmdb<T>(path: string, query: Record<string, string> = {}, revalidate = CACHE_SECONDS): Promise<T> {
  if (!isTMDBConfigured()) throw new Error('TMDB not configured');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  Object.entries({ language: 'en-US', ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!token) url.searchParams.set('api_key', process.env.TMDB_API_KEY!.trim());
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'force-cache', next: { revalidate, tags: [CACHE_TAG] }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('TMDB request failed');
  return response.json() as Promise<T>;
}
async function discover(kind: Kind, week: ISOWeek): Promise<RawTitle[]> {
  const { start, end } = weekRange(week);
  const dateField = kind === 'tv' ? 'air_date' : 'primary_release_date';
  const query = { with_genres: '16', with_origin_country: 'JP', include_adult: 'false', [`${dateField}.gte`]: start, [`${dateField}.lte`]: end, sort_by: 'popularity.desc' };
  const first = await tmdb<Page>(`discover/${kind}`, query);
  // Only two pages per category; final enrichment is capped across both categories.
  if (first.total_pages < 2) return first.results;
  try { const second = await tmdb<Page>(`discover/${kind}`, { ...query, page: '2' }); return [...first.results, ...second.results]; } catch { return first.results; }
}
async function getRatings(kind: Kind, id: number, revalidate = CACHE_SECONDS): Promise<Ratings> {
  let ratings: Ratings = {};
  try {
    const external = await tmdb<{ imdb_id?: string | null }>(`${kind}/${id}/external_ids`, {}, revalidate);
    if (!external.imdb_id || !/^tt\d+$/.test(external.imdb_id)) return ratings;
    ratings = { imdbId: external.imdb_id };
    if (!isOMDBConfigured()) return ratings;
    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('i', external.imdb_id); url.searchParams.set('apikey', process.env.OMDB_API_KEY!.trim());
    const response = await fetch(url, { cache: 'force-cache', next: { revalidate, tags: [CACHE_TAG] }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return ratings;
    const data = await response.json() as Ratings & { Response?: string };
    return data.Response === 'True' ? { ...ratings, imdbRating: data.imdbRating, imdbVotes: data.imdbVotes } : ratings;
  } catch { return ratings; }
}
async function recommendation(kind: Kind, id: number): Promise<string | null> {
  for (const endpoint of ['recommendations', 'similar']) {
    try {
      const page = await tmdb<Page>(`${kind}/${id}/${endpoint}`);
      const match = page.results.find(item => item.id !== id && (item.name || item.title)?.trim());
      if (match) return (match.name || match.title)!.trim();
    } catch { /* The optional recommendation is hidden if neither source works. */ }
  }
  return null;
}
async function enrich(raw: RawTitle, kind: Kind): Promise<AnimeTitle> {
  const date = kind === 'tv' ? raw.first_air_date : raw.release_date;
  const year = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : undefined;
  const [imdb, animeRatings, related, watch] = await Promise.all([getRatings(kind, raw.id), getAnimeRatings({ kind, originalTitle: kind === 'tv' ? raw.original_name : raw.original_title, title: (raw.name || raw.title)!, year }), recommendation(kind, raw.id), tmdb<{ results: Partial<Record<StreamingRegion, WatchRegion>> }>(`${kind}/${raw.id}/watch/providers`).catch(() => null)]);
  const ratings = { ...imdb, ...animeRatings };
  const providers = watchProviders(watch);
  return { id: raw.id, kind, name: (raw.name || raw.title)!, overview: raw.overview || '', poster: raw.poster_path || null, releaseDate: kind === 'movie' ? raw.release_date || null : null, ratings, recommendation: related, providers, providersUnavailable: watch === null };
}
function watchProviders(watch: { results: Partial<Record<StreamingRegion, WatchRegion>> } | null): AnimeTitle['providers'] {
  const providers: AnimeTitle['providers'] = {};
  for (const region of STREAMING_REGIONS) {
    const entry = watch?.results[region];
    if (!entry?.link?.startsWith('https://www.themoviedb.org/')) continue;
    const unique = new Map<number, Provider>();
    for (const provider of [...(entry.flatrate || []), ...(entry.free || []), ...(entry.ads || [])]) unique.set(provider.provider_id, provider);
    if (unique.size) providers[region] = { link: entry.link, providers: [...unique.values()] };
  }
  return providers;
}

export interface AnimeAvailability {
  match: { id: number; kind: Kind } | null;
  ratings: Ratings;
  providers: AnimeTitle['providers'];
  providersUnavailable: boolean;
}

export async function getAnimeAvailability(titles: string[], year?: number): Promise<AnimeAvailability> {
  const empty: AnimeAvailability = { match: null, ratings: {}, providers: {}, providersUnavailable: false };
  if (!isTMDBConfigured()) return empty;
  const aliases = [...new Set(titles.map(title => title.trim()).filter(Boolean))];
  const revalidate = 86400;
  for (const kind of ['tv', 'movie'] as const) {
    const candidates: TMDBCandidate[] = [];
    for (const title of aliases) {
      try {
        const query: Record<string, string> = { query: title, include_adult: 'false' };
        if (year != null) query[kind === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = String(year);
        const data = await tmdb<{ results: TMDBCandidate[] }>(`search/${kind}`, query, revalidate);
        if (Array.isArray(data.results)) candidates.push(...data.results);
      } catch { /* Continue with the other alias or media type. */ }
    }
    const match = chooseTMDBMatch(candidates, aliases, year);
    if (!match) continue;
    const [ratings, watch] = await Promise.all([
      getRatings(kind, match.id, revalidate),
      tmdb<{ results: Partial<Record<StreamingRegion, WatchRegion>> }>(`${kind}/${match.id}/watch/providers`, {}, revalidate).catch(() => null),
    ]);
    return { match: { id: match.id, kind }, ratings, providers: watchProviders(watch), providersUnavailable: watch === null };
  }
  return empty;
}
export async function getWeekData(week: ISOWeek): Promise<WeekData> {
  if (!isTMDBConfigured()) return { status: 'unconfigured', titles: [] };
  const [tv, movie] = await Promise.allSettled([discover('tv', week), discover('movie', week)]);
  if (tv.status === 'rejected' && movie.status === 'rejected') return { status: 'error', titles: [] };
  const shows = tv.status === 'fulfilled' ? tv.value : [];
  const movies = movie.status === 'fulfilled' ? movie.value : [];
  const selected: { raw: RawTitle; kind: Kind }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(shows.length, movies.length) && selected.length < MAX_TITLES_PER_WEEK; i++) {
    for (const [kind, raw] of [['tv', shows[i]], ['movie', movies[i]]] as const) {
      if (!raw || !(raw.name || raw.title)?.trim() || seen.has(`${kind}:${raw.id}`) || selected.length >= MAX_TITLES_PER_WEEK) continue;
      selected.push({ raw, kind }); seen.add(`${kind}:${raw.id}`);
    }
  }
  const titles: AnimeTitle[] = [];
  // Bound concurrent fan-out and OMDb calls (at most 40 per uncached week).
  for (let i = 0; i < selected.length; i += 5) titles.push(...await Promise.all(selected.slice(i, i + 5).map(({ raw, kind }) => enrich(raw, kind))));
  return { status: 'ready', titles, partial: tv.status === 'rejected' || movie.status === 'rejected' };
}
