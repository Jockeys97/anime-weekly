import Image from 'next/image';
import { WeeklyText } from '@/components/WeeklyText';
import Link from 'next/link';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { getDictionary, type Locale } from '@/lib/i18n';
import { RatingSummary } from '@/components/RatingSummary';
import type { AnimeTitle } from '@/lib/tmdb';
import { StreamingAvailability } from '@/components/StreamingAvailability';
export function AnimeCard({ anime, locale = 'en', loadingDetails = false, loadingAnime = false }: { anime: AnimeTitle; locale?: Locale; loadingDetails?: boolean; loadingAnime?: boolean }) {
  const d = getDictionary(locale);
  return <article className="anime-card">
    <div className="poster">{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 640px) 120px, 200px" /> : <span>{d.state.noPoster}</span>}</div>
    <div className="card-body"><span className="type-label">{d.week[anime.kind]}</span><WeeklyText key={`${locale}:${anime.kind}:${anime.id}`} id={anime.id} kind={anime.kind} name={anime.name} overview={anime.overview} locale={locale} />
      <>{loadingDetails ? <p className="calendar-note" role="status">{d.calendar.enrichmentLoading}</p> : <RatingSummary ratings={anime.ratings} title={anime.name} locale={locale} pendingAnime={loadingAnime} />}</>
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      <p className="card-details"><Link href={animeDetailLink(anime)} prefetch={false} className="catalog-details">{d.catalog.details} →</Link></p>
      {!loadingDetails && <StreamingAvailability locale={locale} anime={{ id: anime.id, kind: anime.kind, name: anime.name, providers: anime.providers, providersUnavailable: anime.providersUnavailable }} />}
    </div>
  </article>;
}
