import { expect, it } from 'vitest';
import { cachedScore, topFive } from '../lib/top-five';
import { snapshotTopFive } from '../lib/weekly-snapshot-titles';
it('uses MAL before AniList before IMDb, validates ranges and ignores missing scores', () => {
  expect(cachedScore({ malScore: 7.5, anilistScore: 99, imdbRating: '9.8' })).toBe(7.5);
  expect(cachedScore({ malScore: null, anilistScore: 81, imdbRating: '9' })).toBe(8.1);
  expect(cachedScore({ malScore: NaN, anilistScore: 101, imdbRating: '8.2' })).toBe(8.2);
  for (const imdbRating of ['', ' ', 'N/A', '11', '-1']) expect(cachedScore({ imdbRating })).toBeNull();
  expect(cachedScore({ malScore: 0 })).toBe(0);
});
it('ranks the best five stably without mutating the input', () => {
  const titles = [8, 9, 7, 9, 6, 10, 5].map((malScore, id) => ({ id, ratings: { malScore } }));
  expect(topFive(titles).map(title => title.id)).toEqual([5, 1, 3, 0, 2]);
  expect(titles.map(title => title.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(topFive([{ ratings: {} }])).toEqual([]);
});
it('OG rankings never substitute cached series scores for episode votes', () => {
  expect(snapshotTopFive({ titles: {}, events: [] }, '2026-42')).toEqual([]);
  expect(snapshotTopFive({ titles: { 'tv:1': { malScore: 9, imdbRating: '9.9' } }, names: { 'tv:1': 'Example' }, events: [] }, '2026-42')).toEqual([]);
});
