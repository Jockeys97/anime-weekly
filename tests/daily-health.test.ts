import { expect, it } from 'vitest';
import { assessDailyHealth } from '../lib/daily-health';
const now = new Date('2026-10-21T07:30:00Z');
const fresh = now.getTime() - 3600000;
const snapshot = (overrides = {}) => ({
  titles: { 'tv:1': { imdbRating: '8.1' }, 'tv:2': { anilistScore: 80 } }, events: [], names: { 'tv:1': 'A', 'tv:2': 'B' },
  availability: { titles: { 'tv:1': { countries: {}, fetchedAt: fresh }, 'tv:2': { countries: {}, fetchedAt: fresh } }, providers: {} },
  episodes: { entries: [], status: 'ready', updatedAt: new Date(fresh).toISOString(), coverage: { eligible: 15, matched: 13, rated: 12, unrated: 1, failed: 0 } },
  ...overrides,
}) as never;
it('is healthy when ratings, providers and the Top 5 were refreshed today', () => {
  expect(assessDailyHealth('2026-43', snapshot(), now)).toMatchObject({ ok: true, titles: 2, ratings: { populated: 2 }, availability: { covered: 2 }, episodes: { status: 'ready', rated: 12 }, problems: [] });
});
it('flags an unavailable or stale Top 5, missing providers and an empty snapshot', () => {
  const broken = assessDailyHealth('2026-43', snapshot({ episodes: { entries: [], status: 'unavailable', reason: 'source', updatedAt: new Date(now.getTime() - 40 * 3600000).toISOString() }, availability: { titles: {}, providers: {} } }), now);
  expect(broken.ok).toBe(false);
  expect(broken.problems.join(' ')).toMatch(/fermo da 40 ore/);
  expect(broken.problems.join(' ')).toMatch(/motivo: source/);
  expect(broken.problems.join(' ')).toMatch(/Piattaforme aggiornate solo per 0 titoli su 2/);
  expect(assessDailyHealth('2026-43', { titles: {}, events: [] }, now).problems[0]).toMatch(/Nessun titolo/);
});
it('reports why the episode charts were not rebuilt today', () => {
  const base = { day: '2026-10-22', startedAt: '2026-10-22T06:01:00Z', durationMs: 121000, ratings: { ms: 20000 }, chart: 'skipped' as const };
  const timedOut = assessDailyHealth('2026-43', snapshot(), now, { day: '2026-10-22', chartIndex: false, diagnostics: { ...base, episodes: { ms: 120000, error: 'AbortError: This operation was aborted' } } });
  expect(timedOut.ok).toBe(false);
  expect(timedOut.problems.at(-1)).toMatch(/file episodi: AbortError: This operation was aborted dopo 120 s/);
  const writeFailed = assessDailyHealth('2026-43', snapshot(), now, { day: '2026-10-22', chartIndex: false, diagnostics: { ...base, episodes: { ms: 60000 }, chart: 'failed', chartError: 'Error: Episode chart cache limit reached' } });
  expect(writeFailed.problems.at(-1)).toMatch(/salvataggio grafici: Error: Episode chart cache limit reached/);
  expect(assessDailyHealth('2026-43', snapshot(), now, { day: '2026-10-22', chartIndex: false, diagnostics: null }).problems.at(-1)).toMatch(/nessuna diagnosi/);
  expect(assessDailyHealth('2026-43', snapshot(), now, { day: '2026-10-22', chartIndex: true, diagnostics: null }).ok).toBe(true);
});
