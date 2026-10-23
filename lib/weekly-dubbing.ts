import 'server-only';
import { getAnime } from '@/lib/anilist';
import { validMalId, type DubbingResult } from '@/lib/dubbing';
import type { Locale } from '@/lib/locales';
import { getDubbing } from '@/lib/mydublist';
import { getWeeklyRatings } from '@/lib/weekly-ratings';
import { withTimeout } from '@/lib/async-timeout';

// One response with the dub status of every airing season this week, so the
// calendar cards need no request each. Keyed by the exact AniList season the
// calendar events use (never a prequel). Missing or failed entries are simply
// absent: those cards fall back to their own lookup.
export async function getWeeklyDubbing(slug: string, locale: Locale): Promise<{ statuses: Record<string, DubbingResult>; complete: boolean }> {
  const snapshot = await getWeeklyRatings(slug);
  const seasonIds = [...new Set(snapshot.events.map(event => event.mediaId).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 120);
  // The snapshot's MAL ID counts only when it belongs to that exact season.
  const knownMal = new Map(Object.values(snapshot.titles).flatMap(rating => rating.anilistId && validMalId(rating.malId) ? [[rating.anilistId, rating.malId] as const] : []));
  const statuses: Record<string, DubbingResult> = {};
  let complete = true, cursor = 0;
  const deadline = Date.now() + 8000;
  await Promise.all(Array.from({ length: Math.min(4, seasonIds.length) }, async () => {
    while (cursor < seasonIds.length) {
      const id = seasonIds[cursor++];
      if (Date.now() >= deadline) { complete = false; break; }
      try {
        const malId = knownMal.get(id) ?? (await withTimeout(getAnime(id), Math.max(1, deadline - Date.now())))?.idMal;
        if (!validMalId(malId)) continue;
        const result = await getDubbing(malId, locale);
        if (result.reason === 'upstream') { complete = false; continue; }
        statuses[id] = result;
      } catch { complete = false; }
    }
  }));
  return { statuses, complete };
}
