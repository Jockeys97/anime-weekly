import type { WeeklyRatings } from '@/lib/weekly-ratings';
import type { ImdbDailyDiagnostics } from '@/lib/imdb-episode-index';

export interface DailyHealth {
  ok: boolean;
  week: string;
  checkedAt: string;
  titles: number;
  ratings: { populated: number };
  availability: { covered: number };
  episodes: { status: string; reason?: string; updatedAt?: string; rated?: number; eligible?: number };
  imdb?: { day: string; chartIndex: boolean; diagnostics: ImdbDailyDiagnostics | null };
  problems: string[];
}
const HOUR = 3600000;
const MAX_EPISODE_AGE = 30 * HOUR;
const MAX_PROVIDER_AGE = 8 * 24 * HOUR;

/** What the daily cron should have produced for the current week. Read-only, no upstream calls. */
export function assessDailyHealth(week: string, snapshot: WeeklyRatings, now = new Date(), imdb?: DailyHealth['imdb']): DailyHealth {
  const keys = [...new Set([...Object.keys(snapshot.titles), ...Object.keys(snapshot.names ?? {})])];
  const titles = keys.length;
  const populated = Object.values(snapshot.titles).filter(rating => rating.imdbRating || rating.anilistScore != null || rating.malScore != null).length;
  const covered = keys.filter(key => { const entry = snapshot.availability?.titles[key]; return entry && now.getTime() - entry.fetchedAt < MAX_PROVIDER_AGE; }).length;
  const episodes = snapshot.episodes;
  const problems: string[] = [];
  if (!titles) problems.push('Nessun titolo nei dati della settimana: il cron non ha salvato lo snapshot.');
  else {
    if (populated / titles < 0.5) problems.push(`Voti presenti solo per ${populated} titoli su ${titles}.`);
    if (covered / titles < 0.8) problems.push(`Piattaforme aggiornate solo per ${covered} titoli su ${titles}.`);
  }
  const updated = episodes?.updatedAt ? Date.parse(episodes.updatedAt) : NaN;
  if (!episodes || !Number.isFinite(updated)) problems.push('Top 5 episodi mai calcolato per questa settimana.');
  else {
    if (now.getTime() - updated > MAX_EPISODE_AGE) problems.push(`Top 5 episodi fermo da ${Math.round((now.getTime() - updated) / HOUR)} ore.`);
    if (episodes.status === 'unavailable') problems.push(`Top 5 episodi non disponibile (motivo: ${episodes.reason ?? 'sconosciuto'}).`);
  }
  if (imdb && !imdb.chartIndex) {
    const d = imdb.diagnostics;
    const detail = !d ? 'nessuna diagnosi registrata (raccolta IMDb non eseguita oggi)'
      : [d.episodes.error && `file episodi: ${d.episodes.error} dopo ${Math.round((d.episodes.ms ?? 0) / 1000)} s`,
        d.ratings.error && `file voti: ${d.ratings.error}`,
        d.chart === 'failed' && `salvataggio grafici: ${d.chartError ?? 'errore'}`].filter(Boolean).join('; ') || `esito ${d.chart}, durata ${Math.round(d.durationMs / 1000)} s`;
    problems.push(`Grafici dei voti per episodio non aggiornati oggi (${imdb.day}): ${detail}.`);
  }
  return {
    ok: problems.length === 0, week, checkedAt: now.toISOString(), titles,
    ratings: { populated }, availability: { covered },
    episodes: { status: episodes?.status ?? 'missing', ...(episodes?.reason ? { reason: episodes.reason } : {}), ...(episodes?.updatedAt ? { updatedAt: episodes.updatedAt } : {}),
      ...(episodes?.coverage ? { rated: episodes.coverage.rated, eligible: episodes.coverage.eligible } : {}) },
    ...(imdb ? { imdb } : {}),
    problems,
  };
}
