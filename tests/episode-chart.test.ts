import { expect, it } from 'vitest';
import { chartSeasons, type ChartEpisode } from '../lib/episode-chart';
const episode = (overrides: Partial<ChartEpisode> = {}): ChartEpisode => ({ imdbId: 'tt1', season: 1, episode: 1, score: 8, votes: 100, ...overrides });
it('groups IMDb seasons and specials in numeric order and uses the episode average, not the series score', () => {
  const seasons = chartSeasons([episode({ season: 2, episode: 3 }), episode({ imdbId: 'tt2', episode: 2, score: 9, votes: 5 }), episode({ imdbId: 'tt3' }), episode({ imdbId: 'tt4', season: 0 })]);
  expect(seasons.map(season => season.number)).toEqual([0, 1, 2]);
  expect(seasons[1]).toMatchObject({ average: 8.5, votes: 105 });
  expect(seasons[1].episodes.map(item => item.episode)).toEqual([1, 2]);
});
it('keeps gaps in numbering and rejects conflicting episode identities', () => {
  const seasons = chartSeasons([episode(), episode({ imdbId: 'tt2', episode: 3 }), episode({ imdbId: 'tt3', episode: 3 }), episode({ imdbId: 'tt4', episode: 5 })]);
  expect(seasons[0].episodes.map(item => item.episode)).toEqual([1, 5]);
});
it.each([{ score: 0 }, { score: 11 }, { votes: 0 }, { season: -1 }, { episode: 0 }, { imdbId: 'javascript:alert(1)' }])('rejects invalid or unrated episode data (%j)', invalid => {
  expect(chartSeasons([episode(invalid)])).toEqual([]);
});
it('deduplicates repeated copies of the same episode without counting votes twice', () => {
  const seasons = chartSeasons([episode({ votes: 10 }), episode({ votes: 20 })]);
  expect(seasons[0]).toMatchObject({ votes: 20 });
  expect(seasons[0].episodes).toHaveLength(1);
});
it('rejects one episode identity assigned to different season coordinates', () => {
  expect(chartSeasons([episode(), episode({ season: 2 })])).toEqual([]);
});
