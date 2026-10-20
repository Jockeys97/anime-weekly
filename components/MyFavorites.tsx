'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
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
  const loading = Boolean(key) && (!result || (result.key !== key && !current.length));
  const failed = result && 'failed' in result && result.key === key;
  const next = (item: FavoriteItem) => item.next && d.nextEpisode.replace('{episode}', String(item.next.episode))
    .replace('{date}', new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(item.next.airingAt * 1000));
  const status = (item: FavoriteItem) => item.status === 'FINISHED' ? d.finished : item.status === 'NOT_YET_RELEASED' ? d.upcoming : item.status === 'RELEASING' || item.status === 'HIATUS' ? d.airing : null;
  return <section className="my-favorites" aria-labelledby="my-favorites-title">
    <header className="my-favorites-heading">
      <div><p className="eyebrow">{d.eyebrow}</p><h2 id="my-favorites-title">{d.title}{ids.length ? <span className="my-favorites-count">{ids.length}</span> : null}</h2></div>
      <p className="my-anime-note">{d.note}</p>
    </header>
    {!ids.length ? <div className="my-favorites-empty"><span aria-hidden="true">♡</span><p>{d.empty}</p></div>
      : loading ? <p className="my-anime-note" role="status">{d.loading}</p>
      : failed && !current.length ? <p className="my-anime-notice" role="status">{d.error} <button type="button" className="my-favorites-retry" onClick={() => setAttempt(value => value + 1)}>{d.retry}</button></p>
      : <>
        {result && 'unavailable' in result && result.unavailable && <p className="my-anime-note" role="status">{d.partial}</p>}
        <ul className="my-favorites-grid">{current.map(item => <li key={item.id} className="my-favorites-card">
          <Link href={item.href} prefetch={false} className="my-favorites-poster" aria-label={item.name}>
            {item.poster ? <Image src={item.poster} alt="" fill unoptimized sizes="(max-width: 600px) 45vw, 180px" /> : <span aria-hidden="true">✦</span>}
          </Link>
          <div className="my-favorites-body">
            <Link href={item.href} prefetch={false} className="my-favorites-name">{item.name}</Link>
            {next(item) ? <p className="my-favorites-next">{next(item)}</p> : status(item) ? <p className="my-favorites-status">{status(item)}</p> : null}
          </div>
          <div className="my-favorites-heart"><WatchlistButton id={item.id} /></div>
        </li>)}</ul>
      </>}
  </section>;
}
