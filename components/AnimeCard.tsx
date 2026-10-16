'use client';
import { DubbingStatus } from '@/components/DubbingStatus';
import { AnimeActions } from '@/components/AnimeActions';
import { watchlistId } from '@/lib/watchlist';
import Image from 'next/image';
import { WeeklyText } from '@/components/WeeklyText';
import Link from 'next/link';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { getDictionary, type Locale } from '@/lib/i18n';
import { RatingSummary } from '@/components/RatingSummary';
import type { AnimeTitle } from '@/lib/tmdb';
import { StreamingAvailability } from '@/components/StreamingAvailability';
export function AnimeCard({ anime, locale = 'en', loadingDetails = false, pendingAnime = false, enrichmentFailed = false, onRetry, dubbingAnilistId }: { anime: AnimeTitle; locale?: Locale; loadingDetails?: boolean; pendingAnime?: boolean; enrichmentFailed?: boolean; onRetry?: () => void; dubbingAnilistId?: number }) {
  const d = getDictionary(locale);
  const detailHref = animeDetailLink(anime);
  return <article className="anime-card" data-weekly-title={`${anime.kind}:${anime.id}`}>
    <Link href={detailHref} prefetch={false} className="poster" aria-label={anime.name}>{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 600px) 95px, 135px" /> : <span>{d.state.noPoster}</span>}</Link>
    <div className="card-body"><AnimeActions watchlistId={watchlistId(anime)} animeId={anime.ratings.anilistId} locale={locale} /><span className="type-label">{d.week[anime.kind]}</span><WeeklyText key={`${locale}:${anime.kind}:${anime.id}`} id={anime.id} kind={anime.kind} name={anime.name} overview={anime.overview} locale={locale} detailHref={detailHref} />
      <RatingSummary ratings={anime.ratings} title={anime.name} locale={locale} pendingAnime={pendingAnime} allowRetry={false} />
      <DubbingStatus locale={locale} anilistId={dubbingAnilistId} malId={anime.kind === 'movie' ? anime.ratings.malId : undefined} />
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      {enrichmentFailed && <p className="catalog-enrichment-error" role="status">{d.catalog.enrichmentUnavailable} <button type="button" onClick={onRetry}>{d.error.retry}</button></p>}
      <p className="card-details"><Link href={detailHref} prefetch={false} className="catalog-details">{d.catalog.details} →</Link></p>
      <StreamingAvailability loading={loadingDetails} locale={locale} anime={{ id: anime.id, kind: anime.kind, name: anime.name, providers: anime.providers, providersUnavailable: anime.providersUnavailable }} />
    </div>
  </article>;
}
