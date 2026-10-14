import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
import { parseAnimeFilters, searchHref } from '../lib/anime-search';

describe('shareable catalog filters', () => {
  it('supports discovery without a title and relevance with a title', () => {
    expect(parseAnimeFilters({})).toMatchObject({ q: '', sort: 'popular', page: 1 });
    expect(parseAnimeFilters({ q: ' Naruto ' })).toMatchObject({ q: 'Naruto', sort: 'relevance' });
  });
  it('ignores invalid or repeated parameters rather than forwarding them upstream', () => {
    const f = parseAnimeFilters({ q: ['one','two'], genre: 'unknown', format: 'MANGA', year: '99999', minScore: '99', status: 'bad', season: 'bad', sort: 'injected', page: '-2' });
    expect(f).toEqual({ q: '', genre: undefined, format: undefined, year: undefined, minScore: undefined, status: undefined, season: undefined, sort: 'popular', page: 1 });
  });
  it('keeps all filters during pagination and encodes the title', () => {
    const filters = parseAnimeFilters({ q: 'Attack & Titan', genre: 'Action', format: 'TV', status: 'FINISHED', season: 'FALL', year: '2020', minScore: '8', sort: 'score', page: '3' });
    const url = new URL(searchHref(filters, 4), 'https://example.com');
    expect(url.searchParams.get('q')).toBe('Attack & Titan');
    expect(url.searchParams.get('page')).toBe('4');
    expect(url.searchParams.get('genre')).toBe('Action');
    expect(url.searchParams.get('minScore')).toBe('8');
    expect(url.searchParams.get('year')).toBe('2020');
  });
});

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('filtered AniList queries', () => {
  it('applies filters on the whole catalog with inclusive minimum score and pagination', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: { media: [{ id: 21 }], pageInfo: { hasNextPage: true } } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { discoverAnime } = await import('../lib/anilist');
    const filters = parseAnimeFilters({ genre:'Action', year:'2020', season:'FALL', format:'TV', status:'FINISHED', minScore:'8', sort:'score', page:'2' });
    expect(await discoverAnime(filters)).toMatchObject({ media: [{ id:21 }], pageInfo: { currentPage:2, hasNextPage:true } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual({ page:2, genre:'Action', seasonYear:2020, season:'FALL', format:'TV', status:'FINISHED', averageScore_greater:79, sort:'SCORE_DESC' });
    expect(body.query).toContain('perPage: 20');
    expect(body.query).toContain('averageScore_greater: $averageScore_greater');
  });
  it('omits unset filters rather than sending null filters to AniList', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { Page: { media: [], pageInfo: {} } } }));
    vi.stubGlobal('fetch', fetchMock);
    const { discoverAnime } = await import('../lib/anilist');
    await discoverAnime(parseAnimeFilters({}));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.variables).toEqual({ page:1, sort:'POPULARITY_DESC' });
    expect(body.query).not.toContain('genre:');
    expect(body.query).not.toContain('search:');
  });
  it('distinguishes an upstream failure from a valid empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ errors:[{message:'unavailable'}] })));
    const { discoverAnime } = await import('../lib/anilist');
    expect(await discoverAnime(parseAnimeFilters({}))).toMatchObject({ unavailable:true, media:[] });
  });
});
