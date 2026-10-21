import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale } from '@/lib/request-locale';
import { localePath } from '@/lib/locale-routing';
import { pageMetadata } from '@/lib/seo';
import { animeItemList, breadcrumbList } from '@/lib/structured-data';
import { getSeoWeek } from '@/lib/weekly-seo-data';
import { MIN_IMDB_VOTES, MIN_MAL_SCORED_BY } from '@/lib/weekly-rankings';
import { animePath } from '@/lib/anime-url';
import { formatWeek, isoWeek } from '@/lib/week';

type Props = { params: Promise<{ week: string; locale?: string }> };
export const revalidate = 900;
export const dynamic = 'error';
export const dynamicParams = true;
export function generateStaticParams() { return []; }
async function load(segment: string) {
  const slug = segment === 'this-week' ? formatWeek(isoWeek(new Date())) : segment;
  const data = await getSeoWeek(slug);
  if (!data || (!data.rankings.imdb.length && !data.rankings.mal.length)) notFound();
  return data;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week } = await params;
  const locale = await getRequestLocale(params);
  const data = await load(week);
  const d = getDictionary(locale).rankings;
  const title = (week === 'this-week' ? d.currentTitle : d.title).replace('{week}', data.week);
  const description = (week === 'this-week' ? d.currentDescription : d.description).replace('{week}', data.week);
  return pageMetadata(title, description, `/rankings/${week}`, localePath(`/rankings/${week}/opengraph-image`, locale), locale);
}
export default async function RankingsPage({ params }: Props) {
  const { week } = await params;
  const locale = await getRequestLocale(params);
  const data = await load(week);
  const d = getDictionary(locale);
  const heading = (week === 'this-week' ? d.rankings.currentTitle : d.rankings.title).replace('{week}', data.week);
  const path = `/rankings/${week}`;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return <main id="main" className="catalog-page" lang={locale}>
    <JsonLd data={breadcrumbList([{ name: d.landings.home, path: '/' }, { name: heading, path }], locale)} />
    <h1>{heading}</h1><p className="catalog-intro">{(week === 'this-week' ? d.rankings.currentDescription : d.rankings.description).replace('{week}', data.week)}</p>
    <p>{d.rankings.thresholds.replace('{imdb}', number.format(MIN_IMDB_VOTES)).replace('{mal}', number.format(MIN_MAL_SCORED_BY))}</p>
    <nav className="catalog-filters"><Link href={localePath(`/week/${data.week}`, locale)}>{d.landings.fullGuide}</Link><Link href={localePath('/', locale)}>{d.landings.home}</Link></nav>
    {(['imdb', 'mal'] as const).map(source => <section key={source} className="landing-day" aria-labelledby={`ranking-${source}`}>
      <h2 id={`ranking-${source}`}>{source === 'imdb' ? 'IMDb' : 'MyAnimeList'}</h2>
      <JsonLd data={animeItemList(data.rankings[source].map(entry => ({ name: entry.anime.name, anilistId: entry.anilistId })), locale, { name: `${heading} · ${source === 'imdb' ? 'IMDb' : 'MyAnimeList'}`, path: `${path}#ranking-${source}` })} />
      {data.rankings[source].length ? <ol className="landing-list">{data.rankings[source].map((entry, index) => <li key={entry.anilistId}>
        <span aria-hidden="true">{index + 1}. </span><Link href={localePath(animePath(entry.anilistId, entry.anime.name), locale)}>{entry.anime.name}</Link>
        {' · '}{number.format(entry.score)}/10{' · '}{d.rankings.votes.replace('{count}', number.format(entry.votes))}
      </li>)}</ol> : <p>{d.rankings.empty}</p>}
    </section>)}
  </main>;
}
