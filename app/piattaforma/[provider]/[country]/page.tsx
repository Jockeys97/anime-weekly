import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlatformAnime } from '@/lib/tmdb';
import { platformMapping, platformTitle } from '@/lib/platforms';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { readWeeklyRatingsSnapshot } from '@/lib/weekly-ratings';
import { formatWeek, isoWeek } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';

type Props = { params: Promise<{ provider: string; country: string }> };
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() { return []; }
export async function generateMetadata({ params }: Props) {
  const { provider, country } = await params;
  const title = platformTitle(provider, country);
  if (!title) notFound();
  return pageMetadata(title, `${title}: scopri serie e film anime giapponesi disponibili in streaming, ordinati per popolarità.`, `/piattaforma/${provider}/${country}`);
}
export default async function PlatformPage({ params }: Props) {
  const { provider, country } = await params;
  const mapping = platformMapping(provider, country);
  if (!mapping) notFound();
  const [data, snapshot] = await Promise.all([getPlatformAnime(mapping.provider.id, mapping.country.region), readWeeklyRatingsSnapshot(formatWeek(isoWeek(new Date())))]);
  return <main className="catalog-page" lang="it"><Link prefetch={false} href="/piattaforma">← Piattaforme e paesi</Link><h1>{platformTitle(provider, country)}</h1>
    <p className="catalog-intro">Serie e film anime giapponesi ordinati per popolarità. La disponibilità del catalogo può cambiare. Dati TMDB / JustWatch.</p>
    {data.status === 'ready' && data.titles.length ? <div className="anime-grid">{data.titles.map(anime => {
      // Cache-only exact TMDB ID mapping. Never perform title/rating searches here.
      const href = animeDetailLink({ name: anime.name, ratings: snapshot.titles[`${anime.kind}:${anime.id}`] || {} });
      return <article className="anime-card" key={`${anime.kind}:${anime.id}`}><Link className="poster" prefetch={false} href={href}>{anime.poster && <Image src={`https://image.tmdb.org/t/p/w500${anime.poster}`} alt={anime.name} fill sizes="(max-width: 600px) 160px, 220px" />}</Link><div className="card-body"><h2><Link prefetch={false} href={href}>{anime.name}</Link></h2><p className="synopsis">{anime.overview}</p></div></article>;
    })}</div> : <p role="status">{data.status === 'ready' ? 'Nessun anime disponibile per questa piattaforma e questo paese.' : 'Il catalogo non è al momento disponibile. Riprova più tardi.'}</p>}
  </main>;
}
