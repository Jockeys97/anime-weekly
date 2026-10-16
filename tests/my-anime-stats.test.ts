import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { cache, json, resolve } = vi.hoisted(() => ({ cache: vi.fn((fn: () => unknown) => fn), json: vi.fn(), resolve: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: cache }));
vi.mock('../lib/my-anime-trakt', () => ({ traktJson: json }));
vi.mock('../lib/my-anime-identity', () => ({ resolvePersonalAnime: resolve }));
import { getPersonalStats } from '../lib/my-anime-stats';
import { runtimeCacheMock } from './runtime-cache-setup';
import { animeHistoryStats, type TraktHistoryPlay } from '../lib/my-anime-stats-model';
const show = { title: 'Example Anime', ids: { trakt: 7, tmdb: 42 } };
const profile = { id: 21, title: 'Example Anime', poster: null };
const identities = new Map([[7, profile]]);
const play = (id: number, number = 1, runtime: number | null = 24): TraktHistoryPlay => ({ id, type: 'episode', show, episode: { season: 1, number, runtime } });
beforeEach(() => {
  vi.clearAllMocks();
  json.mockResolvedValue({ data: [play(1), play(2, 2), play(3)], pages: 1 });
  resolve.mockResolvedValue({ identities, unavailable: false, unmatched: 0, excluded: 0 });
});
afterEach(() => vi.useRealTimers());
describe('anime-only viewing totals', () => {
  it('counts unique episodes once and rewatches separately, including both in hours', () => {
    expect(animeHistoryStats([play(1), play(2, 2), play(3), play(3), { ...play(4), show: { title: 'The Diplomat', ids: { trakt: 99 } } }], identities))
      .toMatchObject({ series: 1, episodes: 2, plays: 3, rewatches: 1, minutes: 72, missingRuntimePlays: 0, partial: false });
  });
  it('excludes missing/invalid durations from hours without dropping episode counts', () => {
    const data = animeHistoryStats([play(1), play(2, 2, null), play(3, 3, 0), play(4, 4, -24), play(5, 5, Infinity)], identities);
    expect(data).toMatchObject({ episodes: 5, plays: 5, minutes: 24, missingRuntimePlays: 4 });
  });
  it('keeps specials distinct from regular episodes and ignores invalid plays', () => {
    expect(animeHistoryStats([play(1), { ...play(2), episode: { season: 0, number: 1, runtime: 45 } }, { ...play(3), episode: { season: -1, number: 1 } }, play(-1)], identities))
      .toMatchObject({ episodes: 2, plays: 2, minutes: 69 });
  });
});
describe('private Trakt history import', () => {
  it('paginates all history, deduplicates page overlaps and isolates the aggregate cache by account', async () => {
    json.mockResolvedValueOnce({ data: [play(1), play(2, 2)], pages: 2 }).mockResolvedValueOnce({ data: [play(2, 2), play(3)], pages: 2 });
    expect(await getPersonalStats('user-a-secret')).toMatchObject({ episodes: 2, rewatches: 1, minutes: 72, partial: false });
    expect(json.mock.calls[1][0]).toContain('/users/me/history/episodes?page=2&limit=1000&extended=full');
    await getPersonalStats('user-b-secret');
    expect(JSON.stringify(cache.mock.calls)).not.toMatch(/user-[ab]-secret/);
    const calls = runtimeCacheMock().set.mock.calls;
    expect(calls[0][0]).not.toEqual(calls[1][0]);
    expect(calls[0][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(calls[0][2]).toEqual({ ttl: 900, tags: [expect.stringMatching(/^my-anime:[a-f0-9]{64}$/)] });

  });
  it('returns a labeled subtotal when later pages or identities fail', async () => {
    json.mockResolvedValueOnce({ data: [play(1)], pages: 2 }).mockRejectedValueOnce(new Error('rate limited'));
    expect(await getPersonalStats('partial')).toMatchObject({ status: 'ready', episodes: 1, partial: true });
    resolve.mockResolvedValue({ identities: new Map(), unavailable: true, unmatched: 1 });
    expect(await getPersonalStats('unknown')).toMatchObject({ status: 'unavailable' });
  });
  it('does not present zero as a real total when the history cannot be loaded', async () => {
    json.mockRejectedValue(new Error('offline'));
    expect(await getPersonalStats('offline')).toMatchObject({ status: 'unavailable' });
    expect(resolve).not.toHaveBeenCalled();
  });
  it('coalesces simultaneous requests for the same account', async () => {
    let finish!: (result: unknown) => void;
    json.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const a = getPersonalStats('shared'), b = getPersonalStats('shared');
    await vi.waitFor(() => expect(json).toHaveBeenCalledTimes(1));
    finish({ data: [], pages: 1 });
    await Promise.all([a, b]);
  });
  it('does not let an unresponsive aggregate cache block a valid import', async () => {
    vi.useFakeTimers();
    runtimeCacheMock().get.mockImplementationOnce(() => new Promise(() => {}));
    runtimeCacheMock().set.mockImplementationOnce(() => new Promise(() => {}));
    const result = getPersonalStats('cache-stalled');
    await vi.advanceTimersByTimeAsync(1001);
    expect(await result).toMatchObject({ status: 'ready', episodes: 2, minutes: 72 });
  });
  it('bounds a stalled history lookup and allows the next attempt to recover', async () => {
    vi.useFakeTimers();
    json.mockImplementationOnce(() => new Promise(() => {}));
    const failed = getPersonalStats('history-stalled');
    await vi.advanceTimersByTimeAsync(8001);
    expect(await failed).toMatchObject({ status: 'unavailable' });
    expect(await getPersonalStats('history-stalled')).toMatchObject({ status: 'ready', episodes: 2 });
  });
  it('bounds the complete request even when catalog identification never settles', async () => {
    vi.useFakeTimers();
    resolve.mockImplementationOnce(() => new Promise(() => {}));
    const failed = getPersonalStats('catalog-stalled');
    await vi.advanceTimersByTimeAsync(22001);
    expect(await failed).toMatchObject({ status: 'unavailable' });
    expect(await getPersonalStats('catalog-stalled')).toMatchObject({ status: 'ready' });
  });
  it('does not cache a transient partial import as the final total', async () => {
    json.mockResolvedValueOnce({ data: [play(1)], pages: 2 }).mockRejectedValueOnce(new Error('temporary failure'));
    expect(await getPersonalStats('retry-partial')).toMatchObject({ partial: true });
    expect(runtimeCacheMock().set).not.toHaveBeenCalled();
    expect(await getPersonalStats('retry-partial')).toMatchObject({ partial: false, episodes: 2 });
  });
});
