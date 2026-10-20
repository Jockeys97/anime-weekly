'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from '@/components/LocaleLink';
import { useWatchlist, WatchlistButton } from '@/components/Watchlist';
import { getDictionary, type Locale } from '@/lib/i18n';
import { sortFavorites, type FavoriteItem } from '@/lib/favorites';

type Result = { key: string; items: FavoriteItem[]; unavailable: boolean } | { key: string; failed: true };

/** Favourites saved with the heart button. The list itself lives only in this browser. */
export function MyFavorites({ locale }: { locale: Locale }) {
  const d = getDictionary(locale).myFavorites;
  const ids = useWatchlist();
  const key = ids.join(',');
  const [result, setResult] = useState<Result | null>(null);
  const [attempt, setAttempt] = useState(0);
  // One sideways row by default (fixed height, soonest episodes first); "show all" opens the grid.
  const [expanded, setExpanded] = useState(false);
  const rail = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ overflow: false, prev: false, next: false });
  const measure = useCallback(() => {
    const element = rail.current;
    if (!element) return;
    const next = { overflow: element.scrollWidth > element.clientWidth + 4, prev: element.scrollLeft > 4, next: element.scrollLeft + element.clientWidth < element.scrollWidth - 4 };
    setEdges(previous => previous.overflow === next.overflow && previous.prev === next.prev && previous.next === next.next ? previous : next);
  }, []);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    fetch(`/api/favorites?${new URLSearchParams({ ids: key })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) })
      .then(async response => {
        if (!response.ok) throw new Error('Favorites unavailable');
        const data = await response.json() as { items: FavoriteItem[]; unavailable: boolean };
        if (!controller.signal.aborted) setResult({ key, items: data.items, unavailable: data.unavailable });
      })
      .catch(() => { if (!controller.signal.aborted) setResult({ key, failed: true }); });
    return () => controller.abort();
  }, [key, attempt]);
  // Removing a heart updates the list at once, without waiting for a new request.
  const current = result && 'items' in result ? sortFavorites(result.items.filter(item => ids.includes(item.id)), locale) : [];
  const count = current.length;
  // The list travels in the URL: calendar apps refetch it without any account.
  const calendarUrl = (scheme: 'webcal' | 'https') => {
    const path = `/api/ics/favorites?${new URLSearchParams({ ids: ids.filter(id => id.startsWith('anilist:')).join(',') })}`;
    if (typeof window === 'undefined') return path;
    return scheme === 'https' ? path : `webcal://${window.location.host}${path}`;
  };
  useEffect(() => {
    const element = rail.current;
    if (!element || typeof window === 'undefined' || expanded) return;
    const frame = window.requestAnimationFrame(measure);
    element.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => { window.cancelAnimationFrame(frame); element.removeEventListener('scroll', measure); observer?.disconnect(); };
  }, [measure, expanded, count]);
  const slide = (direction: 1 | -1) => {
    const element = rail.current;
    if (!element) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * Math.max(160, element.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };
  const loading = Boolean(key) && (!result || (result.key !== key && !current.length));
  const failed = result && 'failed' in result && result.key === key;
  const next = (item: FavoriteItem) => item.next && d.nextEpisode.replace('{episode}', String(item.next.episode))
    .replace('{date}', new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.next.airingAt * 1000));
  const status = (item: FavoriteItem) => item.status === 'FINISHED' ? d.finished : item.status === 'NOT_YET_RELEASED' ? d.upcoming : item.status === 'RELEASING' || item.status === 'HIATUS' ? d.airing : null;
  return <section className="my-favorites" aria-labelledby="my-favorites-title">
    <header className="my-favorites-heading">
      <div><p className="eyebrow">{d.eyebrow}</p><h2 id="my-favorites-title">{d.title}{ids.length ? <span className="my-favorites-count">{ids.length}</span> : null}</h2></div>
      {(edges.overflow || expanded) && count > 0 && <button type="button" className="my-favorites-toggle" aria-expanded={expanded} aria-controls="my-favorites-list" onClick={() => setExpanded(value => !value)}>
        {expanded ? d.showLess : d.showAll.replace('{count}', String(count))}</button>}
      <p className="my-anime-note">{d.note}</p>
      {ids.some(id => id.startsWith('anilist:')) && <div className="my-favorites-calendar">
        <a className="my-favorites-subscribe" href={calendarUrl('webcal')}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4" /></svg> {d.subscribe}</a>
        <a className="my-favorites-download" href={calendarUrl('https')} download>{d.download}</a>
        <span className="my-anime-note">{d.calendarNote}</span>
      </div>}
    </header>
    {!ids.length ? <div className="my-favorites-empty"><span aria-hidden="true">♡</span><p>{d.empty}</p></div>
      : loading ? <p className="my-anime-note" role="status">{d.loading}</p>
      : failed && !current.length ? <p className="my-anime-notice" role="status">{d.error} <button type="button" className="my-favorites-retry" onClick={() => setAttempt(value => value + 1)}>{d.retry}</button></p>
      : <>
        {result && 'unavailable' in result && result.unavailable && <p className="my-anime-note" role="status">{d.partial}</p>}
        <div className={`my-favorites-rail${expanded ? ' is-expanded' : ''}`}>
        {!expanded && edges.prev && <button type="button" className="my-favorites-arrow is-prev" onClick={() => slide(-1)} aria-label={d.previous} aria-controls="my-favorites-list">‹</button>}
        <ul id="my-favorites-list" ref={rail} className={`my-favorites-grid${expanded ? '' : ' is-row'}`}>{current.map(item => <li key={item.id} className="my-favorites-card">
          <Link href={item.href} prefetch={false} className="my-favorites-poster" aria-label={item.name}>
            {item.poster ? <Image src={item.poster} alt="" fill unoptimized sizes="(max-width: 600px) 45vw, 180px" /> : <span aria-hidden="true">✦</span>}
          </Link>
          <div className="my-favorites-body">
            <Link href={item.href} prefetch={false} className="my-favorites-name">{item.name}</Link>
            {item.current && <p className="my-favorites-season">{item.current}</p>}
            {next(item) ? <p className="my-favorites-next">{next(item)}</p> : status(item) ? <p className="my-favorites-status">{item.current && item.status === 'NOT_YET_RELEASED' ? d.newSeason : status(item)}</p> : null}
          </div>
          <div className="my-favorites-heart"><WatchlistButton id={item.id} /></div>
        </li>)}</ul>
        {!expanded && edges.next && <button type="button" className="my-favorites-arrow is-next" onClick={() => slide(1)} aria-label={d.next} aria-controls="my-favorites-list">›</button>}
        </div>
      </>}
  </section>;
}
