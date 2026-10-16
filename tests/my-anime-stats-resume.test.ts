import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { stored, json, identities, nesting } = vi.hoisted(() => ({ stored: new Map<string, unknown>(), json: vi.fn(), identities: vi.fn(), nesting: { depth: 0 } }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>, key: string[]) => async () => {
  const id = JSON.stringify(key);
  // Match Next's real semantics: nested unstable_cache callbacks skip reads.
  const nested = nesting.depth > 0;
  if (!nested && stored.has(id)) return stored.get(id);
  nesting.depth++;
  try { const result = await fn(); stored.set(id, result); return result; }
  finally { nesting.depth--; }
} }));
vi.mock('../lib/my-anime-trakt', () => ({ traktJson: json }));
vi.mock('../lib/my-anime-identity', () => ({ resolvePersonalAnime: identities }));
import { getPersonalStats } from '../lib/my-anime-stats';
const show = { title: 'Anime', ids: { trakt: 7 } };
const play = (id: number) => ({ id, type: 'episode', show, episode: { season: 1, number: id, runtime: 24 } });
beforeEach(() => {
  stored.clear(); nesting.depth = 0; vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  identities.mockResolvedValue({ identities: new Map([[7, { id: 21, title: 'Anime', poster: null }]]), unmatched: 0, unavailable: false, deferred: false });
});
afterEach(() => vi.useRealTimers());
it('resumes a long import from cached private pages, preserving the same end_at and final totals', async () => {
  json.mockImplementationOnce(async () => { vi.advanceTimersByTime(8001); return { data: [play(1)], pages: 2 }; })
    .mockResolvedValueOnce({ data: [play(2)], pages: 2 });
  expect(await getPersonalStats('resume-account')).toMatchObject({ syncing: true, partial: true, episodes: 1 });
  expect(json).toHaveBeenCalledTimes(1);
  expect(await getPersonalStats('resume-account')).toMatchObject({ syncing: false, partial: false, episodes: 2, minutes: 48 });
  expect(json).toHaveBeenCalledTimes(2);
  const urls = json.mock.calls.map(([path]) => new URL(path, 'https://api.trakt.tv'));
  expect(urls[0].searchParams.get('page')).toBe('1'); expect(urls[1].searchParams.get('page')).toBe('2');
  expect(urls[1].searchParams.get('end_at')).toBe(urls[0].searchParams.get('end_at'));
  await getPersonalStats('resume-account'); expect(json).toHaveBeenCalledTimes(2);
});
