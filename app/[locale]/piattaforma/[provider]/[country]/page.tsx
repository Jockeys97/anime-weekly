import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
import Image from 'next/image';
import Link from '@/components/LocaleLink';
import { notFound } from 'next/navigation';
import { getPlatformAnime } from '@/lib/tmdb';
import { platformMapping, platformTitle } from '@/lib/platforms';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/JsonLd';
import { breadcrumbList, homeBreadcrumb } from '@/lib/structured-data';

type Props = { params: Promise<{ provider: string; country: string; locale?: string }> };
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
export async function generateMetadata({ params }: Props) {
  const { provider, country } = await params;
  const locale = await getRequestLocale(params); const d = getDictionary(locale).seo;
  const title = platformTitle(provider, country, locale);
  if (!title) notFound();
  return pageMetadata(title, `${title}. ${d.platformDescription}`, `/piattaforma/${provider}/${country}`, undefined, locale);
}
export default async function PlatformPage({ params }: Props) {
  const { provider, country } = await params;
  const locale = await getRequestLocale(params); const d = getDictionary(locale).seo;
  const mapping = platformMapping(provider, country);
  if (!mapping) notFound();
  const [data, snapshot] = await Promise.all([getPlatformAnime(mapping.provider.id, mapping.country.region, locale), readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date())))]);
  return <main className="catalog-page" lang={locale}><Link prefetch={false} href="/piattaforma">← {d.platformsTitle}</Link><h1>{platformTitle(provider, country, locale)}</h1>
    <JsonLd data={breadcrumbList([homeBreadcrumb, { name: locale === 'it' ? 'Piattaforme' : d.platformsTitle, path: '/piattaforma' }, { name: platformTitle(provider, country, locale)!, path: `/piattaforma/${provider}/${country}` }], locale)} />
    <p className="catalog-intro">{d.platformDescription}</p>
    {data.status === 'ready' && data.titles.length ? <div className="anime-grid">{data.titles.map(anime => {
      // Cache-only exact TMDB ID mapping. Never perform title/rating searches here.
      const href = animeDetailLink({ name: anime.name, ratings: snapshot.titles[`${anime.kind}:${anime.id}`] || {} });
      return <article className="anime-card" key={`${anime.kind}:${anime.id}`}><Link className="poster" prefetch={false} href={href}>{anime.poster && <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 600px) 160px, 220px" />}</Link><div className="card-body"><h2><Link prefetch={false} href={href}>{anime.name}</Link></h2><p className="synopsis">{anime.overview}</p></div></article>;
    })}</div> : <p role="status">{data.status === 'ready' ? d.platformEmpty : d.platformUnavailable}</p>}
  </main>;
}
