import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
import { primeImdbEpisode, readImdbEpisode, readImdbEpisodeAttempt } from '../lib/imdb-episodes';
const data = { Response: 'True', Type: 'episode', imdbID: 'tt1', seriesID: 'tt100', Title: 'A real episode', Season: '2', Episode: '12', imdbRating: '9.1', imdbVotes: '1,230' };
beforeEach(async () => { (await import('./helpers/next-cache')).clearNextCache(); vi.stubEnv('OMDB_API_KEY', 'fixture'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('validates exact episode and parent IDs rather than trusting shared season numbering', () => {
  expect(readImdbEpisode(data, 'tt1', 'tt100')).toEqual({ title: 'A real episode', season: 2, episode: 12, score: 9.1, votes: 1230 });
  for (const wrong of [{ Type: 'series' }, { imdbID: 'tt2' }, { seriesID: 'tt200' }, { imdbRating: 'N/A' }, { imdbRating: '11' }, { imdbVotes: '0' }, { Episode: '0' }, { Season: '' }]) expect(readImdbEpisode({ ...data, ...wrong }, 'tt1', 'tt100')).toBeNull();
});
it('caches only positive episode results separately from series scores', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  expect(await primeImdbEpisode('tt1', 'tt100')).toMatchObject({ score: 9.1 });
  await primeImdbEpisode('tt1', 'tt100');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0].searchParams.get('type')).toBe('episode');
});
it('caches missing ratings and errors for the day and retries on the next day', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ...data, imdbRating: 'N/A' })).mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Request limit reached!' })).mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-14')).toBeNull();
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-14')).toBeNull();
  await expect(primeImdbEpisode('tt1', 'tt100', '2026-10-15')).rejects.toMatchObject({ reason: 'quota' });
  await expect(primeImdbEpisode('tt1', 'tt100', '2026-10-15')).rejects.toMatchObject({ reason: 'quota' });
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-16')).toMatchObject({ score: 9.1 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('uses one vendor request per episode per day, even if the cron is run again manually', async () => {
  const fetchMock = vi.fn(async () => Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  await primeImdbEpisode('tt1', 'tt100', '2026-10-14');
  await primeImdbEpisode('tt1', 'tt100', '2026-10-14');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await primeImdbEpisode('tt1', 'tt100', '2026-10-15');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('never calls OMDb through the cache-only reader', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  expect(await readImdbEpisodeAttempt('tt1', 'tt100', '2026-10-14')).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  await primeImdbEpisode('tt1', 'tt100', '2026-10-14');
  expect(await readImdbEpisodeAttempt('tt1', 'tt100', '2026-10-14')).toMatchObject({ state: 'rated' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('recovers an OMDb data error via parent coordinates only when the exact episode identity agrees', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Error getting data.' })).mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  const coordinates = { season: 4, episode: 60 };
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-14', coordinates)).toMatchObject({ season: 2, episode: 12, score: 9.1 });
  expect(fetchMock.mock.calls[1][0].searchParams.get('i')).toBe('tt100');
  expect(fetchMock.mock.calls[1][0].searchParams.get('Season')).toBe('4');
  await primeImdbEpisode('tt1', 'tt100', '2026-10-14', coordinates);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it('rejects a fallback which finds a different episode even when series and numbering look right', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Episode not found!' })).mockResolvedValue(Response.json({ ...data, imdbID: 'tt2' })); vi.stubGlobal('fetch', fetchMock);
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-14', { season: 2, episode: 12 })).toBeNull();
});
it.each(['Request limit reached!', 'Invalid API key!'])('does not spend a fallback request on quota or authentication failure: %s', async Error => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ Response: 'False', Error })); vi.stubGlobal('fetch', fetchMock);
  await expect(primeImdbEpisode('tt1', 'tt100', '2026-10-14', { season: 2, episode: 12 })).rejects.toBeInstanceOf(globalThis.Error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('does not retry a valid episode with no votes through a potentially different season', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...data, imdbRating: 'N/A' })); vi.stubGlobal('fetch', fetchMock);
  expect(await primeImdbEpisode('tt1', 'tt100', '2026-10-14', { season: 2, episode: 12 })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
