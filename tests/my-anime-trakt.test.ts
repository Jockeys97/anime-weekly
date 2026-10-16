import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/my-anime-auth', () => ({ traktFetch: vi.fn() }));
import { traktFetch } from '../lib/my-anime-auth';
import { traktJson } from '../lib/my-anime-trakt';
afterEach(() => vi.resetAllMocks());

it.each(['/users/me/history/episodes', '/users/me/watchlist/shows'])('accepts a confirmed empty paginated response (%s)', async path => {
  vi.mocked(traktFetch).mockResolvedValue(Response.json([], { headers: { 'X-Pagination-Page-Count': '0' } }));
  expect(await traktJson(path, 'private-token', 1000)).toEqual({ data: [], pages: 1 });
});
it.each(['-1', '1.5', 'invalid'])('rejects malformed pagination (%s)', async pages => {
  vi.mocked(traktFetch).mockResolvedValue(Response.json([], { headers: { 'X-Pagination-Page-Count': pages } }));
  await expect(traktJson('/users/me/history/episodes', 'private-token', 1000)).rejects.toThrow('Invalid pagination');
});
it('rejects contradictory zero-page data instead of truncating a populated history', async () => {
  vi.mocked(traktFetch).mockResolvedValue(Response.json([{ id: 1 }], { headers: { 'X-Pagination-Page-Count': '0' } }));
  await expect(traktJson('/users/me/history/episodes', 'private-token', 1000)).rejects.toThrow('Invalid pagination');
});
it('accepts no active scrobble without reporting an outage', async () => {
  vi.mocked(traktFetch).mockResolvedValue(new Response(null, { status: 204 }));
  expect(await traktJson('/users/me/watching', 'private-token', 1000)).toEqual({ data: null, pages: 1 });
});
