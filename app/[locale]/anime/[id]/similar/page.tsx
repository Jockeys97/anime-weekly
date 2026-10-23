import { cache } from 'react';
import { notFound } from 'next/navigation';
import { animeName, getAnime } from '@/lib/anilist';
import { parseAnimeId } from '@/lib/anime-url';
import { getAnimeLocalizedTitles } from '@/lib/anime-localized-titles';
import { getSimilarAnime } from '@/lib/discovery-data';
import { fill, similarPath } from '@/lib/discovery';
import { animeChildAlternates, listMetadata } from '@/lib/discovery-seo';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { DiscoveryList } from '@/components/DiscoveryList';
import { DiscoveryUnavailable } from '@/components/DiscoveryUnavailable';

type Props = { params: Promise<{ locale?: string; id: string }> };
const SIMILAR_PAGE_LIMIT = 24;
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const maxDuration = 300;
export const preferredRegion = 'iad1';
export function generateStaticParams() { return []; }
const load = cache(async (id: string) => {
  const numericId = parseAnimeId(id);
  if (!numericId) notFound();
  const anime = await getAnime(numericId);
  if (!anime) notFound();
  const [items, names] = await Promise.all([getSimilarAnime(anime).catch(() => null), getAnimeLocalizedTitles(anime.id, animeName(anime))]);
  if (!items?.length) return null;
  return { anime, items: items.slice(0, SIMILAR_PAGE_LIMIT), names };
});
async function content(params: Props['params']) {
  const locale = await getRequestLocale(params);
  const data = await load((await params).id);
  if (!data) return null;
  const name = data.names[locale] || animeName(data.anime);
  const d = getDictionary(locale);
  return { ...data, locale, path: similarPath(data.anime.id, name), title: fill(d.discovery.similarTitle, { title: name }),
    intro: fill(d.discovery.similarIntro, { count: data.items.length, title: name, top: animeName(data.items[0].anime) }) };
}
export async function generateMetadata({ params }: Props) {
  const data = await content(params);
  if (!data) return { title: getDictionary(await getRequestLocale(params)).error.title, robots: { index: false, follow: true } };
  const metadata = listMetadata(data.title, data.intro, data.path, data.items.length, data.locale);
  metadata.alternates!.languages = animeChildAlternates(data.anime, data.names, '/similar');
  return metadata;
}
export default async function SimilarPage({ params }: Props) {
  const data = await content(params);
  if (!data) return <DiscoveryUnavailable locale={await getRequestLocale(params)} path={`/anime/${(await params).id}/similar`} />;
  return <DiscoveryList {...data} rule={getDictionary(data.locale).discovery.similarRule} cards />;
}
