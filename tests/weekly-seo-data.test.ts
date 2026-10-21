import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn() }));
vi.mock('../lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn(), WEEKLY_PAGE_TAG: 'weekly-page' }));
vi.mock('../lib/week-archive', () => ({ readWeekArchive: vi.fn(), listArchivedWeeks: vi.fn(), WEEK_ARCHIVE_TAG: 'archive', WEEK_ARCHIVE_LIST_TAG: 'archives' }));
import { readWeekArchive, listArchivedWeeks, type WeekArchive } from '../lib/week-archive';
import { getQuickWeekData, type AnimeTitle } from '../lib/tmdb';
import { getWeeklyRatings } from '../lib/weekly-ratings';
import { getAnimeWeekAppearances, getSeoWeek, getSeoWeeks } from '../lib/weekly-seo-data';
const anime = { id: 10, kind: 'tv', name: 'Actual title', ratings: {} } as AnimeTitle;
const archive = { week: '2026-42', savedAt: '2026-10-19T00:00:00Z', data: { status: 'ready', titles: [anime] }, ratings: { titles: { 'tv:10': { anilistId: 21, imdbRating: '8.1', imdbVotes: '1,001' } }, events: [] } } as unknown as WeekArchive;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
  vi.mocked(readWeekArchive).mockResolvedValue(null);
  vi.mocked(listArchivedWeeks).mockResolvedValue([]);
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [] });
  vi.mocked(getWeeklyRatings).mockResolvedValue({ titles: {}, events: [] });
});
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
it('rejects invalid/future weeks before any I/O and omits empty/error weeks', async () => {
  for (const slug of ['bad', '2026-54', '2026-44']) expect(await getSeoWeek(slug)).toBeNull();
  expect(readWeekArchive).not.toHaveBeenCalled(); expect(getQuickWeekData).not.toHaveBeenCalled();
  expect(await getSeoWeek('2026-43')).toBeNull();
  vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'error', titles: [anime] });
  expect(await getSeoWeek('2026-43')).toBeNull();
});
it('uses the frozen archive score and identity without live discovery or ratings', async () => {
  vi.mocked(readWeekArchive).mockResolvedValue(archive);
  const data = await getSeoWeek('2026-42');
  expect(data?.rankings.imdb[0]).toMatchObject({ anilistId: 21, score: 8.1, votes: 1001 });
  expect(getQuickWeekData).not.toHaveBeenCalled(); expect(getWeeklyRatings).not.toHaveBeenCalled();
});
it('indexes only actual memberships and marks rankings only if the anime qualifies', async () => {
  vi.mocked(listArchivedWeeks).mockResolvedValue([{ week: '2026-42', uploadedAt: archive.savedAt, titleCount: 1 }]);
  vi.mocked(readWeekArchive).mockImplementation(async week => week.week === 42 ? archive : null);
  expect(await getSeoWeeks()).toEqual([{ week: '2026-42', titleCount: 1, rankingCount: 1, uploadedAt: archive.savedAt }]);
  expect(await getAnimeWeekAppearances(21)).toEqual([{ week: '2026-42', ranked: true }]);
  expect(await getAnimeWeekAppearances(99)).toEqual([]);
});
