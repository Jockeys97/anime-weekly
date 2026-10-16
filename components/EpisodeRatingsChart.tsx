'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { chartSeasons, validChartEpisode, validImdbId, type EpisodeChartData } from '@/lib/episode-chart';
import { withTimeout } from '@/lib/async-timeout';
import styles from './EpisodeRatingsChart.module.css';

export function EpisodeChartLoading() {
  const d = getDictionary(useLocale()).episodeChart;
  return <section className={styles.section} aria-busy="true"><h2>{d.title}</h2><p className={styles.empty} role="status">{d.loading}</p></section>;
}

export function EpisodeRatingsChart({ initial, seriesId, seriesTitle }: { initial: EpisodeChartData; seriesId?: string; seriesTitle: string }) {
  const locale = useLocale();
  const d = getDictionary(locale).episodeChart;
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState<{ seriesId: string; data: EpisodeChartData } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const data = loaded && loaded.seriesId === seriesId ? loaded.data : initial;
  const seasons = useMemo(() => chartSeasons(data.episodes), [data.episodes]);
  const [selected, setSelected] = useState<number | null>(null);
  const season = seasons.find(item => item.number === selected) ?? seasons.find(item => item.number > 0) ?? seasons[0];
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const count = new Intl.NumberFormat(locale);
  const canLookup = validImdbId(seriesId);

  useEffect(() => {
    if (!canLookup || (initial.status === 'ready' && attempt === 0)) return;
    let active = true;
    let observer: IntersectionObserver | undefined;
    const controller = new AbortController();
    const load = () => {
      observer?.disconnect();
      setBusy(true);
      const timeout = setTimeout(() => controller.abort(), 10000);
      void withTimeout((async () => {
        const response = await fetch(`/api/episode-ratings?imdb=${seriesId}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Episode chart unavailable');
        const result = await response.json() as EpisodeChartData;
        if (!result || !['ready', 'unavailable'].includes(result.status) || !Array.isArray(result.episodes) || result.episodes.length > 10000 || !result.episodes.every(validChartEpisode)) throw new Error('Invalid episode chart');
        if (active) setLoaded({ seriesId: seriesId!, data: result });
      })(), 10000).catch(() => undefined).finally(() => { clearTimeout(timeout); if (active) setBusy(false); });
    };
    if (typeof IntersectionObserver === 'undefined') load();
    else {
      observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: '150px' });
      if (section.current) observer.observe(section.current);
    }
    return () => { active = false; observer?.disconnect(); controller.abort(); };
  }, [canLookup, seriesId, initial.status, attempt]);

  const seasonName = (value: number) => value === 0 ? d.specials : `${d.season} ${value}`;
  const updated = data.dataUpdatedAt || data.updatedAt;
  const best = season ? Math.max(...season.episodes.map(episode => episode.score)) : 0;
  return <section ref={section} className={styles.section} aria-labelledby={`${id}-heading`}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>IMDb · {d.eyebrow}</p><h2 id={`${id}-heading`}>{d.title}</h2></div>
      {canLookup && <a className={styles.source} href={`https://www.imdb.com/title/${seriesId}/episodes/`} target="_blank" rel="noopener noreferrer">{d.openImdb} <span aria-hidden="true">↗</span></a>}
    </header>
    <p className={styles.description}>{d.description} <strong>{seriesTitle}</strong></p>
    {season ? <>
      <div className={styles.seasons} role="group" aria-label={d.chooseSeason}>
        {seasons.map(item => <button type="button" key={item.number} aria-pressed={season.number === item.number} aria-controls={`${id}-chart`} onClick={() => setSelected(item.number)}>{seasonName(item.number)}<span>{item.episodes.length}</span></button>)}
      </div>
      <div className={styles.summary} aria-live="polite" aria-atomic="true">
        <span><strong>{seasonName(season.number)}</strong><span className={styles.dot}>·</span>{count.format(season.episodes.length)} {d.ratedEpisodes}</span>
        <span className={styles.average}><span aria-hidden="true">★</span> <strong>{number.format(season.average)}</strong><span>/ 10 {d.average}</span></span>
      </div>
      <div id={`${id}-chart`} className={styles.scroll} tabIndex={0} role="region" aria-label={`${seasonName(season.number)} · ${d.chartLabel}`}>
        <div className={styles.plot}>
          <div className={styles.averageLine} style={{ '--average': `${season.average * 17}px` } as CSSProperties} aria-hidden="true" />
          <ol className={styles.episodes}>
            {season.episodes.map(episode => <li key={episode.imdbId}>
              <a className={styles.episode} data-best={episode.score === best || undefined} href={`https://www.imdb.com/title/${episode.imdbId}/`} target="_blank" rel="noopener noreferrer"
                aria-label={`${seasonName(episode.season)}, ${d.episode} ${episode.episode}: ${number.format(episode.score)} / 10, ${count.format(episode.votes)} ${d.votes}. ${d.openImdb}`} title={`${d.episode} ${episode.episode} · ${count.format(episode.votes)} ${d.votes}`}>
                <span className={styles.barArea}><span className={styles.bar} style={{ height: `${episode.score * 10}%` }}><strong>{number.format(episode.score)}</strong></span></span>
                <span className={styles.episodeLabel}>E{episode.episode}<span aria-hidden="true">↗</span></span>
                <span className={styles.voteCount}>{count.format(episode.votes)}</span>
              </a>
            </li>)}
          </ol>
        </div>
      </div>
      <p className={styles.hint}>{d.scrollHint}</p>
    </> : <div className={styles.empty} role="status"><p>{busy ? d.loading : canLookup ? data.status === 'ready' ? d.noRatings : d.notCached : d.noMatch}</p>{canLookup && !busy && <button type="button" onClick={() => setAttempt(value => value + 1)}>{d.retry}</button>}</div>}
    <footer className={styles.note}><span>{d.note}</span>{updated && Number.isFinite(Date.parse(updated)) && <span>{d.updated} <time dateTime={updated}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(updated))}</time></span>}</footer>
  </section>;
}
