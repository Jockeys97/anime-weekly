import 'server-only';
import { CACHE_TAG } from '@/lib/config';
import { chooseAnimeMatch, type AnimeCandidate, type AnimeSearch } from '@/lib/anime-match';
import type { Ratings } from '@/lib/ratings';

import { anilistFetch as anilist, throttle } from '@/lib/rate-limited-fetch';
const jikan = throttle(400, 6000);
export const JIKAN_REVALIDATE = 86400;
// Overall budget per process so a slow/blocked upstream degrades to n/a instead of stalling the page.
const BUDGET_MS = 150_000;
let budgetStart: number | undefined;
const overBudget = () => { budgetStart ??= Date.now(); return Date.now() - budgetStart > BUDGET_MS; };
const query = `query ($search: String!, $formats: [MediaFormat]) {
  Page(page: 1, perPage: 50) {
    media(search: $search, type: ANIME, format_in: $formats) {
      id type format title { romaji english native } synonyms
      startDate { year } idMal averageScore
    }
  }
}`;

export async function getAnimeRatings(search: AnimeSearch): Promise<Ratings> {
  const deadline = Date.now() + 10000;
  try {
    const titles = [...new Set([search.originalTitle, search.title].filter((title): title is string => Boolean(title?.trim())).map(title => title.trim()))];
    let match: AnimeCandidate | null = null;
    for (const title of titles) {
      if (overBudget() || Date.now() >= deadline) return {};
      try {
        const response = await anilist('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: title, formats: search.kind === 'movie' ? ['MOVIE'] : ['TV', 'TV_SHORT', 'ONA'] } }),
        }, Math.max(0, deadline - Date.now()));
        if (!response.ok) continue;
        const data = await response.json() as { data?: { Page?: { media?: AnimeCandidate[] } }; errors?: unknown[] };
        if (data.errors?.length || !Array.isArray(data.data?.Page?.media)) continue;
        match = chooseAnimeMatch(data.data.Page.media, search);
        if (match) break;
      } catch { /* Try the display title if the original title lookup failed. */ }
    }
    if (!match) return {};
    const fallback: Ratings = { anilistId: match.id, anilistScore: match.averageScore };
    if (Number.isSafeInteger(match.idMal) && match.idMal! > 0) fallback.malId = match.idMal!;
    if (overBudget() || Date.now() >= deadline) return fallback;
    return { ...fallback, ...await getAnimeRatingsById(match.idMal, match.averageScore, JIKAN_REVALIDATE, Math.max(0, deadline - Date.now())) };
  } catch { return {}; }
}

// Details already have an exact MAL ID, so reuse Jikan without another title lookup.
export async function getAnimeRatingsById(idMal: number | null | undefined, averageScore: number | null | undefined, revalidate = JIKAN_REVALIDATE, maxWaitMs?: number): Promise<Ratings> {
  const fallback: Ratings = { anilistScore: averageScore };
  if (!Number.isSafeInteger(idMal) || idMal! <= 0) return fallback;
  fallback.malId = idMal!;
  try {
    const response = await jikan(`https://api.jikan.moe/v4/anime/${idMal}`, { next: { revalidate, tags: [CACHE_TAG] } }, maxWaitMs);
    if (!response.ok) return fallback;
    const data = await response.json() as { data?: { score?: number | null; members?: number | null } };
    return { ...fallback, malScore: data.data?.score, malMembers: data.data?.members };
  } catch { return fallback; }
}
