'use client';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { topFive } from '@/lib/top-five';
import { formatAnimeScore } from '@/lib/ratings';
import type { AnimeTitle } from '@/lib/tmdb';
export function WeeklyTopFive({ titles, slug, pending = false }: { titles: AnimeTitle[]; slug: string; pending?: boolean }) {
  const dictionary = getDictionary(useLocale());
  const d = dictionary.features; const top = topFive(titles);
  const [status, setStatus] = useState('');
  async function share() {
    const url = new URL(`/week/${slug}`, window.location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title: d.topFive, url }); return; }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setStatus(d.copied); } catch { setStatus(`${d.copyLink}: ${url}`); }
  }
  return <section className="weekly-top-five" aria-labelledby="top-five-heading">
    <div className="top-five-header"><div className="top-five-heading"><span className="top-five-mark" aria-hidden="true">✦</span><div><h2 id="top-five-heading">{d.topFive}</h2><p>{d.topFiveDescription}</p></div></div>
      <div className="top-five-actions"><button type="button" onClick={share}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></svg>{d.share}</button><a href={`/api/ics/week/${slug}`}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-6 4-4 4-2-2"/></svg>{d.calendar}</a></div>
    </div>
    {top.length ? <ol className="top-five-grid">{top.map((title, index) => {
      const animeScore = formatAnimeScore(title.ratings);
      const source = animeScore.startsWith('MAL ') ? 'myanimelist' : animeScore.startsWith('AniList ') ? 'anilist' : 'imdb';
      const sourceName = source === 'myanimelist' ? 'MyAnimeList' : source === 'anilist' ? 'AniList' : 'IMDb';
      return <li className={index === 0 ? 'top-five-winner' : undefined} key={`${title.kind}:${title.id}`}>
        <Link className="top-five-card" prefetch={false} href={animeDetailLink(title)} title={title.name}>
          <span className="top-five-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="sr-only">{index + 1}. </span>
          <span className="top-five-cover">{title.poster ? <Image src={`https://image.tmdb.org/t/p/w342${title.poster}`} alt="" fill sizes={index === 0 ? '(max-width: 640px) 50px, 116px' : '54px'} /> : <span aria-hidden="true">✦</span>}</span>
          <span className="top-five-copy"><span className="top-five-title">{title.name}</span><span className="top-five-source"><Image src={`/logos/${source}.svg`} alt="" width={13} height={13} />{sourceName}</span></span>
          <span className="top-five-score"><strong>{title.score.toFixed(2)}</strong><span> / 10</span></span>
        </Link>
      </li>;
    })}</ol> : <div className={`top-five-empty${pending ? ' top-five-pending' : ''}`} role="status"><span aria-hidden="true">✦</span><p>{pending ? dictionary.catalog.loadingRatings : d.noScores}</p></div>}
    {status && <p className="top-five-status" role="status">{status}</p>}
  </section>;
}
