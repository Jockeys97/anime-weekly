'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { loadWeeklyEpisodes } from '@/lib/weekly-episode-client';
import { topWeeklyEpisodes, type WeeklyEpisodes } from '@/lib/weekly-episodes';
export function WeeklyTopFive({ slug }: { slug: string }) {
  const dictionary = getDictionary(useLocale());
  const d = dictionary.features;
  const [snapshot, setSnapshot] = useState<{ slug: string; data: WeeklyEpisodes } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadWeeklyEpisodes(slug, controller.signal)
      .then(data => { if (!controller.signal.aborted) setSnapshot({ slug, data }); })
      .catch(() => { if (!controller.signal.aborted) setSnapshot({ slug, data: { entries: [], status: 'unavailable' } }); });
    return () => controller.abort();
  }, [slug]);
  const data = snapshot?.slug === slug ? snapshot.data : null;
  const top = topWeeklyEpisodes(data?.entries ?? [], slug);
  const pending = !data;
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
      return <li className={index === 0 ? 'top-five-winner' : undefined} key={title.imdbId}>
        <Link className="top-five-card" prefetch={false} href={`https://www.imdb.com/title/${title.imdbId}/`} target="_blank" rel="noopener noreferrer" title={`${title.seriesName} · ${title.title}`}>
          <span className="top-five-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="sr-only">{index + 1}. </span>
          <span className="top-five-cover">{title.poster ? <Image src={`https://image.tmdb.org/t/p/w342${title.poster}`} alt="" fill sizes={index === 0 ? '(max-width: 640px) 50px, 116px' : '54px'} /> : <span aria-hidden="true">✦</span>}</span>
          <span className="top-five-copy"><span className="top-five-title">{title.seriesName}</span><span className="top-five-episode">{d.episodeLabel.replace('{season}', String(title.season)).replace('{episode}', String(title.episode))}</span>{title.title && <span className="top-five-episode-name">{title.title}</span>}<span className="top-five-source"><Image src="/logos/imdb.svg" alt="" width={24} height={13} />IMDb · {title.votes.toLocaleString()} {dictionary.title.votes}</span></span>
          <span className="top-five-score"><strong>{title.score.toFixed(1)}</strong><span> / 10</span></span>
        </Link>
      </li>;
    })}</ol> : <div className={`top-five-empty${pending ? ' top-five-pending' : ''}`} role="status"><span aria-hidden="true">✦</span><p>{pending ? dictionary.catalog.loadingRatings : data?.status === 'pending' ? d.episodesPending : data?.status === 'unavailable' ? d.episodesUnavailable : d.noRatedEpisodes}</p></div>}
    {data?.status === 'partial' && top.length > 0 && <p className="top-five-status" role="status">{d.episodesPartial}</p>}
    {status && <p className="top-five-status" role="status">{status}</p>}
  </section>;
}
