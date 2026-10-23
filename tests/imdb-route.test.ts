import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/imdb', () => ({ getImdbScore:vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getRatings:vi.fn() }));
vi.mock('../lib/anilist', () => ({ getAnime:vi.fn() }));
vi.mock('../lib/detail-availability', () => ({ getDetailAvailability:vi.fn() }));
import { getImdbScore } from '../lib/imdb';
import { GET } from '../app/api/imdb/route';
afterEach(() => vi.resetAllMocks());
it.each(['imdb=bad','imdb=tt123&anilist=21','tmdb=21&kind=bad','anilist=-2','anilist=999999999999'])('rejects invalid IMDb lookup %s', async query => {
  expect((await GET(new Request(`https://example.com/api/imdb?${query}`))).status).toBe(400);
  expect(getImdbScore).not.toHaveBeenCalled();
});
it('caches ready scores but not source failures', async () => {
  vi.mocked(getImdbScore).mockResolvedValueOnce({ imdbId:'tt123', imdbRating:'8', imdbStatus:'ready' }).mockResolvedValueOnce({ imdbId:'tt123', imdbStatus:'error' });
  const request = () => new Request('https://example.com/api/imdb?imdb=tt123');
  expect((await GET(request())).headers.get('cache-control')).toContain('s-maxage=21600');
  expect((await GET(request())).headers.get('cache-control')).toBe('no-store');
});
