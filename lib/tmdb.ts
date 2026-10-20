import 'server-only';
import { unstable_cache } from 'next/cache';
import { tmdbLanguages, type Locale } from '@/lib/locales';
import { CACHE_SECONDS, CACHE_TAG, MAX_TITLES_PER_WEEK, STREAMING_REGIONS, type StreamingRegion } from '@/lib/config';
import { getImdbScore } from '@/lib/imdb';
import { cleanSynopsis, displayTitle } from '@/lib/title-text';
import type { Ratings } from '@/lib/ratings';
import { getAnimeRatings } from '@/lib/anime-ratings';
import { chooseTMDBMatch, tmdbSearchTitles, type TMDBCandidate } from '@/lib/anime-match';
import { weekRange, type ISOWeek } from '@/lib/week';
import { readEpisodeDates, selectEpisodeSeasons, type EpisodeDate, type EpisodeDetails } from '@/lib/episode-dates';

type Kind = 'tv' | 'movie';
const TMDB_GENRES: Record<number, string> = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10765: 'Sci-Fi & Fantasy', 10768: 'War & Politics' };
interface RawTitle { popularity?: number; genre_ids?: number[]; id: number; name?: string; title?: string; original_name?: string; original_title?: string; first_air_date?: string; release_date?: string; overview?: string; poster_path?: string | null }
interface Page { results: RawTitle[]; total_pages: number }
export interface Provider { logo_url?: string; watch_url?: string; provider_id: number; provider_name: string; logo_path: string | null }
interface WatchRegion { link?: string; flatrate?: Provider[]; free?: Provider[]; ads?: Provider[] }
export interface AnimeTitle { genres?: string[]; id: number; kind: Kind; name: string; overview: string; poster: string | null; releaseDate?: string | null; ratings: Ratings; recommendation: string | null; providers: Partial<Record<StreamingRegion, { link: string; providers: Provider[] }>>; providersUnavailable: boolean }
export type WeekData = { status: 'unconfigured' | 'error' | 'ready'; titles: AnimeTitle[]; partial?: boolean };
export function isTMDBConfigured() { return Boolean(process.env.TMDB_READ_TOKEN?.trim() || process.env.TMDB_API_KEY?.trim()); }
export function isOMDBConfigured() { return Boolean(process.env.OMDB_API_KEY?.trim()); }
// Public metadata used to identify personal Trakt shows, independently of the
// current weekly selection. A missing/failed response is never a negative match.
export async function getAnimeSeriesMetadata(id: number): Promise<{ title: string; originalTitle?: string; year: number; poster: string | null } | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const data = await tmdb<{ id: number; name: string; original_name?: string; first_air_date?: string; genres?: { id: number }[]; origin_country?: string[]; poster_path?: string | null }>(`tv/${id}`, {}, 604800);
  if (data.id !== id || !data.name || !data.first_air_date) throw new Error('Invalid series metadata');
  if (!data.genres?.some(genre => genre.id === 16) || !data.origin_country?.includes('JP')) return null;
  const year = Number(data.first_air_date.slice(0, 4));
  if (!Number.isInteger(year) || year < 1900) throw new Error('Missing series premiere');
  return { title: data.name, originalTitle: data.original_name, year,
    poster: data.poster_path && /^\/[a-zA-Z0-9_.-]+$/.test(data.poster_path) ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null };
}
async function tmdb<T>(path: string, query: Record<string, string> = {}, revalidate = CACHE_SECONDS, fresh = false): Promise<T> {
  if (!isTMDBConfigured()) throw new Error('TMDB not configured');
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  Object.entries({ language: 'en-US', ...query }).forEach(([key, value]) => url.searchParams.set(key, value));
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!token) url.searchParams.set('api_key', process.env.TMDB_API_KEY!.trim());
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: fresh ? 'no-store' : 'force-cache', next: fresh ? undefined : { revalidate, tags: [CACHE_TAG] }, signal: AbortSignal.timeout(12000) });
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

