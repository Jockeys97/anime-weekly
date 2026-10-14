import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', async () => import('./helpers/next-cache'));
import { primeImdbEpisode, readImdbEpisode } from '../lib/imdb-episodes';
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
it('does not cache missing ratings or quota failures, making the next scheduled refresh retryable', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ...data, imdbRating: 'N/A' })).mockResolvedValueOnce(Response.json({ Response: 'False', Error: 'Request limit reached!' })).mockResolvedValue(Response.json(data)); vi.stubGlobal('fetch', fetchMock);
  expect(await primeImdbEpisode('tt1', 'tt100')).toBeNull();
  await expect(primeImdbEpisode('tt1', 'tt100')).rejects.toMatchObject({ reason: 'quota' });
  expect(await primeImdbEpisode('tt1', 'tt100')).toMatchObject({ score: 9.1 });
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
