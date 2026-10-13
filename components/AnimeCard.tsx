import Image from 'next/image';
import { STREAMING_REGIONS } from '@/lib/config';
import { getDictionary } from '@/lib/i18n';
import { RatingSummary } from '@/components/RatingSummary';
import type { AnimeTitle } from '@/lib/tmdb';
import { providerWatchLink } from '@/lib/watch-links';
import { ProviderLink } from '@/components/ProviderLink';
export function AnimeCard({ anime }: { anime: AnimeTitle }) {
  const d = getDictionary();
  return <article className="anime-card">
    <div className="poster">{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 640px) 120px, 200px" /> : <span>{d.state.noPoster}</span>}</div>
    <div className="card-body"><span className="type-label">{d.week[anime.kind]}</span><h3><a href={`https://www.themoviedb.org/${anime.kind}/${anime.id}`} target="_blank" rel="noopener noreferrer">{anime.name}</a></h3><p className="synopsis">{anime.overview || d.state.noSynopsis}</p>
      <RatingSummary ratings={anime.ratings} title={anime.name} />
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      <details className="streaming"><summary>{d.title.streaming}<span aria-hidden="true">＋</span></summary><p className="streaming-note">{d.title.streamingLinksNote}</p><div className="region-list">{STREAMING_REGIONS.map(region => <div className="region" key={region}><span>{d.regions[region]}</span><div>{anime.providers[region] ? anime.providers[region]!.providers.map(provider => <ProviderLink key={provider.provider_id} href={providerWatchLink(anime.kind, anime.id, region, provider.provider_id)} label={`${anime.name} · ${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>{provider.logo_path && <Image src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={24} height={24} />}<span>{provider.provider_name}</span><span className="provider-external" aria-hidden="true">↗</span></ProviderLink>) : <p>{anime.providersUnavailable ? d.state.providersError : d.state.noProviders}</p>}</div></div>)}</div></details>
    </div>
  </article>;
}
