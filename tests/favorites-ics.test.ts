import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/anilist', async () => ({ ...(await vi.importActual<object>('../lib/anilist')), getFavoriteAnime: vi.fn() }));
vi.mock('../lib/upcoming-airings', () => ({ getUpcomingAirings: vi.fn() }));
import { getFavoriteAnime } from '../lib/anilist';
import { getUpcomingAirings } from '../lib/upcoming-airings';
import { GET } from '../app/api/ics/favorites/route';
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
const title = (english: string) => ({ english, romaji: null, native: null });

it('subscribes to the upcoming episodes of airing favourites, following finished seasons to their sequel', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  vi.mocked(getFavoriteAnime).mockResolvedValue({ unavailable: false, media: [
    { id: 97940, title: title('Black Clover'), format: 'TV', status: 'FINISHED', episodes: 170, relations: { edges: [{ relationType: 'SEQUEL', node: { id: 195604, title: title('Black Clover Season 2'), format: 'TV', status: 'RELEASING' } }] } },
    { id: 5, title: title('Old Show'), format: 'TV', status: 'FINISHED', episodes: 12, relations: { edges: [] } },
  ] } as never);
  vi.mocked(getUpcomingAirings).mockResolvedValue([
    { uid: 'anilist-195604-episode-3@anime-weekly', title: 'x', episode: 3, airingAt: Date.parse('2026-10-18T15:00:00Z') / 1000 },
    { uid: 'anilist-195604-episode-4@anime-weekly', title: 'x', episode: 4, airingAt: Date.parse('2026-10-25T15:00:00Z') / 1000 },
  ]);
  const response = await GET(new Request('https://example.com/api/ics/favorites?ids=anilist:97940,anilist:5,tv:1'));
  const body = await response.text();
  expect(response.headers.get('content-type')).toContain('text/calendar');
  expect(getUpcomingAirings).toHaveBeenCalledTimes(1);
  expect(getUpcomingAirings).toHaveBeenCalledWith(195604);
  expect(body).toContain('X-WR-CALNAME:Weekly Anime · I miei preferiti');
  expect(body).toContain('anilist-195604-episode-4@anime-weekly');
  expect(body).not.toContain('episode-3@'); // Already aired.
  expect(body).toMatch(/SUMMARY:Black Clover Season 2/);
});
it('rejects a request without AniList favourites', async () => {
  expect((await GET(new Request('https://example.com/api/ics/favorites?ids=tv:1'))).status).toBe(400);
});
