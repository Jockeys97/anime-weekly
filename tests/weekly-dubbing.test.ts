import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn() }));
vi.mock('../lib/anilist', () => ({ getAnime: vi.fn() }));
vi.mock('../lib/mydublist', () => ({ getDubbing: vi.fn() }));
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { getAnime } from '../lib/anilist';
import { getDubbing } from '../lib/mydublist';
import { getWeeklyDubbing } from '../lib/weekly-dubbing';
import { GET } from '../app/api/weekly-dubbing/route';
import { DubbingStatus } from '../components/DubbingStatus';
afterEach(() => vi.resetAllMocks());
const event = (mediaId: number) => ({ id: mediaId * 10, mediaId, episode: 4, airingAt: 1792850400 });

it('returns every airing season’s status in one response, using the snapshot MAL ID only for that exact season', async () => {
  vi.mocked(getWeeklyRatings).mockResolvedValue({ events: [event(195516), event(195604), event(7)], titles: {
    'tv:99': { anilistId: 195516, malId: 61987 }, 'tv:73223': { anilistId: 97940, malId: 34572 }, // first season: not used for 195604
  } } as never);
  vi.mocked(getAnime).mockImplementation(async id => (id === 195604 ? { id, idMal: 60000 } : null) as never);
  vi.mocked(getDubbing).mockImplementation(async (malId, language) => ({ status: malId === 61987 ? 'reported' : 'unverified', language, malId: malId! }));
  const result = await getWeeklyDubbing('2026-43', 'it');
  expect(Object.keys(result.statuses).sort()).toEqual(['195516', '195604']);
  expect(result.statuses[195516]).toMatchObject({ status: 'reported', malId: 61987 });
  expect(vi.mocked(getDubbing).mock.calls.map(([malId]) => malId).sort()).toEqual([60000, 61987]);
  expect(getAnime).not.toHaveBeenCalledWith(195516); // Known from the snapshot.
  expect(result.complete).toBe(true);
});
it('leaves out upstream failures so those cards fall back to their own lookup, and validates input', async () => {
  vi.mocked(getWeeklyRatings).mockResolvedValue({ events: [event(1)], titles: { 'tv:1': { anilistId: 1, malId: 11 } } } as never);
  vi.mocked(getDubbing).mockResolvedValue({ status: 'unverified', language: 'it', malId: 11, reason: 'upstream' });
  const response = await GET(new Request('https://example.com/api/weekly-dubbing?week=2026-43&locale=it'));
  expect(await response.json()).toEqual({ statuses: {}, complete: false });
  expect(response.headers.get('cache-control')).toContain('s-maxage=21600');
  expect((await GET(new Request('https://example.com/api/weekly-dubbing?week=2026-43&locale=xx'))).status).toBe(400);
});
it('shows a prefetched result at once for the calendar season, without a pending state', () => {
  const html = renderToStaticMarkup(createElement(DubbingStatus, { locale: 'it', anilistId: 195516, initial: { status: 'reported', language: 'it', malId: 61987 } }));
  expect(html).toContain('data-status="reported"');
  expect(renderToStaticMarkup(createElement(DubbingStatus, { locale: 'it', anilistId: 195516, initial: { status: 'reported', language: 'en', malId: 61987 } }))).toContain('data-status="pending"');
});
