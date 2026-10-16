import 'server-only';
import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';
import { animeSearchTitles, chooseAnimeMatch, type AnimeCandidate, type AnimeSearch } from '@/lib/anime-match';
import type { Ratings } from '@/lib/ratings';
import { withTimeout } from '@/lib/async-timeout';
import { MAL_API_BASE, parseMalRating } from '@/lib/mal-provider';

import { anilistFetch as anilist, jikanFetch as jikan } from '@/lib/rate-limited-fetch';
// Legacy option/queue names are retained for cron compatibility; MAL now uses Tenrai.
export const JIKAN_REVALIDATE = 86400;
const query = `query ($search: String!, $formats: [MediaFormat]) {
  Page(page: 1, perPage: 50) {
    media(search: $search, type: ANIME, format_in: $formats) {
      id type format title { romaji english native } synonyms
      startDate { year } idMal averageScore
    }
  }
}`;

export async function getAnimeRatings(search: AnimeSearch): Promise<Ratings> {
  return (await lookupAnimeRatings(search)).ratings;
}
interface AnimeRatingOptions {
  weekly?: boolean;
  existing?: Ratings;
  skipJikan?: boolean;
  onJikanTimeout?: () => void;
}
export async function lookupAnimeRatings(search: AnimeSearch, options: AnimeRatingOptions = {}): Promise<{ ratings: Ratings; unavailable: boolean }> {
  const deadline = Date.now() + 12000;
  const existing = options.existing;
  const needsMal = existing?.malScore == null && !options.skipJikan;
  if (existing?.anilistScore != null && (!needsMal || existing.malId)) {
    return { ratings: needsMal ? await getAnimeRatingsById(existing.malId, existing.anilistScore, CACHE_SECONDS, 6000, options.weekly, options.onJikanTimeout) : {}, unavailable: false };
  }
  const candidates: AnimeCandidate[] = [];
  let unavailable = false;
  try {
    let match: AnimeCandidate | null = null;
    for (const title of animeSearchTitles(search)) {
      if (Date.now() >= deadline) return { ratings: {}, unavailable: true };
      try {
        const response = await anilist('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: title, formats: search.kind === 'movie' ? ['MOVIE'] : ['TV', 'TV_SHORT', 'ONA'] } }),
          // Cron caches the validated combined snapshot, never raw error bodies.
          ...(options.weekly ? { cache: 'no-store' as const, next: undefined } : {}),
        }, Math.max(0, deadline - Date.now()));
        if (!response.ok) { unavailable = true; continue; }
        const data = await response.json() as { data?: { Page?: { media?: AnimeCandidate[] } }; errors?: unknown[] };
        if (data.errors?.length || !Array.isArray(data.data?.Page?.media)) { unavailable = true; continue; }
        candidates.push(...data.data.Page.media);
        match = chooseAnimeMatch(candidates, search);
        if (match) break;
      } catch { unavailable = true; }
    }
    if (!match) return { ratings: {}, unavailable };
    const fallback: Ratings = { anilistId: match.id, anilistScore: match.averageScore };
    if (Number.isSafeInteger(match.idMal) && match.idMal! > 0) fallback.malId = match.idMal!;
    if (!needsMal || Date.now() >= deadline) return { ratings: fallback, unavailable: false };
    return { ratings: { ...fallback, ...await getAnimeRatingsById(match.idMal, match.averageScore, options.weekly ? CACHE_SECONDS : JIKAN_REVALIDATE, Math.max(0, deadline - Date.now()), options.weekly, options.onJikanTimeout) }, unavailable: false };
  } catch { return { ratings: {}, unavailable: true }; }
}

// Details already have an exact MAL ID, so no further title lookup is needed.
export async function getAnimeRatingsById(idMal: number | null | undefined, averageScore: number | null | undefined, revalidate = JIKAN_REVALIDATE, maxWaitMs?: number, weekly = false, onTimeout?: () => void): Promise<Ratings> {
  const fallback: Ratings = { anilistScore: averageScore };
  if (!Number.isSafeInteger(idMal) || idMal! <= 0) return fallback;
  fallback.malId = idMal!;
  const started = Date.now();
  try {
    const lookup = async (): Promise<Ratings> => {
      const response = await jikan(`${MAL_API_BASE}/anime/${idMal}`, weekly ? { cache: 'no-store', next: undefined } : { next: { revalidate, tags: [CACHE_TAG] } }, maxWaitMs);
      if (!response.ok) {
        if (maxWaitMs != null && Date.now() - started >= maxWaitMs) onTimeout?.();
        return fallback;
      }
      const ratings = parseMalRating(await response.json(), idMal!);
      return { ...fallback, malScore: ratings.malScore, malMembers: ratings.malMembers, ...(ratings.malScoredBy == null ? {} : { malScoredBy: ratings.malScoredBy }) };
    };
    // Include response bodies in the cron timeout as well as the service queue.
    return await (weekly ? withTimeout(lookup(), maxWaitMs ?? 6000) : lookup());
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError' || /timed out/i.test(error.message))) onTimeout?.();
    return fallback;
  }
}
