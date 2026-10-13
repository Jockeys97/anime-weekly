import Image from 'next/image';
import { getDictionary, type Locale } from '@/lib/i18n';
import { RatingSummary } from '@/components/RatingSummary';
import type { AnimeTitle } from '@/lib/tmdb';
import { StreamingAvailability } from '@/components/StreamingAvailability';
export function AnimeCard({ anime, locale = 'en' }: { anime: AnimeTitle; locale?: Locale }) {
  const d = getDictionary(locale);
  return <article className="anime-card">
    <div className="poster">{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 640px) 120px, 200px" /> : <span>{d.state.noPoster}</span>}</div>
    <div className="card-body"><span className="type-label">{d.week[anime.kind]}</span><h3><a href={`https://www.themoviedb.org/${anime.kind}/${anime.id}`} target="_blank" rel="noopener noreferrer">{anime.name}</a></h3><p className="synopsis">{anime.overview || d.state.noSynopsis}</p>
      <RatingSummary ratings={anime.ratings} title={anime.name} locale={locale} />
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      <StreamingAvailability locale={locale} anime={{ id: anime.id, kind: anime.kind, name: anime.name, providers: anime.providers, providersUnavailable: anime.providersUnavailable }} />
    </div>
  </article>;
}
