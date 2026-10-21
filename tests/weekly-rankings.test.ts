import { describe, expect, it } from 'vitest';
import { rankWeeklyAnime, weeklyRankings } from '../lib/weekly-rankings';
import type { AnimeTitle } from '../lib/tmdb';
import type { Ratings } from '../lib/ratings';
const title = (id: number, ratings: Ratings = {}, kind: 'tv' | 'movie' = 'tv'): AnimeTitle => ({ id, kind, name: `Anime ${id}`, overview: '', poster: null, ratings: { anilistId: id, ...ratings }, providers: {}, providersUnavailable: false, recommendation: null });
describe('weekly rankings', () => {
  it('requires 1,000 actual IMDb votes and a score in range', () => {
    const rows = [title(1, { imdbRating: '9', imdbVotes: '999' }), title(2, { imdbRating: '8', imdbVotes: '1,000' }), title(3, { imdbRating: '11', imdbVotes: '3,000' }), title(4, { imdbRating: '8', imdbVotes: '1,00' })];
    expect(rankWeeklyAnime(rows, 'imdb').map(row => row.anilistId)).toEqual([2]);
  });
  it('requires MAL scored_by rather than members, including when scored_by is zero', () => {
    expect(rankWeeklyAnime([title(1, { malScore: 9, malMembers: 100000 }), title(2, { malScore: 8, malScoredBy: 1000 }), title(3, { malScore: 9, malScoredBy: 0, malMembers: 100000 }), title(4, { malScore: 8, malScoredBy: 999 })], 'mal').map(row => row.anilistId)).toEqual([2]);
  });
  it('sorts by score, votes, then ID, deduplicates without mutating inputs', () => {
    const rows = [title(4, { malScore: 8, malScoredBy: 2000 }), title(3, { malScore: 9, malScoredBy: 1000 }), title(2, { malScore: 8, malScoredBy: 2000 }), title(1, { malScore: 8, malScoredBy: 1000 }), title(3, { malScore: 7, malScoredBy: 1000 })];
    expect(rankWeeklyAnime(rows, 'mal').map(row => row.anilistId)).toEqual([3, 2, 4, 1]);
    expect(rows.map(row => row.id)).toEqual([4, 3, 2, 1, 3]);
  });
  it('excludes movies, unknown detail identities and empty weeks', () => {
    expect(rankWeeklyAnime([title(1, { malScore: 9, malScoredBy: 1000 }, 'movie'), title(2, { anilistId: undefined, malScore: 9, malScoredBy: 1000 })], 'mal')).toEqual([]);
    expect(weeklyRankings([])).toEqual({ imdb: [], mal: [] });
  });
});
