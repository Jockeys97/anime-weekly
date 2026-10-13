import Image from 'next/image';
import Link from 'next/link';
import { animeDescription, animeName, type AniListAnime } from '@/lib/anilist';
import { LocalizedSynopsis } from '@/components/LocalizedSynopsis';
import { getDictionary, type Locale } from '@/lib/i18n';
import { CatalogCardExtras } from '@/components/CatalogCardExtras';

export function CatalogCard({ anime, locale = 'en' }: { anime: AniListAnime; locale?: Locale }) {
  const d = getDictionary(locale);
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
      <LocalizedSynopsis key={locale} locale={locale} original={animeDescription(anime.description)} titles={[anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title))} year={anime.startDate?.year ?? undefined} kind={anime.format === 'MOVIE' ? 'movie' : 'tv'} />
      <CatalogCardExtras id={anime.id} name={name} score={anime.averageScore} locale={locale} />
      <Link href={`/anime/${anime.id}`} prefetch={false} className="catalog-details">{d.catalog.details} →</Link>
    </div>
  </article>;
}
