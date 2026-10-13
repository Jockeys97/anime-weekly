import 'server-only';
import { CACHE_SECONDS, CACHE_TAG } from '@/lib/config';
import { chooseAnimeMatch, type AnimeCandidate, type AnimeSearch } from '@/lib/anime-match';
import type { Ratings } from '@/lib/ratings';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function throttle(spacing: number, timeoutMs = 10000) {
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart: number | undefined;
  return (url: string, init: RequestInit = {}): Promise<Response> => {
    const request = tail.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (lastStart != null) await sleep(Math.max(0, lastStart + spacing - Date.now()));
        lastStart = Date.now();
        const response = await fetch(url, { ...init, cache: 'force-cache', next: { revalidate: CACHE_SECONDS, tags: [CACHE_TAG] }, signal: AbortSignal.timeout(timeoutMs) });
        if (response.status !== 429 || attempt === 2) return response;
        const retryAfter = response.headers.get('Retry-After');
        const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
        const retryMs = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 0;
        await response.body?.cancel();
        await sleep(Math.max(spacing * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0));
      }
      throw new Error('Retry limit reached');
    });
    tail = request.catch(() => undefined);
    return request;
  };
}
// Module-level queues serialize all requests, including retry attempts.
// AniList currently advertises 30 req/min (X-RateLimit-Limit), so space requests ~2.1s.
const anilist = throttle(2100);
const jikan = throttle(400, 6000);
// Overall budget per process so a slow/blocked upstream degrades to n/a instead of stalling the page.
const BUDGET_MS = 150_000;
let budgetStart: number | undefined;
let jikanFailures = 0;
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
  try {
    const titles = [...new Set([search.originalTitle, search.title].filter((title): title is string => Boolean(title?.trim())).map(title => title.trim()))];
    let match: AnimeCandidate | null = null;
    for (const title of titles) {
      if (overBudget()) return {};
      try {
        const response = await anilist('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: title, formats: search.kind === 'movie' ? ['MOVIE'] : ['TV', 'TV_SHORT', 'ONA'] } }),
        });
        if (!response.ok) continue;
        const data = await response.json() as { data?: { Page?: { media?: AnimeCandidate[] } }; errors?: unknown[] };
        if (data.errors?.length || !Array.isArray(data.data?.Page?.media)) continue;
        match = chooseAnimeMatch(data.data.Page.media, search);
        if (match) break;
      } catch { /* Try the display title if the original title lookup failed. */ }
    }
    if (!match) return {};
    const fallback: Ratings = { anilistScore: match.averageScore };
    if (!Number.isSafeInteger(match.idMal) || match.idMal! <= 0) return fallback;
    if (jikanFailures >= 3 || overBudget()) return fallback;
    try {
      const response = await jikan(`https://api.jikan.moe/v4/anime/${match.idMal}`);
      if (!response.ok) { jikanFailures++; return fallback; }
      jikanFailures = 0;
      const data = await response.json() as { data?: { score?: number | null; members?: number | null } };
      return { ...fallback, malScore: data.data?.score, malMembers: data.data?.members };
    } catch { jikanFailures++; return fallback; }
  } catch { return {}; }
}
