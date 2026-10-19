import { animePath } from '@/lib/anime-url';
import { Suspense } from 'react';
import { DubbingSummary } from '@/components/DubbingSummary';
import { DubbingStatus } from '@/components/DubbingStatus';
import { WatchlistButton } from '@/components/Watchlist';
import Image from 'next/image';
import Link from '@/components/LocaleLink';
import { animeDescription, animeName, type AniListAnime } from '@/lib/anilist';
import { LocalizedSynopsis } from '@/components/LocalizedSynopsis';
import { getDictionary, type Locale } from '@/lib/i18n';
import { CatalogCardExtras } from '@/components/CatalogCardExtras';
import type { CatalogCardSummary } from '@/lib/catalog-card-summary';

export function CatalogCard({ anime, locale = 'en', initialSummary }: { anime: AniListAnime; locale?: Locale; initialSummary?: CatalogCardSummary }) {
  const d = getDictionary(locale);
  const name = animeName(anime);
  const cover = anime.coverImage?.large || anime.coverImage?.extraLarge;
  const format = d.catalog.formats[anime.format as keyof typeof d.catalog.formats] || anime.format || d.catalog.unknown;
  return <article className="anime-card catalog-card">
    <Link href={animePath(anime.id, name)} prefetch={false} className="poster" aria-label={name}>
      {cover ? <Image src={cover} alt={name} fill sizes="(max-width: 600px) 95px, 135px" /> : <span>{d.state.noPoster}</span>}
    </Link>
    <div className="card-body">
      <WatchlistButton id={`anilist:${anime.id}`} />
      <span className="type-label">{format}{anime.startDate?.year ? ` · ${anime.startDate.year}` : ''}</span>
      <h3><Link href={animePath(anime.id, name)} prefetch={false}>{name}</Link></h3>
      <LocalizedSynopsis anilistId={anime.id} key={locale} locale={locale} original={animeDescription(anime.description)} titles={[anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title))} year={anime.startDate?.year ?? undefined} kind={anime.format === 'MOVIE' ? 'movie' : 'tv'} />
      <Suspense fallback={<DubbingStatus malId={anime.idMal} locale={locale} />}><DubbingSummary malId={anime.idMal} locale={locale} /></Suspense>
      <CatalogCardExtras id={anime.id} malId={anime.idMal} name={name} score={anime.averageScore} locale={locale} initialSummary={initialSummary} />
      <Link href={animePath(anime.id, name)} prefetch={false} className="catalog-details">{d.catalog.details} →</Link>
    </div>
  </article>;
}
