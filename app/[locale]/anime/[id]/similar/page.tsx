import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { localePath } from '@/lib/locale-routing';
import { animeName } from '@/lib/anilist';
import { getAnimeWithSnapshot } from '@/lib/anilist-resilient';
import { softFailureMetadata, softLookup } from '@/lib/soft-failure';
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
export const revalidate = 86400;
export const dynamicParams = true;
export const maxDuration = 30;
export const preferredRegion = 'iad1';
export function generateStaticParams() { return []; }
const load = cache(async (id: string) => {
  const numericId = parseAnimeId(id);
  if (!numericId) notFound();
  const anime = await softLookup(() => getAnimeWithSnapshot(numericId), { id: numericId, page: 'similar' });
  if (anime === undefined) return null;
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
  if (!data) return softFailureMetadata(getDictionary(await getRequestLocale(params)).error.title);
  const metadata = listMetadata(data.title, data.intro, data.path, data.items.length, data.locale);
  metadata.alternates!.languages = animeChildAlternates(data.anime, data.names, '/similar');
  return metadata;
}
export default async function SimilarPage({ params }: Props) {
  const data = await content(params);
  if (!data) return <DiscoveryUnavailable locale={await getRequestLocale(params)} path={`/anime/${(await params).id}/similar`} />;
  // Wrong-slug variants 308 to this locale's canonical similar URL.
  const segment = (await params).id;
  let decoded = segment; try { decoded = decodeURIComponent(segment); } catch {}
  if (data.path !== `/anime/${decoded}/similar`) permanentRedirect(localePath(data.path, data.locale));
  return <DiscoveryList {...data} rule={getDictionary(data.locale).discovery.similarRule} cards />;
}
