import Image from 'next/image';
import { STREAMING_REGIONS } from '@/lib/config';
import { getDictionary } from '@/lib/i18n';
import { formatAnimeScore, formatRating, formatVotes } from '@/lib/ratings';
import type { AnimeTitle } from '@/lib/tmdb';
import { ProviderLink } from '@/components/ProviderLink';
export function AnimeCard({ anime }: { anime: AnimeTitle }) {
  const d = getDictionary();
  return <article className="anime-card">
    <div className="poster">{anime.poster ? <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 640px) 120px, 200px" /> : <span>{d.state.noPoster}</span>}</div>
    <div className="card-body"><span className="type-label">{d.week[anime.kind]}</span><h3><a href={`https://www.themoviedb.org/${anime.kind}/${anime.id}`} target="_blank" rel="noopener noreferrer">{anime.name}</a></h3><p className="synopsis">{anime.overview || d.state.noSynopsis}</p>
      <dl className="ratings"><div><dt>{d.title.imdb}</dt><dd>{formatRating(anime.ratings.imdbRating)}</dd></div><div><dt>{d.title.animeScore}</dt><dd>{formatAnimeScore(anime.ratings)}</dd></div><div><dt>{d.title.votes}</dt><dd>{formatVotes(anime.ratings.imdbVotes)}</dd></div></dl>
      {anime.recommendation && <p className="recommendation">{d.title.liked} <strong>{anime.recommendation}</strong></p>}
      <details className="streaming"><summary>{d.title.streaming}<span aria-hidden="true">＋</span></summary><div className="region-list">{STREAMING_REGIONS.map(region => <div className="region" key={region}><span>{d.regions[region]}</span><div>{anime.providers[region] ? anime.providers[region]!.providers.map(provider => <ProviderLink key={provider.provider_id} href={anime.providers[region]!.link} label={`${provider.provider_name} · ${d.regions[region]} · ${d.title.watch}`}>{provider.logo_path && <Image src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" width={24} height={24} />}<span>{provider.provider_name}</span></ProviderLink>) : <p>{anime.providersUnavailable ? d.state.providersError : d.state.noProviders}</p>}</div></div>)}</div></details>
    </div>
  </article>;
}
