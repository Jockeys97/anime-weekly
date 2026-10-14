import 'server-only';
import { japanDate } from '@/lib/weekly-episodes';
import { unstable_cache } from 'next/cache';

export interface ImdbEpisodeScore { title: string; season: number; episode: number; score: number; votes: number }
export class EpisodeLookupError extends Error {
  constructor(readonly reason: 'quota' | 'authentication' | 'network') { super(`Episode ratings unavailable: ${reason}`); }
}
interface OmdbEpisode { Response?: string; Error?: string; Type?: string; imdbID?: string; seriesID?: string; Title?: string; Season?: string; Episode?: string; imdbRating?: string; imdbVotes?: string }
export function readImdbEpisode(data: OmdbEpisode, id: string, seriesId: string): ImdbEpisodeScore | null {
  if (data.Response !== 'True' || data.Type !== 'episode' || data.imdbID !== id || data.seriesID !== seriesId) return null;
  const score = Number(data.imdbRating), votes = Number(data.imdbVotes?.replace(/,/g, ''));
  const season = Number(data.Season), episode = Number(data.Episode);
  if (!data.imdbRating?.trim() || !Number.isFinite(score) || score <= 0 || score > 10 || !Number.isSafeInteger(votes) || votes <= 0
    || !data.Season?.trim() || !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode <= 0) return null;
  return { title: data.Title === 'N/A' ? '' : data.Title?.trim() ?? '', season, episode, score, votes };
}
export type EpisodeAttempt = { state: 'rated'; rating: ImdbEpisodeScore } | { state: 'unrated'; cause: 'not-found' | 'invalid-episode' | 'missing-rating'; details?: { score?: string; votes?: string; season?: string; episode?: string; type?: string; parentMatches: boolean } } | { state: 'error'; reason: 'quota' | 'authentication' | 'network'; status?: number; message?: string };
// Persist the daily attempt, including outages and N/A. A second job cannot
// silently spend quota again after a failure; a new day has a new cache key.
async function fetchEpisodeAttempt (id: string, seriesId: string, day: string, coordinates?: { season: number; episode: number }): Promise<EpisodeAttempt> {
  if (!/^tt\d+$/.test(id) || !/^tt\d+$/.test(seriesId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { state: 'unrated', cause: 'invalid-episode' };
  const key = process.env.OMDB_API_KEY?.trim();
  if (!key) return { state: 'error', reason: 'authentication' };
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('i', coordinates ? seriesId : id); url.searchParams.set('type', 'episode'); url.searchParams.set('apikey', key);
  if (coordinates) { url.searchParams.set('Season', String(coordinates.season)); url.searchParams.set('Episode', String(coordinates.episode)); }
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); }
  catch { return { state: 'error', reason: 'network' }; }
  const data = await response.json().catch(() => ({})) as OmdbEpisode;
  if (/limit|quota/i.test(data.Error ?? '') || response.status === 429) return { state: 'error', reason: 'quota', status: response.status };
  if (/key|auth/i.test(data.Error ?? '') || response.status === 401) return { state: 'error', reason: 'authentication', status: response.status };
  if (!response.ok || (data.Response !== 'True' && !/not found|incorrect imdb id/i.test(data.Error ?? ''))) return { state: 'error', reason: 'network', status: response.status, message: process.env.VERCEL_ENV === 'preview' ? data.Error?.replaceAll(key, '[redacted]').slice(0, 160) : undefined };
  if (data.Response !== 'True') return { state: 'unrated', cause: 'not-found' };
  const details = { score: data.imdbRating, votes: data.imdbVotes, season: data.Season, episode: data.Episode, type: data.Type, parentMatches: data.seriesID === seriesId };
  if (data.Type !== 'episode' || data.imdbID !== id || data.seriesID !== seriesId) return { state: 'unrated', cause: 'invalid-episode', details };
  const rating = readImdbEpisode(data, id, seriesId);
  return rating ? { state: 'rated', rating } : { state: 'unrated', cause: 'missing-rating', details };
}
class ColdEpisodeAttempt extends Error {}
function attemptCache(populate: boolean) {
  const loader = async (id: string, seriesId: string, day: string, coordinates?: { season: number; episode: number }): Promise<EpisodeAttempt> => {
    if (!populate) throw new ColdEpisodeAttempt();
    return fetchEpisodeAttempt(id, seriesId, day, coordinates);
  };
  Object.defineProperty(loader, 'toString', { value: () => 'imdb-episode-daily-attempt-loader-v3' });
  return unstable_cache(loader, ['imdb-episode-daily-attempt-v3'], { revalidate: 172800, tags: ['imdb-episode-attempts'] });
}
export function inspectImdbEpisode(id: string, seriesId: string, day = japanDate(), coordinates?: { season: number; episode: number }): Promise<EpisodeAttempt> {
  return attemptCache(true)(id, seriesId, day, coordinates);
}
export async function readImdbEpisodeAttempt(id: string, seriesId: string, day = japanDate()): Promise<EpisodeAttempt | null> {
  try { return await attemptCache(false)(id, seriesId, day); }
  catch { return null; }
}
export async function primeImdbEpisode(id: string, seriesId: string, day = japanDate()): Promise<ImdbEpisodeScore | null> {
  const result = await inspectImdbEpisode(id, seriesId, day);
  if (result.state === 'error') throw new EpisodeLookupError(result.reason);
  return result.state === 'rated' ? result.rating : null;
}
