import { getRequestLocale } from '@/lib/request-locale';
import { localePath } from '@/lib/locale-routing';
import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { DubbingSummary } from '@/components/DubbingSummary';
import { AnimeDetailView } from '@/components/AnimeDetailView';
import { LocalizedSynopsis } from '@/components/LocalizedSynopsis';
import { AnimeRatingTile, ImdbRatingTile, MyAnimeListRatingTile } from '@/components/RatingSummary';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import type { SynopsisResult } from '@/lib/synopsis-client';
import { animeDescription, animeName, getAnime } from '@/lib/anilist';
import { getAnimeDetailData } from '@/lib/anime-detail-data';
import type { Locale } from '@/lib/i18n';
import type { DetailAvailability as AnimeAvailability } from '@/lib/detail-availability';
import type { Ratings } from '@/lib/ratings';
import { pageMetadata, siteUrl } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { animeBreadcrumbs } from '@/lib/structured-data';
import { EpisodeRatingsChart } from '@/components/EpisodeRatingsChart';
import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { formatAnimeSeo } from '@/lib/anime-seo';

export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
// A process-local throttle cannot guarantee a shared quota across build workers.
// Fifty details may also traverse prequels and fetch ratings. Skip build warming;
// an empty list enables on-demand ISR without spending the AniList build quota.
const loadAnime = cache(async (id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const anime = await getAnime(Number(id));
  if (!anime) notFound();
  return anime;
});
function localizedSynopsis(synopsis: SynopsisResult, locale: Locale): string {
  return synopsis.language === locale ? animeDescription(synopsis.synopsis) : '';
}
type Props = { params: Promise<{ id: string; locale?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const anime = await loadAnime((await params).id);
  const name = animeName(anime);
  const { synopsis, availability } = await getAnimeDetailData(anime, locale);
  const seo = formatAnimeSeo(name, anime, localizedSynopsis(synopsis, locale), availability, locale);
  return pageMetadata(seo.title, seo.description, `/anime/${anime.id}`, anime.coverImage?.extraLarge || anime.coverImage?.large, locale);
}
export default async function AnimePage({ params }: Props) {
  const locale = await getRequestLocale(params);
  const anime = await loadAnime((await params).id);
  const name = animeName(anime);
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
  const { ratings: animeRatings, availability, synopsis } = await getAnimeDetailData(anime, locale);
  const ratingCount = anime.stats?.scoreDistribution?.reduce((sum, bucket) => sum + bucket.amount, 0);
  const structured = {
    '@context': 'https://schema.org', '@type': anime.format === 'MOVIE' ? 'Movie' : 'TVSeries',
    name, url: new URL(localePath(`/anime/${anime.id}`, locale), siteUrl()).href,
    description: formatAnimeSeo(name, anime, localizedSynopsis(synopsis, locale), undefined, locale).description, image: anime.coverImage?.extraLarge || anime.coverImage?.large || undefined,
    genre: anime.genres,
    ...(typeof anime.averageScore === 'number' && Number.isFinite(anime.averageScore) && anime.averageScore > 0 && anime.averageScore <= 100 ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: anime.averageScore, bestRating: 100, worstRating: 0,
        ...(Number.isSafeInteger(ratingCount) && ratingCount! > 0 ? { ratingCount } : {}) },
    } : {}),
  };
  return <><JsonLd data={structured} /><JsonLd data={animeBreadcrumbs(anime, name, locale)} />
    <AnimeDetailView anime={anime}
      dubbing={<DubbingSummary malId={anime.idMal} locale={locale} followLocale />}
      synopsis={<LocalizedSynopsis followLocale initial={synopsis} retryMissing anilistId={anime.id} locale={locale} original={animeDescription(anime.description)} titles={aliases} year={year} kind={anime.format === 'MOVIE' ? 'movie' : 'tv'} className="synopsis detail-synopsis" />}
      imdb={<DetailImdbRating id={anime.id} availability={availability} name={name} locale={locale} />}
      ratings={<DetailAnimeRating animeRatings={animeRatings} id={anime.id} name={name} locale={locale} />}
      episodes={['TV', 'TV_SHORT', 'ONA'].includes(anime.format || '') ? <DetailEpisodeChart availability={Promise.resolve(availability)} name={name} /> : null}
      availability={<DetailAvailability availability={availability} name={name} locale={locale} id={anime.id} />} />
  </>;
}

async function DetailEpisodeChart({ availability, name }: { availability: Promise<AnimeAvailability>; name: string }) {
  const watch = await availability;
  const id = watch.episodeSeries?.imdbId || watch.ratings.imdbId;
  const initial = id ? await getImdbEpisodeChart(id) : { status: 'unavailable' as const, episodes: [] };
  return <EpisodeRatingsChart key={id || name} initial={initial} seriesId={id} seriesTitle={watch.episodeSeries?.title || watch.ratings.imdbSeriesTitle || name} />;
}

function DetailImdbRating({ availability, name, locale, id }: {
  availability: AnimeAvailability; name: string; locale: Locale; id: number;
}) {
  const watch = availability;
  return <ImdbRatingTile ratings={{ ...watch.ratings, anilistId: id }} title={name} locale={locale} followLocale autoLoad />;
}

function DetailAnimeRating({ animeRatings, id, name, locale }: {
  animeRatings: Ratings; id: number; name: string; locale: Locale;
}) {
  const scores = animeRatings;
  return <><AnimeRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale unavailableLabel="n/d" />
    <MyAnimeListRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale eager /></>;
}

function DetailAvailability({ availability, name, locale, id }: { availability: AnimeAvailability; name: string; locale: Locale; id: number }) {
  const watch = availability;
  return <StreamingAvailability locale={locale} followLocale collapsible={false} recoveryId={id} seriesWatch={watch.seriesWatch} anime={{
    id: watch.match?.id ?? 0, kind: watch.match?.kind ?? 'tv', name,
    providers: watch.providers, providersUnavailable: watch.providersUnavailable,
  }} />;
}
