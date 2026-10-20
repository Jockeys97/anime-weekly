import { describe, expect, it } from 'vitest';
import { groupReleases } from '@/components/WeekAtAGlance';
import type { CalendarRelease } from '@/lib/weekly-calendar';
const r = (id: number, episode: number) => ({ anime: { id, kind: 'tv', name: `A${id}` }, date: '2026-10-20', episode }) as unknown as CalendarRelease;
describe('groupReleases', () => {
  it('groups episodes of the same series and keeps the first release first', () => {
    const groups = groupReleases([r(1, 1), r(2, 5), r(1, 2), r(1, 3)]);
    expect(groups.map(g => g.length)).toEqual([3, 1]);
    expect(groups[0][0].episode).toBe(1);
  });
});
