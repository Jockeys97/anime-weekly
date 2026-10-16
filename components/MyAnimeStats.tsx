'use client';
import { useEffect, useRef, useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import { withTimeout } from '@/lib/async-timeout';
import type { PersonalAnimeStats } from '@/lib/my-anime-stats-model';

export function MyAnimeStatsView({ data, locale }: { data: PersonalAnimeStats; locale: string }) {
  const d = getDictionary(locale).myAnime;
  const number = new Intl.NumberFormat(locale);
  const metrics = [
    { label: d.statsSeries, value: number.format(data.series), icon: '◈' },
    { label: d.statsEpisodes, value: number.format(data.episodes), icon: '▤' },
    { label: d.statsHours, value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(data.minutes / 60), icon: '◷' },
    { label: d.statsRewatches, value: number.format(data.rewatches), icon: '↻' },
  ];
  return <>
    <dl className="my-anime-metrics">{metrics.map(metric => <div key={metric.label}><dt><span aria-hidden="true">{metric.icon}</span>{metric.label}</dt><dd>{metric.value}</dd></div>)}</dl>
    <p className="my-anime-note">{d.statsNote}</p>
    {data.partial && <p className="my-anime-stats-warning" role="status">{d.statsPartial}</p>}
    {data.missingRuntimePlays > 0 && <p className="my-anime-note">{d.statsMissingRuntime.replace('{count}', number.format(data.missingRuntimePlays))}</p>}
    {data.unmatched > 0 && <p className="my-anime-note">{d.statsUnmatched.replace('{count}', number.format(data.unmatched))}</p>}
    <p className="my-anime-updated">{d.statsUpdated.replace('{time}', new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(data.updatedAt)))}</p>
  </>;
}
export function MyAnimeStats({ locale, refreshKey }: { locale: string; refreshKey: number }) {
  const d = getDictionary(locale).myAnime;
  const [result, setResult] = useState<{ key: string; data: PersonalAnimeStats | null; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const continuations = useRef(0);
  const key = `${refreshKey}:${retry}`;
  const loading = result?.key !== key, data = result?.data, error = result?.key === key && result.error;
  useEffect(() => { continuations.current = 0; }, [refreshKey]);
  useEffect(() => {
    if (!data?.syncing || error || continuations.current >= 8 || loading) return;
    const timer = setTimeout(() => { continuations.current++; setRetry(value => value + 1); }, 2000);
    return () => clearTimeout(timer);
  }, [data, error, loading, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void withTimeout((async () => {
      const response = await fetch('/api/my-anime/stats', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
      if (!response.ok) throw new Error('Stats unavailable');
      const result = await response.json() as PersonalAnimeStats;
      if (result.status !== 'ready' || !Number.isFinite(result.minutes) || !Number.isFinite(Date.parse(result.updatedAt))) throw new Error('Invalid statistics');
      return result;
    })(), 25000).then(data => { if (!controller.signal.aborted) setResult({ key, data, error: false }); })
      .catch(() => { if (!controller.signal.aborted) setResult(previous => ({ key, data: previous?.data ?? null, error: true })); });
    return () => controller.abort();
  }, [key]);
  return <section className="my-anime-stats" aria-labelledby="my-anime-stats-title" aria-busy={loading}>
    <header><div><p className="eyebrow">{d.statsEyebrow}</p><h2 id="my-anime-stats-title">{d.statsTitle}</h2></div><span className="my-anime-anime-only">✦ {d.animeOnly}</span></header>
    {loading && !data ? <div className="my-anime-stats-loading" role="status">{d.statsLoading}<div aria-hidden="true">{[0, 1, 2, 3].map(key => <span key={key} />)}</div></div>
      : data ? <MyAnimeStatsView data={data} locale={locale} /> : null}
    {data?.syncing && <p className="my-anime-note" role="status">{d.statsPartial} {!loading && <button type="button" onClick={() => { continuations.current = 0; setRetry(value => value + 1); }}>{d.retry}</button>}</p>}
    {error && <p className="my-anime-stats-warning" role="status">{d.statsUnavailable} <button type="button" disabled={loading} onClick={() => { continuations.current = 0; setRetry(value => value + 1); }}>{d.retry}</button></p>}
  </section>;
}
