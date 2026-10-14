import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../lib/imdb', () => ({ getImdbScore: vi.fn() }));
vi.mock('../lib/tmdb', () => ({ getRatings: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
vi.mock('../lib/detail-availability', () => ({ getDetailAvailability: vi.fn() }));
import { getImdbScore } from '../lib/imdb';
import { getRatings } from '../lib/tmdb';
import { GET } from '../app/api/imdb/route';
afterEach(() => vi.resetAllMocks());
it('never CDN-caches upstream errors or an unavailable score', async () => {
  for (const status of ['error', 'unavailable'] as const) {
    vi.mocked(getImdbScore).mockResolvedValue({ imdbId: 'tt123', imdbStatus: status });
    const response = await GET(new Request('https://example.com/api/imdb?imdb=tt123'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).imdbStatus).toBe(status);
  }
});
it('rechecks the TMDB mapping on an explicit retry', async () => {
  vi.mocked(getRatings).mockResolvedValue({ imdbId: 'tt123', imdbRating: '8', imdbStatus: 'ready' });
  const response = await GET(new Request('https://example.com/api/imdb?tmdb=12&kind=tv'));
  expect(getRatings).toHaveBeenCalledWith('tv', 12, 3600, true);
  expect((await response.json()).imdbRating).toBe('8');
});
it.each(['', 'imdb=bad', 'anilist=-1', 'tmdb=12&kind=unknown', 'imdb=tt123&anilist=1'])('rejects ambiguous or invalid lookups: %s', async query => {
  expect((await GET(new Request(`https://example.com/api/imdb?${query}`))).status).toBe(400);
  expect(getImdbScore).not.toHaveBeenCalled(); expect(getRatings).not.toHaveBeenCalled();
});
