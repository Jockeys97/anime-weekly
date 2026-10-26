import 'server-only';
import { withTimeout } from '@/lib/async-timeout';
import { cache } from 'react';
import { readSharedSimilarCatalog } from '@/lib/similar-catalog-client';
import type { AniListAnime } from '@/lib/anilist';
import { currentSeason } from '@/lib/season';
import { rankGenre, rankSimilar } from '@/lib/discovery';
import { readRatingsStore, type RatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import type { Ratings } from '@/lib/ratings';

export const getDiscoveryCatalog = cache(() => readSharedSimilarCatalog('seasonal'));

const getSimilarAnimeFull = cache(async (anime: AniListAnime) => rankSimilar(anime, await readSharedSimilarCatalog('full')));

// Bound cache reads. Neither a timeout nor a miss schedules background work.
export const SIMILAR_PAGE_WAIT_MS = 4000;
export const SIMILAR_FALLBACK_WAIT_MS = 250;
async function bounded<T>(pending: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally { clearTimeout(timer); }
}
export async function getSimilarAnime(anime: AniListAnime, maxWaitMs = SIMILAR_PAGE_WAIT_MS) {
  const full = getSimilarAnimeFull(anime).catch(() => null);
  const result = await bounded(full, maxWaitMs);
  if (result?.length) return result;
  const seasonal = await bounded(readSharedSimilarCatalog('seasonal').catch(() => []), SIMILAR_FALLBACK_WAIT_MS);
  return rankSimilar(anime, seasonal ?? []);
}

export const getGenreLists = cache(async (providedCatalog?: AniListAnime[]) => {
  const season = currentSeason();
  const [catalog, store, snapshot] = await Promise.all([providedCatalog ?? getDiscoveryCatalog(), withTimeout(readRatingsStore(), 1500).catch(() => ({ ratings: {}, sources: {} } as RatingsStore)), withTimeout(readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date()))), 1500).catch(() => ({ titles: {}, events: [] }))]);
  const media = catalog.filter(anime => !anime.isAdult && anime.seasonYear === season.year && anime.season?.toLowerCase() === season.season);
  const ratings: Record<number, Ratings> = {};
  const weekly = new Map(Object.values(snapshot.titles).map(r => [r.anilistId, r]));
  for (const anime of media) {
    const r = { ...weekly.get(anime.id) };
    const mapping = Object.values(store.sources).find(s => s.anilistId === anime.id && Date.now() - s.fetchedAt <= 120 * 86400000);
    for (const key of [mapping?.imdbId ? `imdb:${mapping.imdbId}` : '', `anilist:${anime.id}`, anime.idMal ? `mal:${anime.idMal}` : '']) {
      const entry = store.ratings[key];
      if (entry && Date.now() - entry.fetchedAt <= 120 * 86400000) {
        Object.assign(r, entry.values);
        // Stored provider values contain scores, not identity fields. The exact
        // MAL cache key establishes the identity required by rankGenre.
        if (key === `mal:${anime.idMal}`) r.malId = anime.idMal!;
      }
    }
    ratings[anime.id] = r;
  }
  const genres = [...new Set(media.flatMap(anime => anime.genres).filter(genre => genre !== 'Hentai'))].sort();
  return { season, media, lists: genres.map(genre => ({ genre, items: rankGenre(media, genre, ratings) })) };
});
