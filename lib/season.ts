export const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const;
export type Season = typeof SEASONS[number];
export interface AnimeSeason { year: number; season: Season }

export function isSeason(value: string): value is Season {
  return SEASONS.some(season => season === value);
}

export function parseSeason(year: string, season: string): AnimeSeason | null {
  if (!/^\d{4}$/.test(year) || Number(year) < 1 || !isSeason(season)) return null;
  return { year: Number(year), season };
}

export function currentSeason(date = new Date()): AnimeSeason {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  return { year: date.getUTCFullYear(), season: SEASONS[Math.floor(date.getUTCMonth() / 3)] };
}

export function shiftSeason(value: AnimeSeason, offset: number): AnimeSeason {
  const index = SEASONS.indexOf(value.season) + offset;
  return { year: value.year + Math.floor(index / 4), season: SEASONS[((index % 4) + 4) % 4] };
}

export function seasonPath(value: AnimeSeason): string {
  return `/season/${String(value.year).padStart(4, '0')}/${value.season}`;
}
