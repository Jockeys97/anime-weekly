'use client';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import Image from 'next/image';
import Link from '@/components/LocaleLink';
import { AnimeActions } from '@/components/AnimeActions';
import { VisitorDate } from '@/components/VisitorTime';
import { AnimeTrailer } from '@/components/AnimeTrailer';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
import { isSeason, seasonPath } from '@/lib/season';
import type { AniListAnime } from '@/lib/anilist';
import { episodePath } from '@/lib/discovery';
import { animeHeading, nextAnimeEpisode } from '@/lib/anime-seo';
import { animeAlternateNames } from '@/lib/anime-titles';
import { displayTitle } from '@/lib/title-text';
import { DubbingStatus } from '@/components/DubbingStatus';
import { EpisodeChartLoading } from '@/components/EpisodeRatingsChart';
import { detailDesktopMedia, detailMobileMedia, emptyDetailImage, useDetailMobileViewport } from '@/lib/detail-viewport';

export function AnimeDetailView({ anime, synopsis, imdb, ratings, availability, episodes, dubbing, intro, weekLinks, localizedNames }: {
  anime: AniListAnime; synopsis: ReactNode; imdb: ReactNode; ratings: ReactNode; availability: ReactNode; episodes?: ReactNode; dubbing?: ReactNode; intro?: string; weekLinks?: ReactNode; localizedNames?: Partial<Record<import('@/lib/locales').Locale, string>>;
}) {
  const locale = useLocale();
  const mobile = useDetailMobileViewport();
  const d = getDictionary(locale);
  const c = d.catalog;
  const name = localizedNames?.[locale] || displayTitle([anime.title.english, anime.title.romaji].find(title => title?.trim() && !/[\u3040-\u30ff\u3400-\u9fff]/.test(title)) || `Anime #${anime.id}`);
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const alternateNames = animeAlternateNames(name, anime.title, anime.synonyms);
  const cover = anime.coverImage?.large || anime.coverImage?.extraLarge;
  // AniList large is ~230px wide; extraLarge is ~460px. Let DPR choose the
  // larger original only when needed, without creating Vercel transformations.
  const coverSources = anime.coverImage?.large && anime.coverImage?.extraLarge
    ? `${anime.coverImage.large} 230w, ${anime.coverImage.extraLarge} 460w` : undefined;
  const format = c.formats[anime.format as keyof typeof c.formats] || anime.format || c.unknown;
  const status = c.statuses[anime.status as keyof typeof c.statuses] || c.unknown;
  const season = anime.season?.toLowerCase();
  const seasonal = anime.seasonYear && season && isSeason(season) ? { year: anime.seasonYear, season } : null;
  const date = anime.startDate;
  const next = nextAnimeEpisode(anime);
  const startDate = date?.year && date.month && date.day ? <VisitorDate value={`${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`} /> : date?.year ?? c.unknown;
  return <main className="catalog-page" lang={locale}>
    <Link href="/season" prefetch={false} className="catalog-details">← {c.seasons}</Link>
    {/* Start the mobile LCP at high priority before hydration, using the same cover candidates. */}
    {anime.bannerImage && cover && <link rel="preload" as="image" href={cover} imageSrcSet={coverSources} imageSizes="(max-width: 600px) 160px, 220px" media={detailMobileMedia} fetchPriority="high" />}
    {/* Picture keeps the banner URL out of mobile requests, including the preload scanner. */}
    {anime.bannerImage && <div className="anime-banner"><picture>
      <source media={detailDesktopMedia} srcSet={anime.bannerImage} />
      <img src={emptyDetailImage} alt="" loading="eager" fetchPriority="high" sizes="100vw" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </picture>
    </div>}
    <article className="anime-card anime-detail">
      <div className="poster">{cover ? <picture style={{ position: 'absolute', inset: 0 }}>{coverSources && <source srcSet={coverSources} sizes="(max-width: 600px) 160px, 220px" />}<Image src={cover} alt={name} fill unoptimized loading="eager" fetchPriority={anime.bannerImage && !mobile ? "auto" : "high"} sizes="(max-width: 600px) 160px, 220px" /></picture> : <span>{d.state.noPoster}</span>}</div>
      <div className="card-body">
        <span className="type-label">{format}{year ? ` · ${year}` : ''}</span>
        <h1>{animeHeading(name, anime, locale)}</h1>
        {alternateNames.length > 0 && <p className="catalog-intro">{alternateNames.join(' · ')}</p>}
        {intro && <p className="catalog-intro">{intro}</p>}
        <AnimeActions watchlistId={`anilist:${anime.id}`} animeId={anime.id} locale={locale} placement="detail" />
        {synopsis}
        <dl className="ratings">{imdb}{ratings}</dl>
        <Suspense fallback={<DubbingStatus malId={anime.idMal} locale={locale} followLocale />}>{dubbing}</Suspense>
        <dl className="detail-facts">
          {anime.format && <div><dt>{c.format}</dt><dd>{format}</dd></div>}
          {anime.status && <div><dt>{c.status}</dt><dd>{status}</dd></div>}
          {next && <div><dt>{d.discovery.next}</dt><dd><Link href={episodePath(anime.id, name, next.episode)}>{d.discovery.episode.replace('{n}', String(next.episode))}</Link> · <VisitorDate value={next.date.toISOString()} /></dd></div>}
          {anime.episodes != null && anime.episodes > 0 && <div><dt>{c.episodes}</dt><dd>{anime.episodes}</dd></div>}
          {date?.year && <div><dt>{c.startDate}</dt><dd>{startDate}</dd></div>}
          {Boolean(anime.studios?.nodes.length) && <div><dt>{c.studios}</dt><dd>{anime.studios!.nodes.map(studio => studio.name).join(', ')}</dd></div>}
          {Boolean(anime.genres?.length) && <div><dt>{c.genres}</dt><dd>{anime.genres.join(', ')}</dd></div>}
          {seasonal && <div><dt>{c.season}</dt><dd><Link prefetch={false} href={seasonPath(seasonal)}>{c.seasonNames[seasonal.season]} {seasonal.year}</Link></dd></div>}
        </dl>
        <a className="catalog-details" href={`https://anilist.co/anime/${anime.id}`} target="_blank" rel="noopener noreferrer">{c.source} ↗</a>
      </div>
    </article>
    {weekLinks}
    {episodes && <Suspense fallback={<EpisodeChartLoading />}>{episodes}</Suspense>}
    <AnimeTrailer trailer={anime.trailer} title={name} image={anime.bannerImage || cover} mobileImage={anime.bannerImage ? cover || emptyDetailImage : undefined} locale={locale} />
    {availability && <section className="detail-streaming" aria-labelledby="streaming-heading">
      <h2 id="streaming-heading">{d.title.streaming}</h2>
      <StreamingCountrySelector locale={locale} />
      {availability}
      <p className="catalog-intro">{c.availabilityNote}</p>
    </section>}
  </main>;
}
