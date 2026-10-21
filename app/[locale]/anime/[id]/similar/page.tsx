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

type Props = { params: Promise<{ locale?: string; id: string }> };
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
const load = cache(async (id: string) => {
  const numericId = parseAnimeId(id);
  if (!numericId) notFound();
  const anime = await getAnime(numericId);
  if (!anime) notFound();
  const [items, names] = await Promise.all([getSimilarAnime(anime), getAnimeLocalizedTitles(anime.id, animeName(anime))]);
  if (!items.length) notFound();
  return { anime, items, names };
});
async function content(params: Props['params']) {
  const locale = await getRequestLocale(params);
  const data = await load((await params).id);
  const name = data.names[locale] || animeName(data.anime);
  const d = getDictionary(locale);
  const seasons = [...new Set(data.items.map(({ anime }) => anime.season && anime.seasonYear ? `${d.catalog.seasonNames[anime.season.toLowerCase() as keyof typeof d.catalog.seasonNames]} ${anime.seasonYear}` : '').filter(Boolean))].join(' · ');
  return { ...data, locale, path: similarPath(data.anime.id, name), title: fill(d.discovery.similarTitle, { title: name }),
    intro: fill(d.discovery.similarIntro, { count: data.items.length, season: seasons, title: name, top: animeName(data.items[0].anime) }) };
}
export async function generateMetadata({ params }: Props) {
  const data = await content(params);
  const metadata = listMetadata(data.title, data.intro, data.path, data.items.length, data.locale);
  metadata.alternates!.languages = animeChildAlternates(data.anime, data.names, '/similar');
  return metadata;
}
export default async function SimilarPage({ params }: Props) {
  const data = await content(params);
  return <DiscoveryList {...data} rule={getDictionary(data.locale).discovery.similarRule} />;
}
