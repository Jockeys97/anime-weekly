import Link from 'next/link';
import { animeName, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { localePath } from '@/lib/locale-routing';
import type { Locale } from '@/lib/locales';
import { JsonLd } from '@/components/JsonLd';
import { animeItemList } from '@/lib/structured-data';
export function DiscoveryList({ title, intro, rule, path, items, locale }: {
  title: string; intro: string; rule: string; path: string; locale: Locale;
  items: { anime: AniListAnime; sources?: { name: string; score: number; votes: number }[] }[];
}) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  return <main id="main" className="catalog-page" lang={locale}>
    <JsonLd data={animeItemList(items.map(({ anime }) => ({ name: animeName(anime), anilistId: anime.id })), locale, { name: title, path })} />
    <h1>{title}</h1><p className="catalog-intro">{intro}</p><p>{rule}</p>
    <ol className="landing-list">{items.map(({ anime, sources }) => <li key={anime.id}>
      <h2><Link href={localePath(animePath(anime.id, animeName(anime)), locale)}>{animeName(anime)}</Link></h2>
      {anime.genres.length > 0 && <p>{anime.genres.join(' · ')}</p>}
      {sources?.length ? <p>{sources.map(source => `${source.name} ${number.format(source.score)}/10${source.votes > 0 ? ` (${number.format(source.votes)})` : ''}`).join(' · ')}</p> : null}
    </li>)}</ol>
  </main>;
}