export async function getRatings(kind: Kind, id: number, revalidate = CACHE_SECONDS, fresh = false): Promise<Ratings> {
  if (!isTMDBConfigured()) return { imdbStatus: 'unconfigured' };
  try {
    const external = await tmdb<{ imdb_id?: string | null }>(`${kind}/${id}/external_ids`, {}, Math.min(revalidate, 3600), fresh);
    if (!external.imdb_id || !/^tt\d+$/.test(external.imdb_id)) return { imdbStatus: 'unmatched' };
    return await getImdbScore(external.imdb_id);
  } catch { return { imdbStatus: 'error' }; }
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
  return { id: raw.id, kind, name: displayTitle((raw.name || raw.title)!), overview: cleanSynopsis(raw.overview), poster: raw.poster_path || null, releaseDate: kind === 'movie' ? raw.release_date || null : null, ratings, recommendation: related, providers, providersUnavailable: watch === null };
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

export async function getAnimeAvailability(titles: string[], year?: number, kindHint?: Kind, fresh = false, providersOnly = false): Promise<AnimeAvailability> {
  const empty: AnimeAvailability = { match: null, ratings: {}, providers: {}, providersUnavailable: false };
  if (!isTMDBConfigured()) return { ...empty, ratings: { imdbStatus: 'unconfigured' } };
  const revalidate = 86400;
  let lookupFailed = false;
  for (const kind of kindHint ? [kindHint] : ['tv', 'movie'] as const) {
    const aliases = tmdbSearchTitles(titles, year, kind);
    const candidates: TMDBCandidate[] = [];
    const results = await Promise.all(aliases.map(async title => {
      try {
        const query: Record<string, string> = { query: title, include_adult: 'false' };
        // Validate the year on candidates, rather than filtering away titles
        // whose TMDB release year differs by one from the AniList premiere.
        const data = await tmdb<{ results: TMDBCandidate[] }>(`search/${kind}`, query, revalidate, fresh);
        return Array.isArray(data.results) ? data.results : [];
      } catch { lookupFailed = true; return []; }
    }));
    for (const result of results) candidates.push(...result);
    const match = chooseTMDBMatch(candidates, aliases, year, kind);
    if (!match) continue;
    const [ratings, watch] = await Promise.all([
      providersOnly ? Promise.resolve({} as Ratings) : getRatings(kind, match.id, revalidate, fresh),
      tmdb<{ results: Partial<Record<StreamingRegion, WatchRegion>> }>(`${kind}/${match.id}/watch/providers`, {}, revalidate).catch(() => null),
    ]);
    return { match: { id: match.id, kind }, ratings, providers: watchProviders(watch), providersUnavailable: watch === null };
  }
  return { ...empty, ratings: { imdbStatus: lookupFailed ? 'error' : 'unmatched' } };
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

async function quickWeekData(week: ISOWeek, locale: Locale): Promise<WeekData> {
  const selection = await selectWeekTitles(week, locale);
  return { status: selection.status, partial: selection.partial, titles: selection.selected.map(({ raw, kind }) => ({
    id: raw.id, kind, name: displayTitle((raw.name || raw.title)!), overview: cleanSynopsis(raw.overview).slice(0, 900), poster: raw.poster_path || null,
    releaseDate: kind === 'movie' ? raw.release_date || null : null,
    genres: (raw.genre_ids ?? []).map(id => TMDB_GENRES[id]).filter((value): value is string => Boolean(value)),
    ratings: {}, recommendation: null, providers: {}, providersUnavailable: false,
  })) };
}

const cachedQuickWeek = unstable_cache(async (week: ISOWeek, locale: Locale) => {
  const data = await quickWeekData(week, locale);
  if (data.status === 'error' || data.partial) throw new UncachedWeek(data);
  return data;
}, ['weekly-discovery-v4-clean-text'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
export async function getQuickWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  return cachedQuickWeek(week, locale).catch(recoverWeek);
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
      return { id: raw.id, kind, name: displayTitle((raw.name || raw.title)!), overview: cleanSynopsis(raw.overview), poster: raw.poster_path || null,
        releaseDate: kind === 'movie' ? raw.release_date || null : null, ratings, recommendation: null,
        providers: watchProviders(watch), providersUnavailable: watch === null };
    })));
  }
  return { status: selection.status, partial: selection.partial, titles };
}
class UncachedWeek extends Error {
  constructor(readonly data: WeekData) { super('Incomplete weekly sources'); }
}
const checkWeek = (data: WeekData): WeekData => {
  if (data.status === 'error' || data.partial || data.titles.some(title => title.providersUnavailable || title.ratings.imdbStatus === 'error' || title.ratings.imdbStatus === 'unconfigured')) throw new UncachedWeek(data);
  return data;
};
const recoverWeek = (error: unknown): WeekData => {
  if (error instanceof UncachedWeek) return error.data;
  throw error;
};
const cachedPrimaryWeek = unstable_cache(async (week: ISOWeek) => checkWeek(await getPrimaryWeekData(week)), ['weekly-primary-v2-validated-imdb'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
export async function getCachedPrimaryWeekData(week: ISOWeek, locale: Locale = 'en'): Promise<WeekData> {
  const [core, localized] = await Promise.all([cachedPrimaryWeek(week).catch(recoverWeek), locale === 'en' ? Promise.resolve(null) : selectWeekTitles(week, locale, false)]);
  if (!localized) return core;
  const overviews = new Map(localized.selected.map(({ kind, raw }) => [`${kind}:${raw.id}`, raw.overview]));
  return { ...core, titles: core.titles.map(anime => ({ ...anime, overview: overviews.get(`${anime.kind}:${anime.id}`) || anime.overview })) };
}

// Scores, source matches, recommendations and regional providers are shared
// across languages. Only the overview changes when the visitor switches locale.
const cachedWeekData = unstable_cache(async (week: ISOWeek, locale: Locale) => checkWeek(await getWeekData(week, locale)), ['weekly-v3-validated-imdb'], { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] });
const pendingCoreWeeks = new Map<string, Promise<WeekData>>();
const pendingWeeks = new Map<string, Promise<WeekData>>();
function sharedWeekData(week: ISOWeek): Promise<WeekData> {
  const key = `${week.year}-${week.week}`;
  const existing = pendingCoreWeeks.get(key);
  if (existing) return existing;
  const pending = cachedWeekData(week, 'en').catch(recoverWeek).finally(() => { pendingCoreWeeks.delete(key); });
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

// Resolve the exact episode identity; IMDb/TMDB season numbers are not interchangeable.
export async function getTMDBEpisodeIdentity(episode: EpisodeDate): Promise<{ imdbId: string; seriesImdbId: string } | null> {
  if (!Number.isSafeInteger(episode.seriesId) || episode.seriesId <= 0 || !Number.isSafeInteger(episode.season) || episode.season < 0 || !Number.isSafeInteger(episode.episode) || episode.episode <= 0) return null;
  const [detail, series] = await Promise.all([
    tmdb<{ imdb_id?: string | null }>(`tv/${episode.seriesId}/season/${episode.season}/episode/${episode.episode}/external_ids`, {}, 86400),
    tmdb<{ imdb_id?: string | null }>(`tv/${episode.seriesId}/external_ids`, {}, 86400),
  ]);
  return /^tt\d+$/.test(detail.imdb_id ?? '') && /^tt\d+$/.test(series.imdb_id ?? '')
    ? { imdbId: detail.imdb_id!, seriesImdbId: series.imdb_id! } : null;
}

export interface TMDBTextTranslation { iso_639_1: string; iso_3166_1?: string; name?: string; overview?: string }
export async function getTMDBTextTranslations(id: number, kind: Kind): Promise<TMDBTextTranslation[]> {
  try {
    const result = await tmdb<{ translations?: { iso_639_1: string; iso_3166_1?: string; data?: { name?: string; title?: string; overview?: string } }[] }>(`${kind}/${id}/translations`, {}, 86400);
    return (result.translations || []).map(entry => ({ iso_639_1: entry.iso_639_1, iso_3166_1: entry.iso_3166_1, name: entry.data?.name || entry.data?.title, overview: entry.data?.overview }));
  } catch { return []; }
}

export async function getWeeklySource(week: ISOWeek, kind: Kind, id: number): Promise<RawTitle | null> {
  const selection = await selectWeekTitles(week, 'en');
  if (selection.status === 'error' || selection.status === 'unconfigured') throw new Error('Weekly source unavailable');
  const raw = selection.selected.find(item => item.kind === kind && item.raw.id === id)?.raw;
  if (!raw && selection.partial) throw new Error('Weekly source incomplete');
  return raw ?? null;
}
export async function getWeeklyRatingSources(week: ISOWeek) {
  const selection = await selectWeekTitles(week, 'en');
  if (selection.status !== 'ready' || selection.partial) throw new Error('Weekly source unavailable');
  return selection.selected.map(({ raw, kind }) => {
    const date = kind === 'tv' ? raw.first_air_date : raw.release_date;
    return { id: raw.id, kind, title: (raw.name || raw.title)!, originalTitle: kind === 'tv' ? raw.original_name : raw.original_title,
      year: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(0, 4)) : undefined };
  });
}
export async function getWeeklyRelated(kind: Kind, id: number) { return recommendation(kind, id); }
export async function getWeeklyProviders(kind: Kind, id: number, fresh = false) {
  const watch = await tmdb<{ results: Partial<Record<StreamingRegion, WatchRegion>> }>(`${kind}/${id}/watch/providers`, {}, CACHE_SECONDS, fresh).catch(() => null);
  return { providers: watchProviders(watch), providersUnavailable: watch === null };
}

// Provider landings only discover titles: no per-title ratings or availability calls.
const cachedPlatformAnime = unstable_cache(async (providerId: number, region: string, locale: Locale): Promise<WeekData> => {
  const ranked: { anime: AnimeTitle; popularity: number }[] = [];
  for (const kind of ['tv', 'movie'] as const) {
    const pages = await Promise.all([1, 2].map(page => tmdb<Page>(`discover/${kind}`, {
      language: tmdbLanguages[locale], with_watch_providers: String(providerId), watch_region: region,
      with_genres: '16', with_origin_country: 'JP', include_adult: 'false', sort_by: 'popularity.desc', page: String(page),
    }, 86400)));
    const seen = new Set<number>();
    for (const raw of pages.flatMap(page => page.results)) {
      const name = (raw.name || raw.title)?.trim();
      if (!name || !Number.isSafeInteger(raw.id) || raw.id <= 0 || seen.has(raw.id)) continue;
      seen.add(raw.id);
      ranked.push({ popularity: raw.popularity ?? 0, anime: { id: raw.id, kind, name: displayTitle(name), overview: cleanSynopsis(raw.overview), poster: raw.poster_path || null,
        ratings: {}, recommendation: null, providers: {}, providersUnavailable: false } });
    }
  }
  return { status: 'ready', titles: ranked.sort((a, b) => b.popularity - a.popularity).map(entry => entry.anime) };
}, ['platform-anime-v1'], { revalidate: 86400, tags: [CACHE_TAG] });
export async function getPlatformAnime(providerId: number, region: string, locale: Locale = 'it'): Promise<WeekData> {
  if (!isTMDBConfigured()) return { status: 'unconfigured', titles: [] };
  try { return await cachedPlatformAnime(providerId, region, locale); }
  catch { return { status: 'error', titles: [] }; }
}

/** Name and poster for a saved TMDB-only title (no AniList match). */
export async function getTmdbTitleCard(kind: Kind, id: number): Promise<{ name: string; poster: string | null } | null> {
  if (!isTMDBConfigured() || !Number.isSafeInteger(id) || id <= 0) return null;
  try {
    const data = await tmdb<{ id: number; name?: string; title?: string; poster_path?: string | null }>(`${kind}/${id}`, {}, 604800);
    const name = (kind === 'tv' ? data.name : data.title)?.trim();
    if (data.id !== id || !name) return null;
    return { name: displayTitle(name), poster: data.poster_path && /^\/[A-Za-z0-9_.-]+$/.test(data.poster_path) ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null };
  } catch { return null; }
}
