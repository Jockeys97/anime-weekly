import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { animeName } from '@/lib/anilist';
import { animeSlug } from '@/lib/anime-url';
import { getGenreLists } from '@/lib/discovery-data';
import { fill, genrePath } from '@/lib/discovery';
import { listMetadata } from '@/lib/discovery-seo';
import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import { DiscoveryList } from '@/components/DiscoveryList';
import { DiscoveryUnavailable } from '@/components/DiscoveryUnavailable';
import { MIN_IMDB_VOTES } from '@/lib/weekly-rankings';

type Props = { params: Promise<{ locale?: string; genre: string }> };
export const revalidate = 0;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
async function content(params: Props['params']) {
  await connection();
  const locale = await getRequestLocale(params);
  const { genre: slug } = await params;
  const data = await getGenreLists().catch(() => null);
  if (!data) return null;
  const list = data.lists.find(list => animeSlug(list.genre) === slug);
  if (!list?.items.length) notFound();
  const d = getDictionary(locale);
  const season = `${d.catalog.seasonNames[data.season.season]} ${data.season.year}`;
  return { ...list, locale, path: genrePath(list.genre), title: fill(d.discovery.genreTitle, { genre: list.genre, season }),
    intro: fill(d.discovery.genreIntro, { count: list.items.length, genre: list.genre, season, top: animeName(list.items[0].anime) }) };
}
export async function generateMetadata({ params }: Props) {
  const data = await content(params);
  if (!data) return { title: getDictionary(await getRequestLocale(params)).error.title, robots: { index: false, follow: true } };
  return listMetadata(data.title, data.intro, data.path, data.items.length, data.locale);
}
export default async function GenrePage({ params }: Props) {
  const data = await content(params);
  if (!data) return <DiscoveryUnavailable locale={await getRequestLocale(params)} path={`/best-this-season/${(await params).genre}`} />;
  return <DiscoveryList {...data} rule={fill(getDictionary(data.locale).discovery.genreRule, { count: MIN_IMDB_VOTES })} />;
}
