import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/tmdb', () => ({ getTMDBWeekEpisodes: vi.fn(), getTMDBEpisodeIdentity: vi.fn() }));
vi.mock('@/lib/imdb-episode-index', () => ({ getImdbEpisodeChart: vi.fn() }));
import { getTMDBWeekEpisodes, getTMDBEpisodeIdentity } from '@/lib/tmdb';
import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { getEpisodeIndexedScore } from '@/lib/episode-score';
import type { DetailAvailability } from '@/lib/detail-availability';
const watch = { match: { id: 1, kind: 'tv' }, ratings: { imdbId: 'tt100' }, providers: {}, providersUnavailable: false } as DetailAvailability;
const event = { id: 1, mediaId: 1, episode: 12, airingAt: Date.parse('2026-01-05T14:00:00Z') / 1000 };
const score = { imdbId: 'tt101', season: 2, episode: 1, score: 8.7, votes: 100 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getImdbEpisodeChart).mockResolvedValue({ status: 'ready', episodes: [score] });
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ unavailable: false, episodes: [{ seriesId: 1, date: '2026-01-05', season: 1, episode: 13 }] });
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt101', seriesImdbId: 'tt100' });
});
it('uses the verified exact IMDb episode identity even when all sources number it differently', async () => {
  expect(await getEpisodeIndexedScore(watch, event)).toEqual(score);
});
it('omits a score when the parent series differs or more than one episode shares the date', async () => {
  vi.mocked(getTMDBEpisodeIdentity).mockResolvedValue({ imdbId: 'tt101', seriesImdbId: 'tt999' });
  expect(await getEpisodeIndexedScore(watch, event)).toBeNull();
  vi.mocked(getTMDBWeekEpisodes).mockResolvedValue({ unavailable: false, episodes: [1, 2].map(episode => ({ seriesId: 1, date: '2026-01-05', season: 1, episode })) });
  expect(await getEpisodeIndexedScore(watch, event)).toBeNull();
});
it('does no identity work when the episode index is unavailable', async () => {
  vi.mocked(getImdbEpisodeChart).mockResolvedValue({ status: 'unavailable', episodes: [] });
  expect(await getEpisodeIndexedScore(watch, event)).toBeNull();
  expect(getTMDBWeekEpisodes).not.toHaveBeenCalled();
});
