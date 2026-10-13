import Image from 'next/image';
import Link from 'next/link';
import { animeDescription, animeName, type AniListAnime } from '@/lib/anilist';
import { getDictionary } from '@/lib/i18n';
import { CatalogCardExtras } from '@/components/CatalogCardExtras';

export function CatalogCard({ anime }: { anime: AniListAnime }) {
  const d = getDictionary('it');
  const name = animeName(anime);
  const cover = anime.coverImage?.large || anime.coverImage?.extraLarge;
  const format = d.catalog.formats[anime.format as keyof typeof d.catalog.formats] || anime.format || d.catalog.unknown;
  return <article className="anime-card catalog-card">
    <Link href={`/anime/${anime.id}`} prefetch={false} className="poster" aria-label={name}>
      {cover ? <Image src={cover} alt={name} fill sizes="(max-width: 600px) 95px, 135px" /> : <span>{d.state.noPoster}</span>}
    </Link>
    <div className="card-body">
      <span className="type-label">{format}{anime.startDate?.year ? ` · ${anime.startDate.year}` : ''}</span>
      <h3><Link href={`/anime/${anime.id}`} prefetch={false}>{name}</Link></h3>
      <p className="synopsis catalog-synopsis">{animeDescription(anime.description) || d.state.noSynopsis}</p>
      <CatalogCardExtras id={anime.id} name={name} score={anime.averageScore} />
      <Link href={`/anime/${anime.id}`} prefetch={false} className="catalog-details">{d.catalog.details} →</Link>
    </div>
  </article>;
}
