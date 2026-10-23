import 'server-only';
import { unstable_cache } from 'next/cache';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { animeSearchTitles, chooseAnimeMatch, type AnimeCandidate, type AnimeSearch } from '@/lib/anime-match';
import { getWeeklyRatingSources } from '@/lib/tmdb';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { parseWeek } from '@/lib/week';
import { withTimeout } from '@/lib/async-timeout';
import { formatAnimeScore, type Ratings } from '@/lib/ratings';
import type { WeeklyRatingScores } from '@/lib/weekly-details';

// Several title searches share one request, keeping a cold 40-title week
// within the AniList queue budget. Raw errors never enter the shared cache.
const cachedBatch = unstable_cache(async (searches: AnimeSearch[]): Promise<Ratings[]> => {
  const definitions: string[] = [];
  const fields: string[] = [];
  const variables: Record<string, string> = {};
  const aliases = searches.map((search, index) => animeSearchTitles(search).map((title, alias) => {
    const key = `s${index}_${alias}`;
    definitions.push(`$${key}: String!`);
    variables[key] = title;
    fields.push(`${key}: Page(page: 1, perPage: 50) { media(search: $${key}, type: ANIME, sort: SEARCH_MATCH, format_in: [${search.kind === 'movie' ? 'MOVIE' : 'TV, TV_SHORT, ONA'}]) {
      id type format title { english romaji native } synonyms startDate { year } idMal averageScore
    } }`);
    return key;
  }));
  const response = await anilistFetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: `query (${definitions.join(', ')}) { ${fields.join('\n')} }`, variables }),
    cache: 'no-store', next: undefined,
  }, 10000);
  if (!response.ok) throw new Error('Anime scores unavailable');
  const result = await response.json() as { data?: Record<string, { media?: AnimeCandidate[] }>; errors?: unknown[] };
  if (result.errors?.length || aliases.some(keys => keys.some(key => !Array.isArray(result.data?.[key]?.media)))) throw new Error('Anime scores unavailable');
  return searches.map((search, index) => {
    const match = chooseAnimeMatch(aliases[index].flatMap(key => result.data![key].media!), search);
    if (!match) return { animeStatus: 'unmatched' };
    const ratings: Ratings = { anilistId: match.id };
    if (Number.isSafeInteger(match.idMal) && match.idMal! > 0) ratings.malId = match.idMal!;
    if (match.averageScore == null) return { ...ratings, animeStatus: 'unavailable' };
    ratings.anilistScore = match.averageScore;
    if (formatAnimeScore(ratings) === 'n/a') throw new Error('Invalid anime score');
    return { ...ratings, animeStatus: 'ready' };
  });
}, ['weekly-anilist-recovery-v2-year-labels'], { revalidate: 21600, tags: ['weekly-anilist-scores'] });

export async function getWeeklyAnimeScores(slug: string): Promise<WeeklyRatingScores> {
  const week = parseWeek(slug);
  if (!week) throw new Error('Invalid week');
  const deadline = Date.now() + 23000;
  const [sources, snapshot] = await withTimeout(Promise.all([getWeeklyRatingSources(week), getWeeklyRatings(slug)]), 10000);
  const result: WeeklyRatingScores = { titles: {}, unavailable: false };
  const missing = sources.filter(source => {
    const key = `${source.kind}:${source.id}`;
    const existing = snapshot.titles[key];
    if (existing && formatAnimeScore(existing) !== 'n/a') { result.titles[key] = existing; return false; }
    return true;
  });
  const batches = Array.from({ length: Math.ceil(missing.length / 4) }, (_, index) => missing.slice(index * 4, index * 4 + 4));
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Anime score deadline');
        const ratings = await withTimeout(cachedBatch(batch.map(({ kind, title, originalTitle, year }) => ({ kind, title, originalTitle, year }))), remaining);
        batch.forEach((source, index) => { result.titles[`${source.kind}:${source.id}`] = ratings[index]; });
      } catch {
        result.unavailable = true;
        batch.forEach(source => { result.titles[`${source.kind}:${source.id}`] = { animeStatus: 'error' }; });
      }
    }
  }));
  return result;
}
