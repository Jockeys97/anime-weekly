'use client';
import { WatchlistButton } from '@/components/Watchlist';
import { watchlistId } from '@/lib/watchlist';
import Image from 'next/image';
import { WeeklyText } from '@/components/WeeklyText';
import Link from 'next/link';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { getDictionary, type Locale } from '@/lib/i18n';
import { RatingSummary } from '@/components/RatingSummary';
import type { AnimeTitle } from '@/lib/tmdb';
import { StreamingAvailability } from '@/components/StreamingAvailability';
export function AnimeCard({ anime, locale = 'en', loadingDetails = false, pendingAnime = false, enrichmentFailed = false, onRetry }: { anime: AnimeTitle; locale?: Locale; loadingDetails?: boolean; pendingAnime?: boolean; enrichmentFailed?: boolean; onRetry?: () => void }) {
  const d = getDictionary(locale);
  return <article className="anime-card" data-weekly-title={`${anime.kind}:${anime.id}`}>
    <div className="poster">{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 640px) 120px, 200px" /> : <span>{d.state.noPoster}</span>}</div>
    <div className="card-body"><WatchlistButton id={watchlistId(anime)} /><span className="type-label">{d.week[anime.kind]}</span><WeeklyText key={`${locale}:${anime.kind}:${anime.id}`} id={anime.id} kind={anime.kind} name={anime.name} overview={anime.overview} locale={locale} />
      <RatingSummary ratings={anime.ratings} title={anime.name} locale={locale} pendingAnime={pendingAnime} allowRetry={false} />
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      {enrichmentFailed && <p className="catalog-enrichment-error" role="status">{d.catalog.enrichmentUnavailable} <button type="button" onClick={onRetry}>{d.error.retry}</button></p>}
      <p className="card-details"><Link href={animeDetailLink(anime)} prefetch={false} className="catalog-details">{d.catalog.details} →</Link></p>
      <StreamingAvailability loading={loadingDetails} locale={locale} anime={{ id: anime.id, kind: anime.kind, name: anime.name, providers: anime.providers, providersUnavailable: anime.providersUnavailable }} />
    </div>
  </article>;
}
