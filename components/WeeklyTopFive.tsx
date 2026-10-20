'use client';
import { localePath } from '@/lib/locale-routing';
import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/LocaleLink';
import Image from 'next/image';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { loadWeeklyEpisodes } from '@/lib/weekly-episode-client';
import { topWeeklyEpisodes, type WeeklyEpisodes } from '@/lib/weekly-episodes';
export function WeeklyTopFive({ slug, initialEpisodes, frozen = false }: { slug: string; initialEpisodes?: WeeklyEpisodes; frozen?: boolean }) {
  const locale = useLocale();
  const dictionary = getDictionary(locale);
  const d = dictionary.features;
  const [snapshot, setSnapshot] = useState<{ slug: string; data: WeeklyEpisodes } | null>(() => initialEpisodes ? { slug, data: initialEpisodes } : null);
  useEffect(() => {
    if (frozen) return;
    const age = initialEpisodes?.updatedAt ? Date.now() - Date.parse(initialEpisodes.updatedAt) : Infinity;
    if (initialEpisodes?.status === 'ready' && age >= 0 && age < 300000) return;
    const controller = new AbortController();
    void loadWeeklyEpisodes(slug, controller.signal)
      .then(data => { if (!controller.signal.aborted) setSnapshot({ slug, data }); })
      .catch(() => { if (!controller.signal.aborted) setSnapshot({ slug, data: { entries: [], status: 'unavailable' } }); });
    return () => controller.abort();
  }, [slug, initialEpisodes, frozen]);
  const data = snapshot?.slug === slug ? snapshot.data : null;
  const top = useMemo(() => topWeeklyEpisodes(data?.entries ?? [], slug), [data?.entries, slug]);
  const pending = !data;
  const showCount = data?.status === 'ready' || data?.status === 'partial';
  const failureMessage = data?.source === 'imdb-datasets' && data.reason === 'source' ? d.episodesDatasetUnavailable : data?.reason === 'quota' ? d.episodesQuotaUnavailable
    : data?.reason === 'authentication' ? d.episodesAuthenticationUnavailable
    : data?.reason === 'source' ? d.episodesSourceUnavailable
    : data?.reason === 'metadata' ? d.episodesMetadataUnavailable : d.episodesUnavailable;
  const [status, setStatus] = useState('');
  async function share() {
    const url = new URL(localePath(`/week/${slug}`, locale), window.location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title: d.topFive, url }); return; }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setStatus(d.copied); } catch { setStatus(`${d.copyLink}: ${url}`); }
  }
  return <section className="weekly-top-five" aria-labelledby="top-five-heading">
    <div className="top-five-header"><div className="top-five-heading"><span className="top-five-mark" aria-hidden="true">✦</span><div><div className="top-five-title-row"><h2 id="top-five-heading">{d.topFive}</h2>{showCount && <span className="top-five-count" role="status">{d.episodesAvailableCount.replace('{count}', String(top.length))}</span>}</div><p>{d.topFiveDescription}</p></div></div>
      <div className="top-five-actions"><button type="button" onClick={share}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16V3m-5 5 5-5 5 5M5 14v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" /></svg>{d.share}</button><a href={`/api/ics/week/${slug}`}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-6 4-4 4-2-2"/></svg>{d.calendar}</a></div>
    </div>
    {showCount && top.length < 5 && <p className="top-five-availability">{d.episodesFewerThanFive}</p>}
    {top.length ? <ol className="top-five-grid" data-count={top.length}>{top.map((title, index) => {
      return <li className={index === 0 ? 'top-five-winner' : undefined} key={title.imdbId}>
        <Link className="top-five-card" prefetch={false} href={`https://www.imdb.com/title/${title.imdbId}/`} target="_blank" rel="noopener noreferrer" title={`${title.seriesName} · ${title.title}`}>
          <span className="top-five-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="sr-only">{index + 1}. </span>
          <span className="top-five-cover">{title.poster ? <Image src={`https://image.tmdb.org/t/p/w342${title.poster}`} alt="" fill loading="lazy" sizes={index === 0 ? '(max-width: 640px) 50px, 116px' : '54px'} /> : <span aria-hidden="true">✦</span>}</span>
          <span className="top-five-copy"><span className="top-five-title">{title.seriesName}</span><span className="top-five-episode">{d.episodeLabel.replace('{season}', String(title.season)).replace('{episode}', String(title.episode))}</span>{title.title && <span className="top-five-episode-name">{title.title}</span>}<span className="top-five-source"><Image src="/logos/imdb.svg" alt="" width={24} height={13} />IMDb · {title.votes.toLocaleString()} {dictionary.title.votes}</span></span>
          <span className="top-five-score"><strong>{title.score.toFixed(1)}</strong><span> / 10</span></span>
        </Link>
      </li>;
    })}</ol> : <div className={`top-five-empty${pending ? ' top-five-pending' : ''}`} role="status"><span aria-hidden="true">✦</span><p>{pending ? dictionary.catalog.loadingRatings : data?.status === 'pending' ? d.episodesPending : data?.status === 'unavailable' ? failureMessage : data?.source === 'imdb-datasets' ? d.episodesDatasetEmpty : d.noRatedEpisodes}</p></div>}
    {data?.status === 'partial' && top.length > 0 && <p className="top-five-status" role="status">{d.episodesPartial}</p>}
    {data?.source === 'imdb-datasets' && <p className="top-five-status"><a href="https://data.imdb.com/non-commercial-datasets/" target="_blank" rel="noopener noreferrer">{d.datasetAttribution}</a>{data.dataUpdatedAt && Number.isFinite(Date.parse(data.dataUpdatedAt)) && <> · {d.datasetDate} {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(data.dataUpdatedAt))}</>}</p>}
    {status && <p className="top-five-status" role="status">{status}</p>}
  </section>;
}
