import 'server-only';
import { unstable_cache } from 'next/cache';
import { chooseAnimeMatch, animeSearchTitles, type AnimeCandidate, type AnimeSearch } from '@/lib/anime-match';
import { getAnimeSeriesMetadata } from '@/lib/tmdb';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { displayTitle } from '@/lib/title-text';
import type { TraktShow, WeekCandidate } from '@/lib/my-anime-week';
import { withTimeout } from '@/lib/async-timeout';

export interface PersonalAnimeIdentity { id: number; title: string; poster: string | null; tmdbId?: number }
type Search = AnimeSearch & { poster: string | null; tmdbId?: number; traktId: number };
type Candidate = AnimeCandidate & { coverImage?: { large?: string | null } };
const metadata = unstable_cache(getAnimeSeriesMetadata, ['personal-anime-series-metadata-v1'], { revalidate: 604800 });

export function personalPoster(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      && (url.hostname === 's4.anilist.co' || (url.hostname === 'image.tmdb.org' && url.pathname.startsWith('/t/p/'))) ? url.href : null;
  } catch { return null; }
}

// Several independent, public searches fit in one AniList operation. Matching
// still checks each title, medium, year and ambiguity separately. No account
// information or watch history is sent to the catalog service.
const searchBatch = unstable_cache(async (searches: Search[]) => {
  const variables: Record<string, string> = {};
  const pages: { key: string; index: number }[] = [];
  for (let index = 0; index < searches.length; index++) {
    for (const title of animeSearchTitles(searches[index]).slice(0, 2)) {
      const key = `a${pages.length}`;
      variables[key] = title; pages.push({ key, index });
    }
  }
  if (!pages.length) return [];
  const query = `query (${pages.map(({ key }) => `$${key}: String!`).join(', ')}) { ${pages.map(({ key }) => `${key}: Page(page: 1, perPage: 50) { media(type: ANIME, search: $${key}, format_in: [TV, TV_SHORT, ONA]) { id type format title { english romaji native } synonyms startDate { year } coverImage { large } } }`).join('\n')} }`;
  const response = await anilistFetch('https://graphql.anilist.co', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }), next: { revalidate: 86400 } }, 15000);
  if (!response.ok) throw new Error('Anime identity lookup unavailable');
  const body = await response.json() as { data?: Record<string, { media?: Candidate[] }>; errors?: unknown[] };
  if (body.errors?.length || pages.some(({ key }) => !Array.isArray(body.data?.[key]?.media))) throw new Error('Incomplete anime identity lookup');
  return searches.map((search, index) => {
    const candidates = pages.filter(page => page.index === index).flatMap(page => body.data![page.key].media!);
    const match = chooseAnimeMatch(candidates, search) as Candidate | null;
    return match ? { traktId: search.traktId, identity: { id: match.id, title: displayTitle(match.title?.english || match.title?.romaji || search.title),
      poster: personalPoster(match.coverImage?.large) || personalPoster(search.poster), ...(search.tmdbId ? { tmdbId: search.tmdbId } : {}) } } : { traktId: search.traktId, identity: null };
  });
}, ['personal-anime-identities-v1'], { revalidate: 86400 });

export async function resolvePersonalAnime(shows: TraktShow[], known: WeekCandidate[] = [], maxWaitMs = 35000) {
  const deadline = Date.now() + maxWaitMs;
  const identities = new Map<number, PersonalAnimeIdentity>();
  const unique = [...new Map(shows.filter(show => show?.title && Number.isSafeInteger(show.ids?.trakt) && show.ids.trakt > 0).map(show => [show.ids.trakt, show])).values()];
  const searches: Search[] = [];
  let unmatched = 0, excluded = 0, unavailable = false, deferred = false;
  for (let offset = 0; offset < unique.length; offset += 4) {
    const batch = unique.slice(offset, offset + 4);
    if (Date.now() >= deadline) { unmatched += unique.length - offset; unavailable = true; deferred = true; break; }
    await Promise.all(batch.map(async show => {
      const confirmed = known.filter(candidate => show.ids.tmdb && candidate.tmdbKeys.includes(`tv:${show.ids.tmdb}`));
      if (confirmed.length === 1) {
        identities.set(show.ids.trakt, { id: confirmed[0].id, title: displayTitle(show.title), poster: personalPoster(confirmed[0].poster), tmdbId: show.ids.tmdb! }); return;
      }
      // Extended metadata cheaply excludes non-Japanese live action. Missing
      // metadata or incomplete Japanese genre tags still get an identity check.
      if (show.country && show.country.toLowerCase() !== 'jp' && show.genres?.length
        && !show.genres.some(genre => genre === 'animation' || genre === 'anime')) { excluded++; return; }
      try {
        if (show.ids.tmdb && Number.isSafeInteger(show.ids.tmdb) && show.ids.tmdb > 0) {
          const data = await withTimeout(metadata(show.ids.tmdb), Math.max(1, deadline - Date.now()));
          if (!data) { excluded++; return; }
          searches.push({ ...data, kind: 'tv', tmdbId: show.ids.tmdb, traktId: show.ids.trakt });
        } else if (show.genres?.includes('anime') || (show.genres?.includes('animation') && show.country?.toLowerCase() === 'jp')) {
          if (!show.year || !Number.isInteger(show.year)) { unmatched++; return; }
          searches.push({ kind: 'tv', title: show.title, year: show.year, poster: null, traktId: show.ids.trakt });
        } else { unmatched++; }
      } catch { unmatched++; unavailable = true; if (Date.now() >= deadline) deferred = true; }
    }));
  }
  // Deterministic groups improve public cache reuse across calendar/statistics.
  searches.sort((a, b) => a.traktId - b.traktId);
  for (let offset = 0; offset < searches.length; offset += 5) {
    if (Date.now() >= deadline) { unmatched += searches.length - offset; unavailable = true; deferred = true; break; }
    try {
      for (const result of await withTimeout(searchBatch(searches.slice(offset, offset + 5)), Math.max(1, deadline - Date.now()))) {
        if (result.identity) identities.set(result.traktId, result.identity); else unmatched++;
      }
    } catch { unmatched += Math.min(5, searches.length - offset); unavailable = true; if (Date.now() >= deadline) deferred = true; }
  }
  return { identities, unmatched, excluded, unavailable, deferred };
}
