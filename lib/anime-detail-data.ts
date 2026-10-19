import 'server-only';
import type { Locale } from '@/lib/locales';
import { cache } from 'react';
import { animeDescription, type AniListAnime } from '@/lib/anilist';
import { withTimeout } from '@/lib/async-timeout';
import { getCachedDetailAvailability, type DetailAvailability } from '@/lib/detail-availability';
import { hasImdbScore } from '@/lib/imdb';
import { getMyAnimeListScore } from '@/lib/myanimelist';
import { readRatingsStore } from '@/lib/ratings-store';
import type { Ratings } from '@/lib/ratings';
import { getSynopsis } from '@/lib/synopsis';
import type { SynopsisResult } from '@/lib/synopsis-client';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';

const SERVER_WAIT_MS = 2500;
const MAX_STORED_AGE = 120 * 86400000;
const hasMalScore = (ratings: Ratings) => typeof ratings.malScore === 'number' && Number.isFinite(ratings.malScore) && ratings.malScore > 0 && ratings.malScore <= 10;

// Read only: never trigger the weekly collector or spend OMDb quota here.
export async function readDetailRatings(anime: AniListAnime): Promise<Ratings> {
  const [store, weekly] = await Promise.all([readRatingsStore(), readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date())))]);
  const snapshot = Object.values(weekly.titles).find(rating => rating.anilistId === anime.id);
  const mapped = Object.values(store.sources).find(source => source.anilistId === anime.id && Date.now() - source.fetchedAt <= MAX_STORED_AGE);
  const ratings: Ratings = { ...snapshot, anilistId: anime.id, malId: anime.idMal ?? undefined };
  // A MAL score must belong to this exact season, never a parent series.
  if (snapshot?.malId !== anime.idMal) {
    delete ratings.malScore; delete ratings.malMembers; delete ratings.malScoredBy; delete ratings.malStatus;
  }
  const imdbId = ratings.imdbId || mapped?.imdbId;
  for (const key of [imdbId ? `imdb:${imdbId}` : '', `anilist:${anime.id}`, anime.idMal ? `mal:${anime.idMal}` : '']) {
    const entry = store.ratings[key];
    if (entry && Date.now() - entry.fetchedAt <= MAX_STORED_AGE) Object.assign(ratings, entry.values);
  }
  if (imdbId) ratings.imdbId = imdbId;
  // The canonical detail fetch is newer than the weekly AniList snapshot.
  ratings.anilistScore = anime.averageScore ?? ratings.anilistScore;
  return ratings;
}

// Share completed values between metadata and the page. The short deadline also
// covers service queues and response bodies; cached loaders may finish warming
// after it expires, while the visitor can make one bounded client attempt.
export const getAnimeDetailData = cache(async (anime: AniListAnime, locale: Locale = 'it') => {
  const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const stored = withTimeout(readDetailRatings(anime), SERVER_WAIT_MS).catch((): Ratings => ({}));
  const ratings = stored.then(async scores => ({
    ...scores, anilistId: anime.id, anilistScore: anime.averageScore ?? scores.anilistScore,
    ...(!hasMalScore(scores) && anime.idMal
      ? await withTimeout(getMyAnimeListScore(anime.idMal), SERVER_WAIT_MS).catch((): Ratings => ({ malId: anime.idMal!, malStatus: 'error' }))
      : {}),
  }));
  const availability = withTimeout(getCachedDetailAvailability(anime), SERVER_WAIT_MS)
    .catch((): DetailAvailability => ({ match: null, ratings: {}, providers: {}, providersUnavailable: true }));
  const synopsis = withTimeout(getSynopsis(aliases, year, locale, anime.format === 'MOVIE' ? 'movie' : 'tv', anime.id), SERVER_WAIT_MS)
    .catch((): SynopsisResult => ({ synopsis: null, language: null, source: null }));
  const [scores, resolved, plot] = await Promise.all([ratings, availability, synopsis]);
  const watch = { ...resolved, ratings: { ...resolved.ratings } };
  // Preserve the existing resolver's season/series identity. A weekly score may
  // fill a missing identity, but cannot replace a different confirmed IMDb work.
  if (hasImdbScore(scores) && (!watch.ratings.imdbId || watch.ratings.imdbId === scores.imdbId) && !hasImdbScore(watch.ratings)) {
    watch.ratings = { ...watch.ratings, imdbId: scores.imdbId, imdbRating: scores.imdbRating, imdbVotes: scores.imdbVotes, imdbStatus: 'ready', imdbSeriesTitle: watch.ratings.imdbSeriesTitle || scores.imdbSeriesTitle };
  }
  return { ratings: scores, availability: watch, synopsis: { ...plot, synopsis: plot.synopsis ? animeDescription(plot.synopsis) : null } };
});
