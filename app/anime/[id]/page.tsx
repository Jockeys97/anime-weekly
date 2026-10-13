import Image from 'next/image';
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { AnimeTrailer } from '@/components/AnimeTrailer';
import { RatingSummary } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { StreamingCountrySelector } from '@/components/StreamingCountry';
import { animeDescription, animeName, getAnime } from '@/lib/anilist';
import { getAnimeRatingsById } from '@/lib/anime-ratings';
import { getDictionary } from '@/lib/i18n';
import { isSeason, seasonPath } from '@/lib/season';
import type { AnimeAvailability } from '@/lib/tmdb';
import { getDetailAvailability } from '@/lib/detail-availability';
import type { Ratings } from '@/lib/ratings';

export const revalidate = 86400;

export default async function AnimePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const anime = await getAnime(Number(id));
  if (!anime) notFound();
  const d = getDictionary('it');
  const c = d.catalog;
  const name = animeName(anime);
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  // Start optional lookups together, but let the core anime page stream immediately.
  const animeRatings = getAnimeRatingsById(anime.idMal, anime.averageScore, revalidate);
  const availability = getDetailAvailability(anime);
  const cover = anime.coverImage?.extraLarge || anime.coverImage?.large;
  const format = c.formats[anime.format as keyof typeof c.formats] || anime.format || c.unknown;
  const status = c.statuses[anime.status as keyof typeof c.statuses] || c.unknown;
  const season = anime.season?.toLowerCase();
  const seasonal = anime.seasonYear && season && isSeason(season) ? { year: anime.seasonYear, season } : null;
  const date = anime.startDate;
  const startDate = date?.year ? [date.day && String(date.day).padStart(2, '0'), date.month && String(date.month).padStart(2, '0'), date.year].filter(Boolean).join('/') : c.unknown;
  return <main className="catalog-page" lang="it">
    <Link href="/season" prefetch={false} className="catalog-details">← {c.seasons}</Link>
    {anime.bannerImage && <div className="anime-banner"><Image src={anime.bannerImage} alt="" fill sizes="(max-width: 1280px) 100vw, 1160px" /></div>}
    <article className="anime-card anime-detail">
      <div className="poster">{cover ? <Image src={cover} alt={name} fill preload sizes="(max-width: 600px) 160px, 220px" /> : <span>{d.state.noPoster}</span>}</div>
      <div className="card-body">
        <span className="type-label">{format}{year ? ` · ${year}` : ''}</span>
        <h1>{name}</h1>
        {anime.title.romaji && anime.title.romaji !== name && <p className="catalog-intro">{anime.title.romaji}</p>}
        {anime.title.native && anime.title.native !== name && <p className="catalog-intro">{anime.title.native}</p>}
        <p className="synopsis detail-synopsis">{animeDescription(anime.description) || d.state.noSynopsis}</p>
        <Suspense fallback={<p className="detail-loading detail-loading-ratings" role="status">{c.loadingRatings}</p>}>
          <DetailRatings animeRatings={animeRatings} availability={availability} id={anime.id} name={name} />
        </Suspense>
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
    <AnimeTrailer trailer={anime.trailer} title={name} image={anime.bannerImage || cover} locale="it" />
    <section className="detail-streaming" aria-labelledby="streaming-heading">
      <h2 id="streaming-heading">{d.title.streaming}</h2>
      <StreamingCountrySelector locale="it" />
      <Suspense fallback={<p className="detail-loading" role="status">{c.loadingAvailability}</p>}>
        <DetailAvailability availability={availability} name={name} />
      </Suspense>
      <p className="catalog-intro">{c.availabilityNote}</p>
    </section>
  </main>;
}

async function DetailRatings({ animeRatings, availability, id, name }: {
  animeRatings: Promise<Ratings>; availability: Promise<AnimeAvailability>; id: number; name: string;
}) {
  const [scores, watch] = await Promise.all([animeRatings, availability]);
  return <RatingSummary ratings={{ ...watch.ratings, ...scores, anilistId: id }} title={name} locale="it" />;
}

async function DetailAvailability({ availability, name }: { availability: Promise<AnimeAvailability>; name: string }) {
  const watch = await availability;
  return <StreamingAvailability locale="it" collapsible={false} anime={{
    id: watch.match?.id ?? 0, kind: watch.match?.kind ?? 'tv', name,
    providers: watch.match ? watch.providers : {}, providersUnavailable: watch.providersUnavailable,
  }} />;
}
