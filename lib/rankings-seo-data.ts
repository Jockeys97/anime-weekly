import 'server-only';
import { cache } from 'react';
import { getSeoWeek } from '@/lib/weekly-seo-data';
import { formatWeek, isoWeek, shiftWeek } from '@/lib/week';

// Only the current-week alias may use an older populated ranking. Keep explicit
// week URLs strict, and share the resolution across HTML, metadata and OG.
export const getRankingsWeek = cache(async (segment: string) => {
  const current = isoWeek(new Date());
  const lookback = segment === 'this-week' ? 4 : 0;
  for (let offset = 0; offset <= lookback; offset++) {
    const slug = segment === 'this-week' ? formatWeek(shiftWeek(current, -offset)) : segment;
    const data = await getSeoWeek(slug);
    if (data && (data.rankings.imdb.length || data.rankings.mal.length)) return data;
  }
  return null;
});
