import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn() }));
vi.mock('../lib/upcoming-airings', () => ({ getUpcomingAirings: vi.fn() }));
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { getUpcomingAirings } from '../lib/upcoming-airings';
import { GET as weekGet } from '../app/api/ics/week/[week]/route';
import { GET as animeGet } from '../app/api/ics/anime/[id]/route';
const request = new Request('http://localhost');
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
it('downloads only cached week events within UTC boundaries and resolves cached names', async () => {
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: { 'tv:1': { anilistId: 21 } }, names: { 'tv:1': 'Ranma ½' }, events: [
    { id: 1, mediaId: 21, episode: 2, airingAt: Date.parse('2026-10-14T15:00:00Z') / 1000 },
    { id: 2, mediaId: 21, episode: 1, airingAt: Date.parse('2026-10-11T23:59:00Z') / 1000 },
    { id: 3, mediaId: 21, episode: 3, airingAt: Date.parse('2026-10-19T00:00:00Z') / 1000 },
  ] });
  const response = await weekGet(request, { params: Promise.resolve({ week: '2026-42' }) });
  const body = await response.text();
  expect(body).toContain('SUMMARY:Ranma ½ – Ep 2');
  expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(getWeeklyRatings).toHaveBeenCalledExactlyOnceWith('2026-42');
});
it('handles cold snapshots and validates week/id before reading caches', async () => {
  expect((await weekGet(request, { params: Promise.resolve({ week: 'bad' }) })).status).toBe(400);
  expect(getWeeklyRatings).not.toHaveBeenCalled();
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: {}, events: [] });
  expect(await (await weekGet(request, { params: Promise.resolve({ week: '2026-42' }) })).text()).not.toContain('BEGIN:VEVENT');
  expect((await animeGet(request, { params: Promise.resolve({ id: '2147483648' }) })).status).toBe(400);
  expect(getUpcomingAirings).not.toHaveBeenCalled();
});
it('downloads future anime episodes and exposes upstream failure without a misleading empty download', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.mocked(getUpcomingAirings).mockResolvedValue([{ uid: 'test', title: 'Example', episode: 2, airingAt: Date.parse('2026-10-14T15:00:00Z') / 1000 }]);
  expect(await (await animeGet(request, { params: Promise.resolve({ id: '21' }) })).text()).toContain('SUMMARY:Example – Ep 2');
  vi.mocked(getUpcomingAirings).mockRejectedValue(new Error('offline'));
  expect((await animeGet(request, { params: Promise.resolve({ id: '21' }) })).status).toBe(502);
});
