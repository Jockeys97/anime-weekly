import 'server-only';
import { unstable_cache } from 'next/cache';
import { tmdbLanguages, type Locale } from '@/lib/locales';
import { CACHE_SECONDS, CACHE_TAG, MAX_TITLES_PER_WEEK, STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import type { Ratings } from '@/lib/ratings';
import { getAnimeRatings } from '@/lib/anime-ratings';
import { chooseTMDBMatch, type TMDBCandidate } from '@/lib/anime-match';
import { weekRange, type ISOWeek } from '@/lib/week';
import { readEpisodeDates, selectEpisodeSeasons, type EpisodeDate, type EpisodeDetails } from '@/lib/episode-dates';

type Kind = 'tv' | 'movie';
interface RawTitle { id: number; name?: string; title?: string; original_name?: string; original_title?: string; first_air_date?: string; release_date?: string; overview?: string; poster_path?: string | null }
interface Page { results: RawTitle[]; total_pages: number }
export interface Provider { watch_url?: string; provider_id: number; provider_name: string; logo_path: string | null }
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
async function discover(kind: Kind, week: ISOWeek, locale: Locale, englishNames = true): Promise<RawTitle[]> {
  const { start, end } = weekRange(week);
  const dateField = kind === 'tv' ? 'air_date' : 'primary_release_date';
  const query = { language: tmdbLanguages[locale], with_genres: '16', with_origin_country: 'JP', include_adult: 'false', [`${dateField}.gte`]: start, [`${dateField}.lte`]: end, sort_by: 'popularity.desc' };
  const readPage = async (page = 1): Promise<Page> => {
    const pageQuery = page === 1 ? query : { ...query, page: String(page) };
    const [localized, english] = await Promise.all([
      tmdb<Page>(`discover/${kind}`, pageQuery),
      locale === 'en' || !englishNames ? Promise.resolve(null) : tmdb<Page>(`discover/${kind}`, { ...pageQuery, language: 'en-US' }).catch(() => null),
    ]);
    const names = new Map((english?.results || []).map(item => [item.id, item.name || item.title]));
    return { ...localized, results: localized.results.map(item => {
      const name = names.get(item.id) || (locale === 'en' ? item.name || item.title : item.original_name || item.original_title);
      return name ? { ...item, ...(kind === 'tv' ? { name } : { title: name }) } : item;
    }) };
  };
  const first = await readPage();
  if (first.total_pages < 2) return first.results;
  try { const second = await readPage(2); return [...first.results, ...second.results]; } catch { return first.results; }
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

export async function getAnimeAvailability(titles: string[], year?: number, kindHint?: Kind): Promise<AnimeAvailability> {
  const empty: AnimeAvailability = { match: null, ratings: {}, providers: {}, providersUnavailable: false };
  if (!isTMDBConfigured()) return empty;
  const aliases = [...new Set(titles.map(title => title.trim()).filter(Boolean))];
  const revalidate = 86400;
  for (const kind of kindHint ? [kindHint] : ['tv', 'movie'] as const) {
    const candidates: TMDBCandidate[] = [];
    const results = await Promise.all(aliases.map(async title => {
      try {
        const query: Record<string, string> = { query: title, include_adult: 'false' };
        if (year != null) query[kind === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = String(year);
        const data = await tmdb<{ results: TMDBCandidate[] }>(`search/${kind}`, query, revalidate);
        return Array.isArray(data.results) ? data.results : [];
      } catch { return []; }
    }));
    for (const result of results) candidates.push(...result);
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
async function selectWeekTitles(week: ISOWeek, locale: Locale, englishNames = true) {
  if (!isTMDBConfigured()) return { status: 'unconfigured' as const, selected: [] };
  const [tv, movie] = await Promise.allSettled([discover('tv', week, locale, englishNames), discover('movie', week, locale, englishNames)]);
  if (tv.status === 'rejected' && movie.status === 'rejected') return { status: 'error' as const, selected: [] };
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
  return { status: 'ready' as const, selected, partial: tv.status === 'rejected' || movie.status === 'rejected' };
}

export async function getQuickWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  const selection = await selectWeekTitles(week, locale);
  return { status: selection.status, partial: selection.partial, titles: selection.selected.map(({ raw, kind }) => ({
    id: raw.id, kind, name: (raw.name || raw.title)!, overview: raw.overview || '', poster: raw.poster_path || null,
    releaseDate: kind === 'movie' ? raw.release_date || null : null,
    ratings: {}, recommendation: null, providers: {}, providersUnavailable: false,
  })) };
}

export async function getWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  const selection = await selectWeekTitles(week, locale);
  const titles: AnimeTitle[] = [];
  for (let i = 0; i < selection.selected.length; i += 5) titles.push(...await Promise.all(selection.selected.slice(i, i + 5).map(({ raw, kind }) => enrich(raw, kind))));
  return { status: selection.status, titles, partial: selection.partial };
}

async function getPrimaryWeekData(week: ISOWeek): Promise<WeekData> {
  const selection = await selectWeekTitles(week, 'en');
  const titles: AnimeTitle[] = [];
  for (let i = 0; i < selection.selected.length; i += 10) {
    titles.push(...await Promise.all(selection.selected.slice(i, i + 10).map(async ({ raw, kind }) => {
      const [ratings, watch] = await Promise.all([
        getRatings(kind, raw.id),
        tmdb<{ results: Partial<Record<StreamingRegion, WatchRegion>> }>(`${kind}/${raw.id}/watch/providers`).catch(() => null),
      ]);
      return { id: raw.id, kind, name: (raw.name || raw.title)!, overview: raw.overview || '', poster: raw.poster_path || null,
        releaseDate: kind === 'movie' ? raw.release_date || null : null, ratings, recommendation: null,
        providers: watchProviders(watch), providersUnavailable: watch === null };
    })));
  }
  return { status: selection.status, partial: selection.partial, titles };
}
const cachedPrimaryWeek = unstable_cache(getPrimaryWeekData, ['weekly-primary-v1'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
export async function getCachedPrimaryWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  const [core, localized] = await Promise.all([cachedPrimaryWeek(week), locale === 'en' ? Promise.resolve(null) : selectWeekTitles(week, locale, false)]);
  if (!localized) return core;
  const overviews = new Map(localized.selected.map(({ kind, raw }) => [`${kind}:${raw.id}`, raw.overview]));
  return { ...core, titles: core.titles.map(anime => ({ ...anime, overview: overviews.get(`${anime.kind}:${anime.id}`) || anime.overview })) };
}

// Scores, source matches, recommendations and regional providers are shared
// across languages. Only the overview changes when the visitor switches locale.
const cachedWeekData = unstable_cache(getWeekData, ['localized-week-v2-english-names'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
const pendingCoreWeeks = new Map<string, Promise<WeekData>>();
const pendingWeeks = new Map<string, Promise<WeekData>>();
function sharedWeekData(week: ISOWeek): Promise<WeekData> {
  const key = `${week.year}-${week.week}`;
  const existing = pendingCoreWeeks.get(key);
  if (existing) return existing;
  const pending = cachedWeekData(week, 'en').finally(() => { pendingCoreWeeks.delete(key); });
  pendingCoreWeeks.set(key, pending);
  return pending;
}
export function getCachedWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  if (locale === 'en') return sharedWeekData(week);
  const key = `${week.year}-${week.week}:${locale}`;
  const existing = pendingWeeks.get(key);
  if (existing) return existing;
  const pending = Promise.all([sharedWeekData(week), selectWeekTitles(week, locale, false)])
    .then(([core, localized]) => {
      const overviews = new Map(localized.selected.map(({ kind, raw }) => [`${kind}:${raw.id}`, raw.overview]));
      return { ...core, titles: core.titles.map(anime => ({ ...anime, overview: overviews.get(`${anime.kind}:${anime.id}`) || anime.overview })) };
    }).finally(() => { pendingWeeks.delete(key); });
  pendingWeeks.set(key, pending);
  return pending;
}

export async function getLocalizedSynopsis(titles: string[], year: number | undefined, locale: Locale, kind: Kind): Promise<string | null> {
  if (locale === 'en' || !isTMDBConfigured()) return null;
  const aliases = [...new Set(titles.map(title => title.trim()).filter(Boolean))].slice(0, 3);
  const candidates: TMDBCandidate[] = [];
  const results = await Promise.all(aliases.map(async title => {
    try {
      const query: Record<string, string> = { query: title, include_adult: 'false' };
      if (year != null) query[kind === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = String(year);
      const page = await tmdb<{ results: TMDBCandidate[] }>(`search/${kind}`, query, 86400);
      return Array.isArray(page.results) ? page.results : [];
    } catch { return []; }
  }));
  for (const result of results) candidates.push(...result);
  const match = chooseTMDBMatch(candidates, aliases, year);
  if (!match) return null;
  try {
    const result = await tmdb<{ translations?: { iso_639_1?: string; iso_3166_1?: string; data?: { overview?: string } }[] }>(`${kind}/${match.id}/translations`, {}, 86400);
    const country = tmdbLanguages[locale].split('-')[1];
    const translations = result.translations?.filter(item => item.iso_639_1 === locale && item.data?.overview?.trim()) || [];
    return (translations.find(item => item.iso_3166_1 === country) || translations[0])?.data?.overview?.trim() || null;
  } catch { return null; }
}

// Episode dates belong to the exact TMDB series ID, independently of score matching.
// Refresh hourly; a discovery result or a series premiere is never an episode date.
export async function getTMDBWeekEpisodes(id: number, week: ISOWeek): Promise<{ episodes: EpisodeDate[]; unavailable: boolean }> {
  if (!isTMDBConfigured() || !Number.isSafeInteger(id) || id <= 0) return { episodes: [], unavailable: true };
  const { start, end } = weekRange(week);
  try {
    const details = await tmdb<EpisodeDetails>(`tv/${id}`, {}, 3600);
    const episodes = readEpisodeDates(id, [details.last_episode_to_air, details.next_episode_to_air], start, end);
    const seasons = selectEpisodeSeasons(details.seasons, end);
    const results = await Promise.allSettled(seasons.map(season => tmdb<{ episodes?: unknown[] }>(`tv/${id}/season/${season}`, {}, 3600)));
    for (const result of results) if (result.status === 'fulfilled') episodes.push(...readEpisodeDates(id, result.value.episodes, start, end));
    const unique = new Map(episodes.map(episode => [`${episode.season}:${episode.episode}`, episode]));
    return { episodes: [...unique.values()], unavailable: results.some(result => result.status === 'rejected') };
  } catch { return { episodes: [], unavailable: true }; }
}

export interface TMDBTextTranslation { iso_639_1: string; iso_3166_1?: string; name?: string; overview?: string }
export async function getTMDBTextTranslations(id: number, kind: Kind): Promise<TMDBTextTranslation[]> {
  try {
    const result = await tmdb<{ translations?: { iso_639_1: string; iso_3166_1?: string; data?: { name?: string; title?: string; overview?: string } }[] }>(`${kind}/${id}/translations`, {}, 86400);
    return (result.translations || []).map(entry => ({ iso_639_1: entry.iso_639_1, iso_3166_1: entry.iso_3166_1, name: entry.data?.name || entry.data?.title, overview: entry.data?.overview }));
  } catch { return []; }
}
