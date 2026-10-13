import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEpisodeDates, selectEpisodeSeasons } from '../lib/episode-dates';
vi.mock('server-only', () => ({}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const week = { year: 2026, week: 42 };
const episode = { show_id: 21, season_number: 3, episode_number: 2, air_date: '2026-10-14' };
describe('actual TMDB episode dates', () => {
  it('validates exact dates, series identity and season/episode numbers', () => {
    expect(readEpisodeDates(21, [episode, { ...episode, air_date: null }, { ...episode, air_date: '2026-10-19' },
      { ...episode, show_id: 22 }, { ...episode, episode_number: 0 }, null, { ...episode, air_date: '2026-02-31' }], '2026-10-12', '2026-10-18'))
      .toEqual([{ seriesId: 21, season: 3, episode: 2, date: '2026-10-14' }]);
    expect(readEpisodeDates(21, {}, '2026-02-01', '2026-03-01')).toEqual([]);
    expect(readEpisodeDates(21, [{ ...episode, air_date: '2026-02-31' }], '2026-02-01', '2026-03-01')).toEqual([]);
  });
  it('looks at recent seasons and undated seasons, excluding known future seasons', () => {
    expect(selectEpisodeSeasons([{ season_number: 1, air_date: '2020-01-01' }, { season_number: 2, air_date: '2024-01-01' },
      { season_number: 3, air_date: '2026-10-01' }, { season_number: 4, air_date: null }, { season_number: 5, air_date: '2027-01-01' }], '2026-10-18')).toEqual([4, 3, 2]);
    expect(selectEpisodeSeasons(undefined, '2026-10-18')).toEqual([]);
  });
  it('queries exact TMDB IDs and deduplicates last/next episodes against season data', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
    const fetchMock = vi.fn(async (url: URL, options?: RequestInit & { next?: { revalidate?: number } }) => {
      void options; return url.pathname.endsWith('/season/3')
      ? Response.json({ episodes: [episode, { ...episode, episode_number: 3, air_date: '2026-10-18' }] })
      : Response.json({ seasons: [{ season_number: 3, air_date: '2026-10-01' }], last_episode_to_air: episode }); });
    vi.stubGlobal('fetch', fetchMock);
    const { getTMDBWeekEpisodes } = await import('../lib/tmdb');
    const result = await getTMDBWeekEpisodes(21, week);
    expect(result.unavailable).toBe(false); expect(result.episodes).toHaveLength(2);
    expect(fetchMock.mock.calls.map(([url]) => url.pathname)).toEqual(['/3/tv/21', '/3/tv/21/season/3']);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ next: { revalidate: 3600 } });
  });
  it('retains actual last/next episode dates when season loading fails', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => url.pathname.includes('/season/') ? new Response(null, { status: 503 })
      : Response.json({ seasons: [{ season_number: 3, air_date: '2026-10-01' }], next_episode_to_air: episode })));
    const { getTMDBWeekEpisodes } = await import('../lib/tmdb');
    expect(await getTMDBWeekEpisodes(21, week)).toEqual({ episodes: [{ seriesId: 21, season: 3, episode: 2, date: '2026-10-14' }], unavailable: true });
  });
  it('does not treat the series premiere as an episode or create dates after failure', async () => {
    vi.stubEnv('TMDB_API_KEY', 'test'); vi.stubEnv('TMDB_READ_TOKEN', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ first_air_date: '2026-10-14' })));
    const { getTMDBWeekEpisodes } = await import('../lib/tmdb');
    expect(await getTMDBWeekEpisodes(21, week)).toEqual({ episodes: [], unavailable: false });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getTMDBWeekEpisodes(21, week)).toEqual({ episodes: [], unavailable: true });
  });
});
