import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { animeName } from '@/lib/anilist';
import { getAnimeWithSnapshot } from '@/lib/anilist-resilient';
import { softLookup } from '@/lib/soft-failure';
import { DetailTemporarilyUnavailable } from '@/components/DetailTemporarilyUnavailable';
import { animePath, parseAnimeId } from '@/lib/anime-url';
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { getAnimeEpisodes } from '@/lib/episode-data';
import { episodePath, episodeTitle, fill, parseEpisode } from '@/lib/discovery';
import { animeChildAlternates } from '@/lib/discovery-seo';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { pageMetadata } from '@/lib/seo';
import { localePath } from '@/lib/locale-routing';
import { getAnimeDetailData } from '@/lib/anime-detail-data';
import { getEpisodeIndexedScore } from '@/lib/episode-score';
import { EpisodeReleaseTime } from '@/components/EpisodeReleaseTime';
import { StreamingAvailability } from '@/components/StreamingAvailability';
import { JsonLd } from '@/components/JsonLd';
import { episodeStructuredData } from '@/lib/structured-data';

type Props = { params: Promise<{ locale?: string; id: string; episode: string }> };
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
const load = cache(async (id: string, segment: string) => {
  const numericId = parseAnimeId(id), n = parseEpisode(segment);
  if (!numericId || !n) notFound();
  const anime = await softLookup(() => getAnimeWithSnapshot(numericId), { id: numericId, episode: n });
  if (anime === undefined) return null;
  if (!anime) notFound();
  const [episodes, names] = await Promise.all([getAnimeEpisodes(anime, n), getAnimeLocalizedTitles(anime.id, animeName(anime))]);
  const event = episodes.find(e => e.episode === n);
  if (!event) notFound();
  return { anime, episodes, names, event };
});
export async function generateMetadata({ params }: Props) {
  const { id, episode } = await params;
  const locale = await getRequestLocale(params);
  const loaded = await load(id, episode);
  if (!loaded) return { title: getDictionary(locale).error.title, robots: { index: false, follow: true } };
  const { anime, names, event } = loaded;
  const name = names[locale] || animeName(anime);
  const title = episodeTitle(name, event.episode, locale);
  const metadata = pageMetadata(title, `${title}. ${new Date(event.airingAt * 1000).toISOString()} (UTC).`, episodePath(anime.id, name, event.episode), anime.coverImage?.large, locale);
  metadata.alternates!.languages = animeChildAlternates(anime, names, `/episode-${event.episode}`);
  return metadata;
}
export default async function EpisodePage({ params }: Props) {
  const { id, episode } = await params;
  const locale = await getRequestLocale(params);
  const loaded = await load(id, episode);
  if (!loaded) return <DetailTemporarilyUnavailable locale={locale} />;
  const { anime, episodes, names, event } = loaded;
  const name = names[locale] || animeName(anime), d = getDictionary(locale);
  const { availability } = await getAnimeDetailData(anime, locale);
  const score = await getEpisodeIndexedScore(availability, event).catch(() => null);
  const title = episodeTitle(name, event.episode, locale);
  const providers = Object.values(availability.providers).some(region => region?.providers.length) || Object.values(availability.seriesWatch?.providers ?? {}).some(region => region?.providers.length);
  return <main id="main" className="catalog-page" lang={locale}>
    <JsonLd data={episodeStructuredData(anime, name, event, locale, score)} />
    <h1>{title}</h1>
    <p>{d.discovery.release}: <EpisodeReleaseTime airingAt={event.airingAt} locale={locale} /></p>
    <p><Link href={localePath(animePath(anime.id, name), locale)}>{d.discovery.anime}: {name}</Link></p>
    {score && <p><a href={`https://www.imdb.com/title/${score.imdbId}/`} rel="noopener noreferrer" target="_blank">IMDb {score.score}/10</a> · {d.rankings.votes.replace('{count}', new Intl.NumberFormat(locale).format(score.votes))}</p>}
    {providers && <section className="detail-streaming"><h2>{d.title.streaming}</h2><StreamingAvailability locale={locale} collapsible={false} seriesWatch={availability.seriesWatch} anime={{ id: availability.match?.id ?? 0, kind: availability.match?.kind ?? 'tv', name, providers: availability.providers, providersUnavailable: availability.providersUnavailable }} /></section>}
    <nav className="catalog-filters">{[-1, 1].map(offset => {
      const adjacent = episodes.find(e => e.episode === event.episode + offset);
      return adjacent ? <Link key={offset} href={localePath(episodePath(anime.id, name, adjacent.episode), locale)}>{offset < 0 ? d.discovery.previous : d.discovery.next}: {fill(d.discovery.episode, { n: adjacent.episode })}</Link> : null;
    })}</nav>
  </main>;
}
