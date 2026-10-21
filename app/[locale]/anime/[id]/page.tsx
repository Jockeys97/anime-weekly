import { getRequestLocale } from '@/lib/request-locale';
import type { Metadata } from 'next';
import { Suspense, cache } from 'react';
import { notFound } from 'next/navigation';
import { animeLanguageAlternates, animePath, parseAnimeId } from '@/lib/anime-url';
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
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { pageMetadata, siteUrl } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { animeBreadcrumbs, animeStructuredData } from '@/lib/structured-data';
import { EpisodeRatingsChart } from '@/components/EpisodeRatingsChart';
import { getImdbEpisodeChart } from '@/lib/imdb-episode-index';
import { AnimeSimilarBlock, AnimeCurrentRanking } from '@/components/AnimeDiscoveryBlocks';
import { AnimeWeekLinks } from '@/components/AnimeWeekLinks';
import { animeIntro, animeScheduleSeo } from '@/lib/anime-seo';

export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
// A process-local throttle cannot guarantee a shared quota across build workers.
// Fifty details may also traverse prequels and fetch ratings. Skip build warming;
// an empty list enables on-demand ISR without spending the AniList build quota.
const loadAnime = cache(async (id: string) => {
  const numericId = parseAnimeId(id);
  if (numericId === null) notFound();
  const anime = await getAnime(numericId);
  if (!anime) notFound();
  return anime;
});
function localizedSynopsis(synopsis: SynopsisResult, locale: Locale): string {
  return synopsis.language === locale ? animeDescription(synopsis.synopsis) : '';
}
type Props = {
  params: Promise<{ id: string; locale?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getRequestLocale(params);
  const anime = await loadAnime((await params).id);
  const [names, { synopsis }] = await Promise.all([getAnimeLocalizedTitles(anime.id, animeName(anime)), getAnimeDetailData(anime, locale)]);
  const name = names[locale] || animeName(anime);
  const seo = animeScheduleSeo(name, anime, localizedSynopsis(synopsis, locale), locale);
  const metadata = pageMetadata(seo.title, seo.description, animePath(anime.id, name), anime.coverImage?.extraLarge || anime.coverImage?.large, locale);
  metadata.alternates!.languages = animeLanguageAlternates(anime.id, animeName(anime), names, siteUrl());
  return metadata;
}
export default async function AnimePage({ params }: Props) {
  const locale = await getRequestLocale(params);
  const anime = await loadAnime((await params).id);
  const [names, { ratings: animeRatings, availability, synopsis }] = await Promise.all([getAnimeLocalizedTitles(anime.id, animeName(anime)), getAnimeDetailData(anime, locale)]);
  const name = names[locale] || animeName(anime);
  // Other slugs and bare IDs render the same page with a canonical anime URL.
  // A redirect here would need searchParams (dynamic) inside an ISR, streamed route.
  const year = anime.startDate?.year ?? anime.seasonYear ?? undefined;
  const aliases = [anime.title.english, anime.title.romaji, anime.title.native].filter((title): title is string => Boolean(title));
  const structured = animeStructuredData(anime, name, animeScheduleSeo(name, anime, localizedSynopsis(synopsis, locale), locale).description, locale);
  return <><JsonLd data={structured} /><JsonLd data={animeBreadcrumbs(anime, name, locale)} />
    <AnimeDetailView anime={anime} localizedNames={names} weekLinks={<><Suspense fallback={null}><AnimeSimilarBlock anime={anime} name={name} locale={locale} /></Suspense><Suspense fallback={null}><AnimeCurrentRanking id={anime.id} locale={locale} /></Suspense><Suspense fallback={null}><AnimeWeekLinks id={anime.id} locale={locale} /></Suspense></>} intro={animeIntro(anime, { ...animeRatings, imdbRating: availability.ratings.imdbRating }, locale)}
      dubbing={<DubbingSummary malId={anime.idMal} locale={locale} followLocale />}
      synopsis={<LocalizedSynopsis followLocale initial={synopsis} retryMissing anilistId={anime.id} locale={locale} original={animeDescription(anime.description)} titles={aliases} year={year} kind={anime.format === 'MOVIE' ? 'movie' : 'tv'} className="synopsis detail-synopsis" />}
      imdb={<DetailImdbRating id={anime.id} availability={availability} name={name} locale={locale} />}
      ratings={<DetailAnimeRating animeRatings={animeRatings} id={anime.id} name={name} locale={locale} />}
      episodes={['TV', 'TV_SHORT', 'ONA'].includes(anime.format || '') ? <DetailEpisodeChart availability={Promise.resolve(availability)} name={name} /> : null}
      availability={Object.values(availability.providers).some(region => region?.providers.length) ? <DetailAvailability availability={availability} name={name} locale={locale} id={anime.id} /> : null} />
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
  if (!Number.isFinite(Number(watch.ratings.imdbRating)) || Number(watch.ratings.imdbRating) <= 0 || Number(watch.ratings.imdbRating) > 10) return null;
  return <ImdbRatingTile ratings={{ ...watch.ratings, anilistId: id }} title={name} locale={locale} followLocale autoLoad />;
}

function DetailAnimeRating({ animeRatings, id, name, locale }: {
  animeRatings: Ratings; id: number; name: string; locale: Locale;
}) {
  const scores = animeRatings;
  return <>{typeof scores.anilistScore === 'number' && scores.anilistScore > 0 && scores.anilistScore <= 100 && <AnimeRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale unavailableLabel="n/d" />}
    {typeof scores.malScore === 'number' && scores.malScore > 0 && scores.malScore <= 10 && <MyAnimeListRatingTile ratings={{ ...scores, anilistId: id }} title={name} locale={locale} followLocale eager />}</>;
}

function DetailAvailability({ availability, name, locale, id }: { availability: AnimeAvailability; name: string; locale: Locale; id: number }) {
  const watch = availability;
  return <StreamingAvailability locale={locale} followLocale collapsible={false} recoveryId={id} seriesWatch={watch.seriesWatch} anime={{
    id: watch.match?.id ?? 0, kind: watch.match?.kind ?? 'tv', name,
    providers: watch.providers, providersUnavailable: watch.providersUnavailable,
  }} />;
}
