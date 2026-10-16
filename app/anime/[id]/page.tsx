import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { DubbingSummary } from '@/components/DubbingSummary';
import { AnimeDetailView } from '@/components/AnimeDetailView';
import { LocalizedSynopsis } from '@/components/LocalizedSynopsis';
import { AnimeRatingTile, ImdbRatingTile, MyAnimeListRatingTile } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { getSynopsis } from '@/lib/synopsis';
import type { SynopsisResult } from '@/lib/synopsis-client';
import { animeDescription, animeName, getAnime } from '@/lib/anilist';
import { getAnimeRatingsById } from '@/lib/anime-ratings';
import type { Locale } from '@/lib/i18n';
import type { DetailAvailability as AnimeAvailability } from '@/lib/detail-availability';
import { getCachedDetailAvailability } from '@/lib/detail-availability';
import type { Ratings } from '@/lib/ratings';
import { pageMetadata, serializeJsonLd, siteUrl } from '@/lib/seo';
import { EpisodeRatingsChart } from '@/components/EpisodeRatingsChart';
import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';

export const revalidate = 86400;
// A process-local throttle cannot guarantee a shared quota across build workers.
// Fifty details may also traverse prequels and fetch ratings. Skip build warming;
// an empty list enables on-demand ISR without spending the AniList build quota.
const loadAnime = cache(async (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const anime = await getAnime(Number(id));
  if (!anime) notFound();
  return anime;
});
const loadSynopsis = cache(async (id: string) => {
  const anime = await loadAnime(id);
  const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
  return getSynopsis(aliases, anime.startDate?.year ?? anime.seasonYear ?? undefined, 'it', anime.format === 'MOVIE' ? 'movie' : 'tv', anime.id);
});
type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const anime = await loadAnime((await params).id);
  const name = animeName(anime);
  const synopsis = await loadSynopsis(String(anime.id));
  return pageMetadata(name, animeDescription(synopsis.synopsis || anime.description).replace(/\s+/g, ' ').slice(0, 155) || `Trama, valutazioni e dove guardare ${name} in streaming.`.slice(0, 155), `/anime/${anime.id}`, anime.coverImage?.extraLarge || anime.coverImage?.large);
}
export default async function AnimePage({ params }: Props) {
  const anime = await loadAnime((await params).id);
  const locale = 'it';
  const name = animeName(anime);
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
  const animeRatings = getAnimeRatingsById(anime.idMal, anime.averageScore, revalidate);
  const availability = getCachedDetailAvailability(anime);
  const synopsis = loadSynopsis(String(anime.id));
  const ratingCount = anime.stats?.scoreDistribution?.reduce((sum, bucket) => sum + bucket.amount, 0);
  const structured = {
    '@context': 'https://schema.org', '@type': anime.format === 'MOVIE' ? 'Movie' : 'TVSeries',
    name, url: new URL(`/anime/${anime.id}`, siteUrl()).href,
    description: animeDescription(anime.description), image: anime.coverImage?.extraLarge || anime.coverImage?.large || undefined,
    genre: anime.genres,
    ...(typeof anime.averageScore === 'number' && Number.isFinite(anime.averageScore) && anime.averageScore > 0 && anime.averageScore <= 100 ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: anime.averageScore, bestRating: 100, worstRating: 0,
        ...(Number.isSafeInteger(ratingCount) && ratingCount! > 0 ? { ratingCount } : {}) },
    } : {}),
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structured) }} />
    <AnimeDetailView anime={anime}
      dubbing={<DubbingSummary malId={anime.idMal} locale={locale} followLocale />}
      synopsis={<DetailSynopsis synopsis={synopsis} anime={anime} aliases={aliases} year={year} locale={locale} />}
      imdb={<DetailImdbRating id={anime.id} availability={availability} name={name} locale={locale} />}
      ratings={<DetailAnimeRating animeRatings={animeRatings} id={anime.id} name={name} locale={locale} />}
      episodes={['TV', 'TV_SHORT', 'ONA'].includes(anime.format || '') ? <DetailEpisodeChart availability={availability} name={name} /> : null}
      availability={<DetailAvailability availability={availability} name={name} locale={locale} id={anime.id} />} />
  </>;
}

async function DetailEpisodeChart({ availability, name }: { availability: Promise<AnimeAvailability>; name: string }) {
  const watch = await availability;
  const id = watch.episodeSeries?.imdbId || watch.ratings.imdbId;
  const initial = id ? await getImdbEpisodeChart(id) : { status: 'unavailable' as const, episodes: [] };
  return <EpisodeRatingsChart key={id || name} initial={initial} seriesId={id} seriesTitle={watch.episodeSeries?.title || watch.ratings.imdbSeriesTitle || name} />;
}

async function DetailImdbRating({ availability, name, locale, id }: {
  availability: Promise<AnimeAvailability>; name: string; locale: Locale; id: number;
}) {
  const watch = await availability;
  return <ImdbRatingTile ratings={{ ...watch.ratings, anilistId: id }} title={name} locale={locale} followLocale />;
}

async function DetailAnimeRating({ animeRatings, id, name, locale }: {
  animeRatings: Promise<Ratings>; id: number; name: string; locale: Locale;
}) {
  const scores = await animeRatings;
  return <><AnimeRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale />
    <MyAnimeListRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale /></>;
}

async function DetailAvailability({ availability, name, locale, id }: { availability: Promise<AnimeAvailability>; name: string; locale: Locale; id: number }) {
  const watch = await availability;
  return <StreamingAvailability locale={locale} followLocale collapsible={false} recoveryId={id} seriesWatch={watch.seriesWatch} anime={{
    id: watch.match?.id ?? 0, kind: watch.match?.kind ?? 'tv', name,
    providers: watch.providers, providersUnavailable: watch.providersUnavailable,
  }} />;
}

async function DetailSynopsis({ synopsis, anime, aliases, year, locale }: {
  synopsis: Promise<SynopsisResult>; anime: import('@/lib/anilist').AniListAnime; aliases: string[]; year?: number; locale: Locale;
}) {
  return <LocalizedSynopsis followLocale initial={await synopsis} anilistId={anime.id} key={locale} locale={locale} original={animeDescription(anime.description)} titles={aliases} year={year} kind={anime.format === 'MOVIE' ? 'movie' : 'tv'} className="synopsis detail-synopsis" />;
}
