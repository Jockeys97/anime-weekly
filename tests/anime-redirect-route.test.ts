import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anime-localized-titles', () => ({ getAnimeLocalizedTitles: vi.fn(async () => ({})) }));
vi.mock('../lib/anilist-resilient', () => ({ getAnimeWithSnapshot: vi.fn() }));
import { getAnimeWithSnapshot } from '../lib/anilist-resilient';
import { getAnimeLocalizedTitles } from '../lib/anime-localized-titles';
import { GET } from '../app/api/anime-redirect/[id]/route';

afterEach(() => vi.clearAllMocks());
const call = (id: string, locale = 'it') => GET(new Request(`https://weeklyanime.com/api/anime-redirect/${id}?locale=${locale}`), { params: Promise.resolve({ id }) });
const mou = { id: 203367, title: { english: null, romaji: 'Mou Ichido, Shitemitai', native: null }, genres: [] } as unknown as NonNullable<Awaited<ReturnType<typeof getAnimeWithSnapshot>>>;

it.each([['it', '/anime/203367-mou-ichido-shitemitai'], ['es', '/es/anime/203367-mou-ichido-shitemitai']])('308s to the slug and caches it (%s)', async (locale, path) => {
  vi.mocked(getAnimeWithSnapshot).mockResolvedValue(mou);
  const response = await call('203367', locale);
  expect(response.status).toBe(308);
  expect(response.headers.get('location')).toBe(`https://weeklyanime.com${path}`);
  expect(response.headers.get('cache-control')).toContain('s-maxage=86400');
});

it('uses a localized title when known', async () => {
  vi.mocked(getAnimeWithSnapshot).mockResolvedValue(mou);
  vi.mocked(getAnimeLocalizedTitles).mockResolvedValue({ fr: 'Encore une fois' });
  expect((await call('203367', 'fr')).headers.get('location')).toBe('https://weeklyanime.com/fr/anime/203367-encore-une-fois');
});

it.each(['Lookup timed out', 'AniList HTTP 429'])('answers %s with an uncached 503, never 500', async message => {
  vi.mocked(getAnimeWithSnapshot).mockRejectedValue(new Error(message));
  const response = await call('203367');
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('retry-after')).toBe('120');
});

it('returns 404 only for a confirmed missing id', async () => {
  vi.mocked(getAnimeWithSnapshot).mockResolvedValue(null);
  expect((await call('999999999')).status).toBe(404);
  expect((await call('0')).status).toBe(404);
});
