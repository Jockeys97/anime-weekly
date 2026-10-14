import { getWeeklyCalendarSchedule } from '@/lib/weekly-enrichment';
import { getTMDBEpisodeIdentity, isOMDBConfigured, TMDBRequestError } from '@/lib/tmdb';
import { japanDate } from '@/lib/weekly-episodes';
import { withTimeout } from '@/lib/async-timeout';
import { inspectImdbEpisode } from '@/lib/imdb-episodes';
import { formatWeek, isoWeek } from '@/lib/week';
import { parseWeek } from '@/lib/week';
export const maxDuration = 30;
export async function GET(request: Request) {
  const week = new URL(request.url).searchParams.get('week');
  if (!week || !parseWeek(week)) return Response.json({ error: 'Invalid week' }, { status: 400 });
  const deadline = Date.now() + 27000;
  try {
    const result = await getWeeklyCalendarSchedule(week);
    if (new URL(request.url).searchParams.get('identities') === '1') {
      // Bounded metadata-only diagnostics: this never imports an OMDb writer.
      const eligible = result.episodeDates.filter(date => date.date <= japanDate()).slice(0, 12);
      const identities = await Promise.all(eligible.map(async date => {
        try { return { ...date, identity: await withTimeout(getTMDBEpisodeIdentity(date), Math.max(1, Math.min(14000, deadline - Date.now()))) }; }
        catch (error) { return { ...date, identity: null, error: error instanceof TMDBRequestError ? `tmdb-http-${error.status}` : 'identity-lookup-failed' }; }
      }));
      const requestedId = new URL(request.url).searchParams.get('probeImdbId');
      const candidate = identities.find(entry => entry.identity && (!requestedId || entry.identity.imdbId === requestedId));
      const probe = process.env.VERCEL_ENV === 'preview' && week === formatWeek(isoWeek(new Date())) && new URL(request.url).searchParams.get('probe') === '1' && candidate?.identity && deadline - Date.now() > 6000
        ? await inspectImdbEpisode(candidate.identity.imdbId, candidate.identity.seriesImdbId, japanDate(), { season: candidate.season, episode: candidate.episode }) : undefined;
      return Response.json({ unavailable: result.unavailable, imdbConfigured: isOMDBConfigured(), identities, probe }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(result, { headers: { 'Cache-Control': result.unavailable ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch {
    return Response.json({ error: 'Weekly calendar unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
