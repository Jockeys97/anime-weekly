// Exact dated announcements only. Never extrapolate a recurring weekday across weeks.
// Verified 2026-10-14 against the broadcaster's October calendar (episode 51, Oct 16 at 23:00 JST).
export interface OfficialAiring { seriesId: number; airingAt: number; episode: number; sourceUrl: string }
export const officialAirings: OfficialAiring[] = [{
  seriesId: 220542, airingAt: Date.parse('2026-10-16T14:00:00Z') / 1000, episode: 51,
  sourceUrl: 'https://kusuriyanohitorigoto.jp/',
}];
