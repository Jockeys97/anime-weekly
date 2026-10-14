'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { topFive } from '@/lib/top-five';
import type { AnimeTitle } from '@/lib/tmdb';
export function WeeklyTopFive({ titles, slug }: { titles: AnimeTitle[]; slug: string }) {
  const d = getDictionary(useLocale()).features; const top = topFive(titles);
  const [status, setStatus] = useState('');
  async function share() {
    const url = new URL(`/week/${slug}`, window.location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title: d.topFive, url }); return; }
    } catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); setStatus(d.copied); } catch { setStatus(`${d.copyLink}: ${url}`); }
  }
  return <section className="weekly-top-five" aria-labelledby="top-five-heading"><h2 id="top-five-heading">{d.topFive}</h2>
    {top.length ? <ol>{top.map(title => <li key={`${title.kind}:${title.id}`}><Link prefetch={false} href={animeDetailLink(title)}>{title.name}</Link> <strong>{title.score.toFixed(2)}</strong></li>)}</ol> : <p>{d.noScores}</p>}
    <button className="button" type="button" onClick={share}>{d.share}</button> <a className="catalog-details" href={`/api/ics/week/${slug}`}>{d.calendar}</a>{status && <p role="status">{status}</p>}
  </section>;
}
