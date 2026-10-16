'use client';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimeActions } from '@/components/AnimeActions';
import { VisitorDate } from '@/components/VisitorTime';
import { AnimeTrailer } from '@/components/AnimeTrailer';
import { AnimeRatingTile, ImdbRatingTile, MyAnimeListRatingTile } from '@/components/RatingSummary';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { isSeason, seasonPath } from '@/lib/season';
import type { AniListAnime } from '@/lib/anilist';
import { displayTitle } from '@/lib/title-text';
import { EpisodeChartLoading } from '@/components/EpisodeRatingsChart';

export function AnimeDetailView({ anime, synopsis, imdb, ratings, availability, episodes }: {
  anime: AniListAnime; synopsis: ReactNode; imdb: ReactNode; ratings: ReactNode; availability: ReactNode; episodes?: ReactNode;
}) {
  const locale = useLocale();
  const d = getDictionary(locale);
  const c = d.catalog;
  const name = displayTitle([anime.title.english, anime.title.romaji].find(title => title?.trim() && !/[\u3040-\u30ff\u3400-\u9fff]/.test(title)) || `Anime #${anime.id}`);
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const cover = anime.coverImage?.extraLarge || anime.coverImage?.large;
  const format = c.formats[anime.format as keyof typeof c.formats] || anime.format || c.unknown;
  const status = c.statuses[anime.status as keyof typeof c.statuses] || c.unknown;
  const season = anime.season?.toLowerCase();
  const seasonal = anime.seasonYear && season && isSeason(season) ? { year: anime.seasonYear, season } : null;
  const date = anime.startDate;
  const startDate = date?.year && date.month && date.day ? <VisitorDate value={`${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`} /> : date?.year ?? c.unknown;
  return <main className="catalog-page" lang={locale}>
    <Link href="/season" prefetch={false} className="catalog-details">← {c.seasons}</Link>
    {anime.bannerImage && <div className="anime-banner"><Image src={anime.bannerImage} alt="" fill unoptimized sizes="(max-width: 1280px) 100vw, 1160px" /></div>}
    <article className="anime-card anime-detail">
      <div className="poster">{cover ? <Image src={cover} alt={name} fill unoptimized preload sizes="(max-width: 600px) 160px, 220px" /> : <span>{d.state.noPoster}</span>}</div>
      <div className="card-body">
        <span className="type-label">{format}{year ? ` · ${year}` : ''}</span>
        <h1>{name}</h1>
        <AnimeActions watchlistId={`anilist:${anime.id}`} animeId={anime.id} locale={locale} placement="detail" />
        {anime.title.romaji && anime.title.romaji !== name && !/[\u3040-\u30ff\u3400-\u9fff]/.test(anime.title.romaji) && <p className="catalog-intro">{anime.title.romaji}</p>}
        <Suspense fallback={<p className="synopsis detail-synopsis" role="status">{d.language.loadingSynopsis}</p>}>
          {synopsis}
        </Suspense>
        <dl className="ratings">
          <Suspense fallback={<ImdbRatingTile ratings={{}} title={name} locale={locale} pending />}>
            {imdb}
          </Suspense>
          <Suspense fallback={<><AnimeRatingTile ratings={{ anilistId: anime.id, anilistScore: anime.averageScore }} title={name} locale={locale} />
            <MyAnimeListRatingTile ratings={{ malId: anime.idMal ?? undefined }} title={name} locale={locale} pending /></>}>
            {ratings}
          </Suspense>
        </dl>
        <dl className="detail-facts">
          <div><dt>{c.format}</dt><dd>{format}</dd></div>
          <div><dt>{c.status}</dt><dd>{status}</dd></div>
          <div><dt>{c.episodes}</dt><dd>{anime.episodes ?? c.unknown}</dd></div>
          <div><dt>{c.startDate}</dt><dd>{startDate}</dd></div>
          <div><dt>{c.studios}</dt><dd>{anime.studios?.nodes.map(studio => studio.name).join(', ') || c.unknown}</dd></div>
          <div><dt>{c.genres}</dt><dd>{anime.genres?.join(', ') || c.unknown}</dd></div>
          {seasonal && <div><dt>{c.season}</dt><dd><Link prefetch={false} href={seasonPath(seasonal)}>{c.seasonNames[seasonal.season]} {seasonal.year}</Link></dd></div>}
        </dl>
        <a className="catalog-details" href={`https://anilist.co/anime/${anime.id}`} target="_blank" rel="noopener noreferrer">{c.source} ↗</a>
      </div>
    </article>
    {episodes && <Suspense fallback={<EpisodeChartLoading />}>{episodes}</Suspense>}
    <AnimeTrailer trailer={anime.trailer} title={name} image={anime.bannerImage || cover} locale={locale} />
    <section className="detail-streaming" aria-labelledby="streaming-heading">
      <h2 id="streaming-heading">{d.title.streaming}</h2>
      <StreamingCountrySelector locale={locale} />
      <Suspense fallback={<p className="detail-loading" role="status">{c.loadingAvailability}</p>}>
        {availability}
      </Suspense>
      <p className="catalog-intro">{c.availabilityNote}</p>
    </section>
  </main>;
}
