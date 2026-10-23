import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/weekly-ratings', () => ({ getWeeklyRatings: vi.fn() }));
vi.mock('@/lib/week-archive', () => ({ readWeekArchive: vi.fn() }));
import { identityOnly, mergeIdentityFallback } from '@/lib/weekly-id-fallback';

describe('weekly id fallback', () => {
  it('keeps only identity fields', () => {
    expect(identityOnly({ anilistId: 1, malId: 2, imdbId: 'tt1', anilistScore: 80, imdbRating: '8.1' })).toEqual({ anilistId: 1, malId: 2, imdbId: 'tt1' });
  });
  it('fills missing ids without overriding current data or copying scores', () => {
    const merged = mergeIdentityFallback({ titles: { 'tv:2': { anilistId: 22 } }, events: [] }, [{ titles: { 'tv:1': { anilistId: 11, malScore: 9 }, 'tv:2': { anilistId: 99 }, 'tv:3': { malScore: 5 } }, events: [] }]);
    expect(merged.titles).toEqual({ 'tv:1': { anilistId: 11 }, 'tv:2': { anilistId: 22 } });
  });
  it('returns the same object when nothing is added', () => {
    const current = { titles: {}, events: [] };
    expect(mergeIdentityFallback(current, [])).toBe(current);
  });
});
