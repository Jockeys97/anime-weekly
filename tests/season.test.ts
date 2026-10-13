import { describe, expect, it } from 'vitest';
import { currentSeason, parseSeason, seasonPath, shiftSeason } from '../lib/season';

describe('anime seasons in UTC', () => {
  it.each([
    ['2026-01-01', 'winter'], ['2026-03-31', 'winter'],
    ['2026-04-01', 'spring'], ['2026-06-30', 'spring'],
    ['2026-07-01', 'summer'], ['2026-09-30', 'summer'],
    ['2026-10-01', 'fall'], ['2026-12-31', 'fall'],
  ])('maps %s to %s', (date, season) => {
    expect(currentSeason(new Date(date))).toEqual({ year: 2026, season });
  });
  it('navigates across years in both directions', () => {
    expect(shiftSeason({ year: 2026, season: 'winter' }, -1)).toEqual({ year: 2025, season: 'fall' });
    expect(shiftSeason({ year: 2026, season: 'fall' }, 1)).toEqual({ year: 2027, season: 'winter' });
    expect(shiftSeason({ year: 2026, season: 'spring' }, 1)).toEqual({ year: 2026, season: 'summer' });
    expect(shiftSeason({ year: 2026, season: 'summer' }, -1)).toEqual({ year: 2026, season: 'spring' });
  });
  it('validates route parameters and formats links', () => {
    expect(parseSeason('2026', 'fall')).toEqual({ year: 2026, season: 'fall' });
    expect(seasonPath({ year: 2026, season: 'fall' })).toBe('/season/2026/fall');
    for (const [year, season] of [['0000', 'fall'], ['26', 'fall'], ['2026', 'autumn'], ['2026', 'FALL']]) {
      expect(parseSeason(year, season)).toBeNull();
    }
  });
});
