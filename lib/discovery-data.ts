import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getSeason, type AniListAnime } from '@/lib/anilist';
import { currentSeason, shiftSeason } from '@/lib/season';
import { CACHE_TAG } from '@/lib/config';
import { rankGenre, rankSimilar } from '@/lib/discovery';
import { readRatingsStore } from '@/lib/ratings-store';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import type { Ratings } from '@/lib/ratings';

// Shared by lists, detail blocks and sitemap. At most ten cached catalog pages
// per season; never enrich every candidate through TMDB, Jikan or OMDb.
const catalog = unstable_cache(async (year: number, season: ReturnType<typeof currentSeason>['season']) => {
  const seasons = [shiftSeason({ year, season }, -1), { year, season }];
  const media = new Map<number, AniListAnime>();
  for (const selected of seasons) {
    for (let page = 1; page <= 10; page++) {
      const result = await getSeason(selected.year, selected.season, page);
      if (result.unavailable) throw new Error('Discovery catalog unavailable');
      for (const anime of result.media) media.set(anime.id, anime);
      if (!result.pageInfo.hasNextPage) break;
      if (page === 10) throw new Error('Discovery catalog exceeds bounded page budget');
    }
  }
  return [...media.values()];
}, ['discovery-catalog-v1'], { revalidate: 86400, tags: [CACHE_TAG] });
export const getDiscoveryCatalog = cache(async () => {
  const { year, season } = currentSeason();
  return catalog(year, season);
});
export const getSimilarAnime = cache(async (anime: AniListAnime) => rankSimilar(anime, await getDiscoveryCatalog()));

export const getGenreLists = cache(async () => {
  const season = currentSeason();
  const [catalog, store, snapshot] = await Promise.all([getDiscoveryCatalog(), readRatingsStore(), readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date())))]);
  const media = catalog.filter(anime => anime.seasonYear === season.year && anime.season?.toLowerCase() === season.season);
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
  const genres = [...new Set(media.flatMap(anime => anime.genres))].sort();
  return { season, lists: genres.map(genre => ({ genre, items: rankGenre(media, genre, ratings) })) };
});
