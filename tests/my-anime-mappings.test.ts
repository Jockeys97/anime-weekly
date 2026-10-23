import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { anilistFetch } = vi.hoisted(() => ({ anilistFetch: vi.fn() }));
vi.mock('@/lib/rate-limited-fetch', () => ({ anilistFetch }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { getAnimeMappings } from '../lib/anilist';
beforeEach(() => {
  anilistFetch.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must stay offline'); }));
});
afterEach(() => vi.unstubAllGlobals());

describe('personal AniList ID mappings', () => {
  it('batches, deduplicates and validates IDs while requesting idMal and all names', async () => {
    anilistFetch.mockImplementation(async (_url, init) => {
      const { variables } = JSON.parse(init.body);
      return Response.json({ data: { Page: { media: variables.ids.map((id: number) => ({ id, idMal: id + 1000,
        title: { romaji: `Anime ${id}`, english: null, native: null } })), pageInfo: { hasNextPage: false } } } });
    });
    const ids = Array.from({ length: 51 }, (_, index) => index + 1);
    const result = await getAnimeMappings([...ids, 1, 0, -1, NaN]);
    expect(result.media).toHaveLength(51); expect(result.unavailable).toBe(false);
    expect(anilistFetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(anilistFetch.mock.calls[0][1].body);
    expect(first.variables.ids).toHaveLength(50);
    expect(first.query).toContain('id_in: $ids'); expect(first.query).toContain('idMal');
    expect(first.query).toContain('title { romaji english native }');
    expect(anilistFetch.mock.calls[0][1].next).toEqual({ revalidate: 86400 });
  });
  it('uses MAL IDs as GraphQL variables and rejects mismatched upstream entries', async () => {
    anilistFetch.mockResolvedValue(Response.json({ data: { Page: { media: [
      { id: 21, idMal: 123, title: { romaji: 'Anime' } }, { id: 99, idMal: 999, title: { romaji: 'Other' } },
    ], pageInfo: { hasNextPage: false } } } }));
    const result = await getAnimeMappings([123], true);
    expect(result.media.map(anime => anime.id)).toEqual([21]);
    expect(JSON.parse(anilistFetch.mock.calls[0][1].body)).toMatchObject({ variables: { ids: [123] } });
    expect(JSON.parse(anilistFetch.mock.calls[0][1].body).query).toContain('idMal_in: $ids');
  });
  it('skips empty lists and reports failure or truncated results', async () => {
    expect(await getAnimeMappings([])).toEqual({ media: [], unavailable: false });
    expect(anilistFetch).not.toHaveBeenCalled();
    anilistFetch.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await getAnimeMappings([21])).unavailable).toBe(true);
    anilistFetch.mockResolvedValue(Response.json({ data: { Page: { media: [], pageInfo: { hasNextPage: true } } } }));
    expect((await getAnimeMappings([21])).unavailable).toBe(true);
  });
});
