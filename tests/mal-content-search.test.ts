import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('@/lib/mal-content', () => ({ readMildNudityIds: vi.fn(), readHentaiIds: vi.fn() }));
vi.mock('@/lib/rate-limited-fetch', () => ({ anilistFetch: vi.fn() }));
import { readHentaiIds, readMildNudityIds } from '@/lib/mal-content';
import { anilistFetch } from '@/lib/rate-limited-fetch';
import { discoverAnime } from '@/lib/anilist';
import { parseAnimeFilters, searchHref } from '@/lib/anime-search';
beforeEach(() => { vi.resetAllMocks(); });
it('keeps the exact R+ filter in shared URLs and all pagination links, ignoring unrecognized values', () => {
  const filters = parseAnimeFilters({ malRating: 'r-plus', genre: 'Action', year: '2026', page: '4' });
  expect(filters.malRating).toBe('r-plus'); expect(searchHref(filters, 5)).toContain('malRating=r-plus');
  expect(new URL(searchHref(filters, 5), 'https://example.test').searchParams.get('page')).toBe('5');
  expect(parseAnimeFilters({ malRating: 'rx' }).malRating).toBeUndefined();
  expect(parseAnimeFilters({ malRating: ['r-plus', 'rx'] }).malRating).toBeUndefined();
});
it('filters the entire AniList catalog by verified MAL IDs before sorting and 20-result pagination', async () => {
  vi.mocked(readMildNudityIds).mockResolvedValue([11, 22, 33]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { Page: { media: [{ id: 1, idMal: 11 }], pageInfo: { hasNextPage: true } } } }));
  const filters = parseAnimeFilters({ malRating: 'r-plus', genre: 'Action', year: '2026', minScore: '8', page: '2' });
  expect((await discoverAnime(filters)).pageInfo).toMatchObject({ currentPage: 2, hasNextPage: true });
  const body = JSON.parse(vi.mocked(anilistFetch).mock.calls[0][1]!.body as string);
  expect(body.query).toContain('idMal_in: $malIds'); expect(body.query).toContain('perPage: 20');
  expect(body.variables).toMatchObject({ malIds: [11, 22, 33], genres: ['Action'], seasonYear: 2026, averageScore_greater: 79, page: 2 });
});
it('shows an unavailable search when the verification index is missing, without guessing classifications', async () => {
  vi.mocked(readMildNudityIds).mockResolvedValue(null);
  expect(await discoverAnime(parseAnimeFilters({ malRating: 'r-plus' }))).toMatchObject({ unavailable: true, media: [] });
  expect(anilistFetch).not.toHaveBeenCalled();
});
it('does not touch the MAL index for ordinary searches', async () => {
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }));
  await discoverAnime(parseAnimeFilters({})); expect(readMildNudityIds).not.toHaveBeenCalled();
});

it('rejects a response containing an unverified or different-season MAL identity', async () => {
  vi.mocked(readMildNudityIds).mockResolvedValue([11]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { Page: { media: [{ id: 1, idMal: 22 }], pageInfo: { hasNextPage: false } } } }));
  expect(await discoverAnime(parseAnimeFilters({ malRating: 'r-plus' }))).toMatchObject({ unavailable: true, media: [] });
});

it('parses the Hx filter and keeps it in pagination links', () => {
  const filters = parseAnimeFilters({ malRating: 'hx', page: '2' });
  expect(filters.malRating).toBe('hx'); expect(searchHref(filters, 3)).toContain('malRating=hx');
  expect(parseAnimeFilters({ malRating: ['r-plus', 'hx'] }).malRating).toBeUndefined();
});
it('filters by the Hx MAL allowlist and switches AniList to adult media only', async () => {
  vi.mocked(readHentaiIds).mockResolvedValue([188, 203]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { Page: { media: [{ id: 1, idMal: 188 }], pageInfo: { hasNextPage: false } } } }));
  expect((await discoverAnime(parseAnimeFilters({ malRating: 'hx' }))).unavailable).toBeFalsy();
  const body = JSON.parse(vi.mocked(anilistFetch).mock.calls[0][1]!.body as string);
  expect(body.query).toContain('isAdult: true'); expect(body.query).toContain('idMal_in: $malIds');
  expect(body.variables.malIds).toEqual([188, 203]); expect(readMildNudityIds).not.toHaveBeenCalled();
});
it('keeps R+ and ordinary searches non-adult', async () => {
  vi.mocked(readMildNudityIds).mockResolvedValue([11]);
  vi.mocked(anilistFetch).mockResolvedValue(Response.json({ data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }));
  await discoverAnime(parseAnimeFilters({ malRating: 'r-plus' })); await discoverAnime(parseAnimeFilters({}));
  for (const call of vi.mocked(anilistFetch).mock.calls) expect(JSON.parse(call[1]!.body as string).query).toContain('isAdult: false');
  expect(readHentaiIds).not.toHaveBeenCalled();
});
it('shows unavailable when the Hx index is missing', async () => {
  vi.mocked(readHentaiIds).mockResolvedValue(null);
  expect(await discoverAnime(parseAnimeFilters({ malRating: 'hx' }))).toMatchObject({ unavailable: true, media: [] });
  expect(anilistFetch).not.toHaveBeenCalled();
});
