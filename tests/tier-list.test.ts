import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/api/tier-image/route';
import { DEFAULT_TIERS, emptyBoard, isAllowedTierImage, moveItem, parseBoard, tierListPath, tierSeasonFromQuery, tierStorageKey } from '../lib/tier-list';
import { localePath } from '../lib/locale-routing';
import { getDictionary, locales } from '../lib/i18n';

const fallback = { year: 2026, season: 'fall' } as const;

describe('tier list model', () => {
  it('reads the season from the query and falls back on invalid input', () => {
    expect(tierSeasonFromQuery('Summer', '2025', fallback)).toEqual({ year: 2025, season: 'summer' });
    expect(tierSeasonFromQuery('monsoon', '2025', fallback)).toBe(fallback);
    expect(tierSeasonFromQuery('summer', '25', fallback)).toBe(fallback);
    expect(tierSeasonFromQuery(['summer'], '2025', fallback)).toBe(fallback);
  });
  it('builds localized links and per-season storage keys', () => {
    expect(localePath(tierListPath(fallback), 'it')).toBe('/tier-list?season=fall&year=2026');
    expect(localePath(tierListPath(fallback), 'de')).toBe('/de/tier-list?season=fall&year=2026');
    expect(tierStorageKey(fallback)).not.toBe(tierStorageKey({ year: 2026, season: 'summer' }));
  });
  it('keeps English default labels and the reference colors', () => {
    expect(emptyBoard().tiers.map(tier => [tier.label, tier.color])).toEqual([
      ['AMAZING!', '#ff7f7f'], ['CHECK IT OUT!', '#ffbf7f'], ['ENJOYING', '#ffdf7f'], ['NOT BAD', '#7fffff'], ['MIXED FEELINGS', '#bfff7f'], ['DROPPED', '#bf7fff'],
    ]);
  });
  it('sanitizes stored boards', () => {
    const raw = JSON.stringify({ tiers: [{ id: 's', label: '  Peak   anime ' }, { id: 'a', label: '   ' }, { id: 'zz', label: 'x' }], rows: { s: [1, 2, 99, 1, 'x'], a: [2, 3], zz: [4] } });
    const board = parseBoard(raw, [1, 2, 3, 4]);
    expect(board.tiers[0].label).toBe('Peak anime');
    expect(board.tiers[1].label).toBe(DEFAULT_TIERS[1].label);
    expect(board.rows).toMatchObject({ s: [1, 2], a: [3], b: [] });
    expect(board.rows.zz).toBeUndefined();
    expect(parseBoard('{not json', [1])).toEqual(emptyBoard());
  });
  it('moves items between rows, before other items and back to the pool', () => {
    let board = moveItem(emptyBoard(), 1, 's');
    board = moveItem(board, 2, 's');
    board = moveItem(board, 3, 's', 2);
    expect(board.rows.s).toEqual([1, 3, 2]);
    board = moveItem(board, 1, 'f');
    expect(board.rows).toMatchObject({ s: [3, 2], f: [1] });
    board = moveItem(board, 3, null);
    expect(Object.values(board.rows).flat()).toEqual([2, 1]);
  });
  it.each(locales)('translates every tier list string for %s', locale => {
    expect(Object.keys(getDictionary(locale).tierList).sort()).toEqual(Object.keys(getDictionary('en').tierList).sort());
    expect(Object.values(getDictionary(locale).tierList).every(value => value.length > 0)).toBe(true);
  });
});

describe('tier image proxy', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts only TMDB posters and AniList covers over https', () => {
    expect(isAllowedTierImage('https://image.tmdb.org/t/p/w342/abc.jpg')).toBe(true);
    expect(isAllowedTierImage('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1.jpg')).toBe(true);
    expect(isAllowedTierImage('http://image.tmdb.org/t/p/w342/abc.jpg')).toBe(false);
    expect(isAllowedTierImage('https://image.tmdb.org.evil.com/t/p/a.jpg')).toBe(false);
    expect(isAllowedTierImage('https://user@image.tmdb.org/t/p/a.jpg')).toBe(false);
    expect(isAllowedTierImage('https://image.tmdb.org:8443/t/p/a.jpg')).toBe(false);
    expect(isAllowedTierImage('https://example.com/a.jpg')).toBe(false);
  });
  it('rejects other hosts without fetching', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const response = await GET(new Request('http://localhost/api/tier-image?url=' + encodeURIComponent('http://169.254.169.254/latest')));
    expect(response.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns allowed images with cache headers and refuses non-images', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })));
    const url = 'http://localhost/api/tier-image?url=' + encodeURIComponent('https://image.tmdb.org/t/p/w342/abc.jpg');
    const ok = await GET(new Request(url));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');
    expect(ok.headers.get('cache-control')).toContain('s-maxage');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect((await GET(new Request(url))).status).toBe(502);
  });
});
