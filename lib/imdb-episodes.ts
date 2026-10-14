import 'server-only';
import { japanDate } from '@/lib/weekly-episodes';
import { unstable_cache } from 'next/cache';

export interface ImdbEpisodeScore { title: string; season: number; episode: number; score: number; votes: number }
export class EpisodeLookupError extends Error {
  constructor(readonly reason: 'quota' | 'authentication' | 'network') { super(`Episode ratings unavailable: ${reason}`); }
}
interface OmdbEpisode { Response?: string; Error?: string; Type?: string; imdbID?: string; seriesID?: string; Title?: string; Season?: string; Episode?: string; imdbRating?: string; imdbVotes?: string }
export function readImdbEpisode(data: OmdbEpisode, id: string, seriesId: string): ImdbEpisodeScore | null {
  // An exact ID and matching parent are required. Never substitute a series rating.
  if (data.Response !== 'True' || data.Type !== 'episode' || data.imdbID !== id || data.seriesID !== seriesId) return null;
  const score = Number(data.imdbRating), votes = Number(data.imdbVotes?.replace(/,/g, ''));
  const season = Number(data.Season), episode = Number(data.Episode);
  if (!data.imdbRating?.trim() || !Number.isFinite(score) || score <= 0 || score > 10 || !Number.isSafeInteger(votes) || votes <= 0
    || !data.Season?.trim() || !Number.isSafeInteger(season) || season < 0 || !Number.isSafeInteger(episode) || episode <= 0) return null;
  return { title: data.Title === 'N/A' ? '' : data.Title?.trim() ?? '', season, episode, score, votes };
}
class UnratedEpisode extends Error {}
// Only the authenticated cron imports this writer. Valid episode results have
// a separate cache from series scores; N/A and vendor failures are never stored.
const episodeScore = unstable_cache(async (id: string, seriesId: string, day: string): Promise<ImdbEpisodeScore> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new EpisodeLookupError('network');
  const key = process.env.OMDB_API_KEY?.trim();
  if (!key) throw new EpisodeLookupError('authentication');
  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('i', id); url.searchParams.set('type', 'episode'); url.searchParams.set('apikey', key);
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); }
  catch { throw new EpisodeLookupError('network'); }
  const data = await response.json().catch(() => ({})) as OmdbEpisode;
  if (/limit|quota/i.test(data.Error ?? '') || response.status === 429) throw new EpisodeLookupError('quota');
  if (/key|auth/i.test(data.Error ?? '') || response.status === 401) throw new EpisodeLookupError('authentication');
  if (!response.ok || (data.Response !== 'True' && !/not found/i.test(data.Error ?? ''))) throw new EpisodeLookupError('network');
  const result = readImdbEpisode(data, id, seriesId);
  if (!result) throw new UnratedEpisode();
  return result;
}, ['imdb-episode-score-v1'], { revalidate: 172800, tags: ['imdb-episode-scores'] });
export async function primeImdbEpisode(id: string, seriesId: string, day = japanDate()): Promise<ImdbEpisodeScore | null> {
  if (!/^tt\d+$/.test(id) || !/^tt\d+$/.test(seriesId)) return null;
  try { return await episodeScore(id, seriesId, day); }
  catch (error) { if (error instanceof UnratedEpisode) return null; throw error; }
}
