import { animeName, type AniListAnime } from '@/lib/anilist';
import { animePath } from '@/lib/anime-url';
import { localePath } from '@/lib/locale-routing';
import type { Locale } from '@/lib/locales';
import { JsonLd } from '@/components/JsonLd';
import { animeItemList } from '@/lib/structured-data';
import { getDictionary } from '@/lib/i18n';
import { LandingCard } from '@/components/LandingCard';
export function DiscoveryList({ title, intro, rule, path, items, locale, cards = false }: {
  title: string; intro: string; rule: string; path: string; locale: Locale;
  cards?: boolean;
  items: { anime: AniListAnime; score?: number; sources?: { name: string; score: number; votes: number }[] }[];
}) {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const votes = new Intl.NumberFormat(locale);
  const d = getDictionary(locale);
  return <main id="main" className={`catalog-page${cards ? '' : ' genre-ranking-page'}`} lang={locale}>
    <JsonLd data={animeItemList(items.map(({ anime }) => ({ name: animeName(anime), anilistId: anime.id })), locale, { name: title, path })} />
    {!cards && <nav className="genre-ranking-back"><a href={localePath('/best-this-season', locale)}>← {d.explore.allGenres}</a></nav>}
    <h1>{title}</h1><p className="catalog-intro">{intro}</p><p className={cards ? undefined : 'notice genre-ranking-rule'}>{rule}</p>
    <ol className={cards ? 'landing-list detail-discovery-cards' : 'landing-list genre-ranking-list'}>{items.map(({ anime, sources, score }, index) => <li key={anime.id}>
      {cards ? <LandingCard locale={locale} href={localePath(animePath(anime.id, animeName(anime)), locale)} name={animeName(anime)}
        poster={anime.coverImage?.large || anime.coverImage?.extraLarge || null} compact headingLevel={2}
        ratings={anime.genres.join(' · ')} primary={null} others={[]} /> : <LandingCard locale={locale} headingLevel={2}
        href={localePath(animePath(anime.id, animeName(anime)), locale)} name={animeName(anime)}
        poster={anime.coverImage?.large || anime.coverImage?.extraLarge || null}
        badge={<span className="landing-rank">{String(index + 1).padStart(2, '0')}</span>}
        typeLabel={anime.format?.replaceAll('_', ' ')} genres={anime.genres}
        ratings={(sources || []).map(source => `${source.name} ${number.format(source.score)}/10${source.votes > 0 ? ` · ${d.rankings.votes.replace('{count}', votes.format(source.votes))}` : ''}`).join(' · ')}
        aside={typeof score === 'number' && Number.isFinite(score) ? <strong>{number.format(score)}<small> / 10</small></strong> : null}
        primary={null} others={[]} />}
    </li>)}</ol>
  </main>;
}
