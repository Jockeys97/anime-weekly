import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
vi.mock('../lib/detail-availability', () => ({ getCachedDetailAvailability: vi.fn() }));
import { getAnime } from '../lib/anilist';
import { getCachedDetailAvailability } from '../lib/detail-availability';
import { GET } from '../app/api/anime-card/[id]/route';

const call = (id: string) => GET(new Request(`https://example.com/api/anime-card/${id}`), { params: Promise.resolve({ id }) });
const anime = { id: 21, idMal: 123, title: { english: 'Example', romaji: 'Example Original', native: null }, averageScore: 85, startDate: { year: 2026 }, seasonYear: 2026 } as Awaited<ReturnType<typeof getAnime>>;
afterEach(() => vi.resetAllMocks());
describe('catalog card enrichment', () => {
  it('preserves the exact AniList ID and score, IMDb lookup and regional watch options', async () => {
    vi.mocked(getAnime).mockResolvedValue(anime);
    const providers = { US: { link: 'https://www.themoviedb.org/tv/42/watch?locale=US', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] }, IT: { link: 'https://www.themoviedb.org/tv/42/watch?locale=IT', providers: [{ provider_id: 283, provider_name: 'Crunchyroll', logo_path: null }] } };
    vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: { id: 42, kind: 'tv' }, ratings: { imdbId: 'tt123', imdbRating: '8.6', imdbVotes: '100' }, providers, providersUnavailable: false });
    const response = await call('21');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ratings: { imdbId: 'tt123', imdbRating: '8.6', imdbVotes: '100', anilistId: 21, anilistScore: 85 }, availability: { match: { id: 42, kind: 'tv' }, providers, providersUnavailable: false } });
    expect(getCachedDetailAvailability).toHaveBeenCalledWith(anime);
  });
  it('keeps AniList available without inventing IMDb IDs or platforms when no match exists', async () => {
    vi.mocked(getAnime).mockResolvedValue(anime);
    vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: false });
    const response = await call('21');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ratings: { anilistId: 21, anilistScore: 85 }, availability: { match: null, providers: {}, providersUnavailable: false } });
  });
  it('preserves original-series offers when the sequel has no direct TMDB match', async () => {
    vi.mocked(getAnime).mockResolvedValue(anime);
    const seriesWatch = { id: 97525, kind: 'tv' as const, name: 'To Your Eternity', providers: {
      US: { link: 'https://www.themoviedb.org/tv/97525/watch?locale=US', providers: [{ provider_id: 283, provider_name: 'Crunchyroll', logo_path: null }] },
    }, providersUnavailable: false };
    vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: null, ratings: { imdbId: 'tt123', imdbRating: '8.6', imdbSeriesTitle: 'To Your Eternity' }, providers: {}, providersUnavailable: false, seriesWatch });
    const data = await (await call('21')).json();
    expect(data.availability).toEqual({ match: null, providers: {}, providersUnavailable: false, seriesWatch });
    expect(data.ratings).toMatchObject({ anilistId: 21, anilistScore: 85, imdbSeriesTitle: 'To Your Eternity' });
  });
  it('retains exact-season offers separately and never caches a failed original-series lookup', async () => {
    vi.mocked(getAnime).mockResolvedValue(anime);
    const direct = { US: { link: 'https://example.com/season', providers: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } };
    const seriesWatch = { id: 43, kind: 'tv' as const, name: 'Example', providers: {}, providersUnavailable: true };
    vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: { id: 42, kind: 'tv' }, ratings: { imdbRating: '8.6' }, providers: direct, providersUnavailable: false, seriesWatch });
    const response = await call('21');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).availability).toEqual({ match: { id: 42, kind: 'tv' }, providers: direct, providersUnavailable: false, seriesWatch });
  });
  it.each(['bad', '0', '-1', '2.5', '2147483648'])('rejects invalid ID %s before fetching', async id => {
    expect((await call(id)).status).toBe(400);
    expect(getAnime).not.toHaveBeenCalled();
  });
  it('does not cache unavailable anime or platform failures', async () => {
    vi.mocked(getAnime).mockResolvedValue(null);
    const missing = await call('21');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('no-store');
    vi.mocked(getAnime).mockResolvedValue(anime);
    vi.mocked(getCachedDetailAvailability).mockResolvedValue({ match: null, ratings: {}, providers: {}, providersUnavailable: true });
    expect((await call('21')).headers.get('cache-control')).toBe('no-store');
  });
});
